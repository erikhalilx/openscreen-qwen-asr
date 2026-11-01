// Reuse the complete, unmodified native payload of the pinned upstream release.
// Native source is unchanged; this avoids requiring Rust/FFmpeg toolchains for local installation.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "models/native-payload.json"), "utf8"));
if (process.platform !== "darwin" || process.arch !== "arm64") {
	throw new Error("The Qwen native package supports Apple Silicon macOS only.");
}
const digest = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const target = path.join(root, "electron/native/bin/darwin-arm64");
const licenseTarget = path.join(root, "build-licenses/THIRD-PARTY-LICENSES.txt");
const valid = (dir) =>
	Object.entries(manifest.files).every(([name, hash]) => {
		const file = path.join(dir, name);
		return fs.existsSync(file) && digest(file) === hash;
	});
// A fresh install always obtains both payload and licenses from the verified archive.
if (valid(target) && fs.existsSync(licenseTarget) && !process.argv.includes("--force")) {
	console.log("Complete pinned native payload already verified.");
} else {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-qwen-native-"));
	try {
		const archive = path.join(temporary, "upstream.zip");
		execFileSync(
			"curl",
			["-fL", "--retry", "3", "--connect-timeout", "20", "-o", archive, manifest.url],
			{ stdio: "inherit" },
		);
		if (digest(archive) !== manifest.sha256) throw new Error("Upstream archive checksum mismatch");
		const expanded = path.join(temporary, "expanded");
		execFileSync("/usr/bin/ditto", ["-x", "-k", archive, expanded]);
		const apps = fs.readdirSync(expanded).filter((name) => name.endsWith(".app"));
		if (apps.length !== 1) throw new Error("Unexpected upstream application archive");
		const resources = path.join(expanded, apps[0], "Contents/Resources");
		const source = path.join(resources, "electron/native/bin/darwin-arm64");
		if (!valid(source))
			throw new Error("Upstream native file checksums do not match the pinned source release");
		fs.mkdirSync(target, { recursive: true });
		for (const name of fs.readdirSync(target)) {
			if (!(name in manifest.files))
				throw new Error("Unexpected local native file; use a clean checkout");
		}
		fs.cpSync(source, target, { recursive: true });
		fs.mkdirSync(path.dirname(licenseTarget), { recursive: true });
		fs.copyFileSync(path.join(resources, "THIRD-PARTY-LICENSES.txt"), licenseTarget);
		console.log("Verified all native files and restored upstream npm/Rust license texts.");
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true });
	}
}
