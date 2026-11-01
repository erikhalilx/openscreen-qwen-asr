import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseQwenResponse, QwenMlxManager, qwenPaths } from "./qwenMlx";

vi.mock("electron", () => ({
	app: { isPackaged: false, getPath: () => process.env.TEST_QWEN_USER_DATA },
}));
const valid = {
	segments: [{ text: "你好。", startSec: 0.1, endSec: 0.6 }],
	wordSegments: [
		{ word: "你", startSec: 0.1, endSec: 0.3 },
		{ word: "好。", startSec: 0.3, endSec: 0.6 },
	],
	detectedLanguage: "zh",
	backend: "qwen-mlx",
	timing: { elapsedSec: 0.1, audioSec: 1, rtf: 0.1 },
};

describe("Qwen timestamp contract", () => {
	it("keeps absolute source times and aligned punctuation", () => {
		expect(parseQwenResponse(valid, 1).wordSegments).toEqual(valid.wordSegments);
	});
	it("rejects invalid times before persisting a transcript", () => {
		for (const startSec of [Number.NaN, -1, 2]) {
			expect(() =>
				parseQwenResponse({ ...valid, wordSegments: [{ word: "bad", startSec, endSec: 0.5 }] }, 1),
			).toThrow();
		}
		expect(() => parseQwenResponse({ ...valid, wordSegments: [] }, 1)).toThrow(/alignment/);
	});
});

describe.skipIf(process.platform === "win32")("Qwen process lifecycle", () => {
	let root: string;
	let manager: QwenMlxManager;
	beforeEach(async () => {
		root = await mkdtemp(path.join(os.tmpdir(), "qwen-worker-test-"));
		await writeFile(path.join(root, "config.json"), "{}");
		await writeFile(
			path.join(root, "fake.py"),
			`import json,sys,time\nr=json.loads(sys.stdin.readline())\nprint(json.dumps({'version':1,'type':'progress','phase':'transcribe','completedSec':0,'totalSec':1}),flush=True)\nif r.get('prompt')=='wait': time.sleep(30)\nif r.get('prompt')=='fail': sys.exit(2)\nprint(json.dumps({'version':1,'type':'result','result':${JSON.stringify(valid)}}),flush=True)\n`,
		);
		manager = new QwenMlxManager({
			python: "/usr/bin/python3",
			worker: path.join(root, "fake.py"),
			model: root,
			aligner: root,
			vad: path.join(root, "config.json"),
		});
	});
	afterEach(async () => {
		await manager.shutdown();
		await rm(root, { recursive: true, force: true });
	});
	it("serializes jobs and resolves only after the worker has exited", async () => {
		const results = await Promise.all([
			manager.transcribe({ samples: new Float32Array(16000) }),
			manager.transcribe({ samples: new Float32Array(16000) }),
		]);
		expect(results.map((r) => r.detectedLanguage)).toEqual(["zh", "zh"]);
	});
	it("cancels the running worker and permits a later job", async () => {
		let started: () => void = () => undefined;
		const ready = new Promise<void>((resolve) => {
			started = resolve;
		});
		manager.addStatusSink((event) => {
			if (event.phase === "transcribe") started();
		});
		const task = manager.transcribe({ samples: new Float32Array(16000), prompt: "wait" });
		const rejected = expect(task).rejects.toMatchObject({ name: "AbortError" });
		await ready;
		manager.cancel();
		await rejected;
		expect((await manager.transcribe({ samples: new Float32Array(16000) })).backend).toBe(
			"qwen-mlx",
		);
	});
	it("recovers after a failed worker without saving partial results", async () => {
		await expect(
			manager.transcribe({ samples: new Float32Array(16000), prompt: "fail" }),
		).rejects.toThrow(/failed/);
		expect(
			(await manager.transcribe({ samples: new Float32Array(16000) })).wordSegments,
		).toHaveLength(2);
	});
});

describe("device-local Qwen paths", () => {
	afterEach(() => vi.unstubAllEnvs());
	it("uses this device's private data directory without reading checkout-local developer config", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "qwen-path-test-"));
		try {
			vi.stubEnv("TEST_QWEN_USER_DATA", root);
			vi.stubEnv("OPENSCREEN_QWEN_CONFIG", path.join(root, "missing.json"));
			const paths = qwenPaths();
			expect(paths.python).toBe(path.join(root, "runtime/venv/bin/python"));
			expect(paths.model).toBe(path.join(root, "runtime/models/Qwen3-ASR-0.6B"));
			const config = path.join(root, "private.json");
			await writeFile(
				config,
				JSON.stringify({ python: "~/python", model: "~/asr", aligner: "~/aligner", vad: "~/vad" }),
			);
			vi.stubEnv("OPENSCREEN_QWEN_CONFIG", config);
			expect(qwenPaths().model).toBe(path.join(os.homedir(), "asr"));
			vi.stubEnv("OPENSCREEN_QWEN_MODEL", "~/override");
			expect(qwenPaths().model).toBe(path.join(os.homedir(), "override"));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
