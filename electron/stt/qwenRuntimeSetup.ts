import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, readdir, rename, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { app, type BrowserWindow } from "electron";
import manifest from "../../models/manifest.json";
import { showSaveDialogOver } from "../messageBox";
import { qwenPaths } from "./qwenMlx";
import type { QwenRuntimeSetup } from "./transcriptionContract";

const run = promisify(execFile);

function shellQuote(value: string) {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}

export async function getQwenRuntimeSetup(): Promise<QwenRuntimeSetup> {
	if (process.env.OPENSCREEN_STT_ENGINE === "whisper") return { kind: "ready" };
	if (
		process.platform !== "darwin" ||
		process.arch !== "arm64" ||
		Number(os.release().split(".")[0]) < 25
	) {
		return { kind: "unsupported" };
	}
	try {
		const { python, worker, model, aligner, vad } = qwenPaths();
		await access(python, constants.X_OK);
		const files = [worker, vad];
		for (const [directory, spec] of [
			[model, manifest.models.asr],
			[aligner, manifest.models.aligner],
		] as const) {
			for (const [name, info] of Object.entries(spec.files)) {
				if (info.required && !name.endsWith(".safetensors")) files.push(path.join(directory, name));
			}
			const names = await readdir(directory);
			const weights = names.filter((name) => name.endsWith(".safetensors"));
			if (!weights.length) throw new Error("Missing model weights");
			files.push(...weights.map((name) => path.join(directory, name)));
		}
		await Promise.all(
			files.map(async (file) => {
				const info = await stat(file);
				if (!info.isFile() || info.size === 0) throw new Error("Incomplete Qwen runtime");
			}),
		);
		await run(
			python,
			[
				"-I",
				"-c",
				"from importlib.util import find_spec; import sys; sys.exit(0 if all(find_spec(m) for m in ('mlx', 'mlx_qwen3_asr', 'numpy', 'onnxruntime')) else 1)",
			],
			{ timeout: 5000 },
		);
		return { kind: "ready" };
	} catch {
		await access(installerPath());
		return { kind: "missing" };
	}
}

function installerPath() {
	const root = app.isPackaged ? process.resourcesPath : (process.env.APP_ROOT ?? process.cwd());
	return path.join(root, "scripts/setup-qwen-local.sh");
}

export async function saveQwenInstaller(parent: BrowserWindow | null): Promise<boolean> {
	if ((await getQwenRuntimeSetup()).kind !== "missing") return false;
	const installer = installerPath();
	const { canceled, filePath } = await showSaveDialogOver(parent, {
		defaultPath: path.join(app.getPath("downloads"), "Install OpenScreen Qwen.command"),
		filters: [{ name: "Terminal script", extensions: ["command"] }],
	});
	if (canceled || !filePath) return false;
	if (path.extname(filePath).toLowerCase() !== ".command") {
		throw new Error("Save the installer with a .command extension");
	}
	const script = `#!/bin/bash
/bin/bash ${shellQuote(installer)} --data-dir ${shellQuote(app.getPath("userData"))}
status=$?
if [[ $status -eq 0 ]]; then
  echo '安装完成。请按 ⌘Q 退出 OpenScreen Qwen，再重新打开并尝试转录。'
else
  echo '安装未完成。请查看上方错误，排除问题后双击脚本重试。'
fi
if [[ -t 0 ]]; then
  read -r -p 'Press Return to close / 按回车结束… ' || true
fi
exit "$status"
`;
	const staging = await mkdtemp(path.join(path.dirname(filePath), ".qwen-setup-"));
	const temporary = path.join(staging, "installer.command");
	try {
		await writeFile(temporary, script, { mode: 0o700, flag: "wx" });
		await rename(temporary, filePath);
	} finally {
		await unlink(temporary).catch(() => undefined);
		await rmdir(staging);
	}
	return true;
}
