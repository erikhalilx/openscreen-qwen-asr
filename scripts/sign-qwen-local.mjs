// Keep one local signing identity across personal builds. Private key material stays in the
// user's dedicated keychain, outside the repository. This is not a Developer ID distribution.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = path.join(
	os.homedir(),
	"Library/Application Support/OpenScreen Qwen/Local Signing",
);
const keychain = path.join(directory, "signing.keychain-db");
const passwordFile = path.join(directory, "keychain-password");
const certificate = path.join(directory, "local.crt");
const app = path.resolve(process.argv[2] ?? "");
if (!process.argv[2] || !existsSync(path.join(app, "Contents/Info.plist"))) {
	throw new Error("Pass the built OpenScreen Qwen.app path");
}
if (![keychain, passwordFile, certificate].every(existsSync)) {
	throw new Error(
		"No persistent local signing identity. Configure a code-signing certificate first; do not silently replace it with an ad-hoc signature.",
	);
}
function run(command, args) {
	const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}`);
	return result.stdout.trim();
}
run("/usr/bin/security", ["unlock-keychain", "-p", readFileSync(passwordFile, "utf8"), keychain]);
const fingerprint = run("openssl", ["x509", "-in", certificate, "-noout", "-fingerprint", "-sha1"])
	.split("=")
	.at(-1)
	.replaceAll(":", "");
const entitlements = path.resolve("macos.entitlements");
const sign = (file) =>
	run("/usr/bin/codesign", [
		"--force",
		"--keychain",
		keychain,
		"--sign",
		fingerprint,
		"--timestamp=none",
		"--options",
		"runtime",
		"--entitlements",
		entitlements,
		file,
	]);
const bundles = [];
function visit(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const file = path.join(directory, entry.name);
		if (entry.isSymbolicLink()) continue;
		if (entry.isDirectory()) {
			visit(file);
			if (entry.name.endsWith(".app") || entry.name.endsWith(".framework")) bundles.push(file);
		} else {
			// Mach-O and universal binaries only; do not read model weights or app.asar into memory.
			if (
				!/\.(dylib|node)$/.test(entry.name) &&
				!file.includes("/MacOS/") &&
				!/\/bin\/|\/darwin-arm64\//.test(file)
			)
				continue;
			const data = readFileSync(file);
			if (data.length < 4) continue;
			if (
				[0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca].includes(
					data.readUInt32BE(0),
				)
			)
				sign(file);
		}
	}
}
visit(app);
for (const bundle of bundles) sign(bundle);
sign(app);
run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
process.stdout.write("Signed OpenScreen Qwen with its persistent local certificate.\n");
