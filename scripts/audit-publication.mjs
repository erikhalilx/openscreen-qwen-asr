// Reject private device details, credentials and model/runtime artifacts before publication.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

const git = (...args) => execFileSync("git", args, { maxBuffer: 256 * 1024 * 1024 });
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const genericAccounts = new Set(["runner", "root", "user", "ubuntu", "admin", "codex"]);
const privateMarkers = [
	...(genericAccounts.has(os.userInfo().username) ? [] : [os.homedir()]),
	...(process.env.OPENSCREEN_PRIVATE_MARKERS ?? "").split("|").filter(Boolean),
];
const username = os.userInfo().username;
const usernamePattern = new RegExp(`\\b${escaped(username)}(?![A-Za-z0-9_])`, "i");
const privateEmail = /[A-Za-z0-9._%+-]+@(?:163\.com|qq\.com|126\.com)/i;
const credential =
	/(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const forbidden =
	/(?:^|\/)(?:\.research|\.venv-qwen|\.local-models|node_modules|dist-electron|release|build-licenses|runtime)(?:\/|$)|(?:^|\/)qwen\.local\.json$|\.(?:safetensors|gguf|pt|pth|p12|pfx|pem|key|dmg|session\.json|mp4\.cursor\.json)$|(?:^|\/)recording-\d+-(?:system|microphone)\.m4a$/i;
const failures = new Set();
function inspect(name, content) {
	if (forbidden.test(name) || (/(?:^|\/)\.env(?:\.|$)/.test(name) && !name.endsWith(".example")))
		failures.add(`excluded artifact: ${name}`);
	const text = content.toString("utf8");
	if (
		privateMarkers.some((marker) => marker.length > 3 && text.includes(marker)) ||
		(!genericAccounts.has(username) && usernamePattern.test(text)) ||
		privateEmail.test(text)
	)
		failures.add(`private device/identity marker: ${name}`);
	const examples = new Set([
		"me",
		"example",
		"alice",
		"someone",
		"user",
		"u",
		"runner",
		"username",
	]);
	if (
		[...text.matchAll(/\/(?:Users|home)\/([A-Za-z0-9_.-]+)\//g)].some(
			(match) => !examples.has(match[1]),
		)
	) {
		failures.add(`non-example user home path: ${name}`);
	}
	if (credential.test(text)) failures.add(`possible credential: ${name}`);
}
const refIndex = process.argv.indexOf("--ref");
if (refIndex !== -1) {
	const ref = process.argv[refIndex + 1];
	if (!ref || ref.startsWith("-")) throw new Error("--ref requires a Git revision");
	// The unmodified public upstream ancestry is preserved, not rewritten. Inspect the full
	// fork history (including removed files), plus every file in the published snapshot.
	const base = "d8889c626f859e0be8f4f87fdffc7362629550bc";
	git("merge-base", "--is-ancestor", base, ref);
	const objects = new Map();
	for (const line of git("rev-list", "--objects", ref, `^${base}`).toString().trim().split("\n")) {
		const space = line.indexOf(" ");
		if (space > 0) objects.set(line.slice(0, space), line.slice(space + 1));
	}
	for (const line of git("ls-tree", "-r", ref).toString().trim().split("\n")) {
		const match = line.match(/^\d+ blob ([a-f0-9]+)\t(.+)$/);
		if (match) objects.set(match[1], match[2]);
	}
	const checks = execFileSync("git", ["cat-file", "--batch-check=%(objectname) %(objecttype)"], {
		input: [...objects.keys()].join("\n") + "\n",
		maxBuffer: 64 * 1024 * 1024,
	})
		.toString()
		.trim()
		.split("\n");
	for (const check of checks) {
		const [oid, type] = check.split(" ");
		if (type === "blob") inspect(objects.get(oid), git("cat-file", "blob", oid));
	}
	inspect("fork commit metadata", git("log", "--format=fuller", `${base}..${ref}`));
} else {
	const names = git("ls-files", "-z", "--cached", "--others", "--exclude-standard")
		.toString()
		.split("\0")
		.filter(Boolean);
	for (const name of new Set(names))
		if (fs.existsSync(name) && fs.statSync(name).isFile()) inspect(name, fs.readFileSync(name));
}
if (failures.size) {
	console.error([...failures].join("\n"));
	process.exitCode = 1;
} else {
	console.log(
		"Publication audit passed: no private markers, credential signatures or excluded model/runtime artifacts found in the inspected source/history.",
	);
}
