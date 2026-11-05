import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	app: { isPackaged: false, getPath: () => "/test/O'Brien Data" },
}));
const showSaveDialogOver = vi.hoisted(() => vi.fn());
vi.mock("../messageBox", () => ({ showSaveDialogOver }));
vi.mock("./qwenMlx", () => ({
	qwenPaths: () => {
		throw new SyntaxError("Invalid runtime configuration");
	},
}));

import { getQwenRuntimeSetup, saveQwenInstaller } from "./qwenRuntimeSetup";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

it("saves an executable installer even if the existing config is malformed", async () => {
	vi.stubGlobal("process", { ...process, platform: "darwin", arch: "arm64" });
	vi.spyOn(os, "release").mockReturnValue("25.0.0");
	vi.stubEnv("APP_ROOT", undefined);
	vi.stubEnv("OPENSCREEN_STT_ENGINE", undefined);
	const directory = await mkdtemp(path.join(os.tmpdir(), "qwen-installer-"));
	const filePath = path.join(directory, "Install.command");
	try {
		showSaveDialogOver.mockResolvedValueOnce({ canceled: false, filePath });
		expect(await saveQwenInstaller(null)).toBe(true);
		expect((await stat(filePath)).mode & 0o700).toBe(0o700);
		expect(await readFile(filePath, "utf8")).toContain(
			`/bin/bash '${process.cwd()}/scripts/setup-qwen-local.sh' --data-dir '/test/O'\\''Brien Data'`,
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

it("does not offer a Mac installer on unsupported hardware", async () => {
	vi.stubGlobal("process", { ...process, platform: "linux" });
	vi.stubEnv("OPENSCREEN_STT_ENGINE", undefined);
	expect(await getQwenRuntimeSetup()).toEqual({ kind: "unsupported" });
});
