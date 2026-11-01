import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { app } from "electron";
import { z } from "zod";
import { extractMono16kPcm } from "./extractAudio";
import type {
	SttStatusEvent,
	SttTranscribeRequest,
	SttTranscribeResponse,
} from "./transcriptionContract";
import { cleanupWav, writeSamplesAsWav } from "./wav";

const timedText = z.object({
	text: z.string().min(1),
	startSec: z.number().finite().nonnegative(),
	endSec: z.number().finite().nonnegative(),
});
const timedWord = z.object({
	word: z.string().min(1),
	startSec: z.number().finite().nonnegative(),
	endSec: z.number().finite().nonnegative(),
});
const response = z.object({
	segments: z.array(timedText),
	wordSegments: z.array(timedWord),
	detectedLanguage: z.string().min(1),
	backend: z.literal("qwen-mlx"),
	timing: z.object({
		elapsedSec: z.number().finite().nonnegative(),
		audioSec: z.number().finite().nonnegative(),
		rtf: z.number().finite().nonnegative(),
	}),
});
const eventSchema = z.discriminatedUnion("type", [
	z.object({ version: z.literal(1), type: z.literal("ready") }),
	z.object({ version: z.literal(1), type: z.literal("error"), message: z.string() }),
	z.object({ version: z.literal(1), type: z.literal("result"), result: response }),
	z.object({
		version: z.literal(1),
		type: z.literal("progress"),
		phase: z.enum(["model", "transcribe"]),
		completedSec: z.number().finite().nonnegative(),
		totalSec: z.number().finite().nonnegative(),
		rtf: z.number().finite().nonnegative().optional(),
	}),
]);

export interface QwenPaths {
	python: string;
	worker: string;
	model: string;
	aligner: string;
	vad: string;
}

export function qwenPaths(): QwenPaths {
	const root = app.isPackaged ? process.resourcesPath : (process.env.APP_ROOT ?? process.cwd());
	const userData = app.getPath("userData");
	const runtime = path.join(userData, "runtime");
	const configFile = process.env.OPENSCREEN_QWEN_CONFIG ?? path.join(userData, "qwen.local.json");
	const local = existsSync(configFile)
		? z
				.object({ python: z.string(), model: z.string(), aligner: z.string(), vad: z.string() })
				.parse(JSON.parse(readFileSync(configFile, "utf8")))
		: undefined;
	const expand = (value: string) =>
		value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
	return {
		python: expand(
			process.env.OPENSCREEN_QWEN_PYTHON ?? local?.python ?? path.join(runtime, "venv/bin/python"),
		),
		worker: path.join(root, "scripts/qwen-asr/worker.py"),
		model: expand(
			process.env.OPENSCREEN_QWEN_MODEL ??
				local?.model ??
				path.join(runtime, "models/Qwen3-ASR-0.6B"),
		),
		aligner: expand(
			process.env.OPENSCREEN_QWEN_ALIGNER ??
				local?.aligner ??
				path.join(runtime, "models/Qwen3-ForcedAligner-0.6B"),
		),
		vad: expand(
			process.env.OPENSCREEN_QWEN_VAD ??
				local?.vad ??
				path.join(runtime, "models/silero-vad/silero_vad.onnx"),
		),
	};
}

function cancelled(): Error {
	return Object.assign(new Error("Transcription cancelled"), { name: "AbortError" });
}

/** Validate the worker's source-clock contract before it reaches a persisted project. */
export function parseQwenResponse(value: unknown, duration: number): SttTranscribeResponse {
	const result = response.parse(value);
	for (const spans of [result.segments, result.wordSegments]) {
		let previous = 0;
		for (const span of spans) {
			if (
				span.endSec < span.startSec ||
				span.startSec < previous ||
				span.endSec > duration + 0.001
			) {
				throw new Error("Qwen returned invalid source timestamps");
			}
			previous = span.startSec;
		}
	}
	if (result.segments.length && !result.wordSegments.length)
		throw new Error("Qwen returned text without word alignment");
	return result;
}

/** No shared service, port, environment mutation or model-file writes. Each job exits fully. */
export class QwenMlxManager {
	private sinks = new Set<(event: SttStatusEvent) => void>();
	private queue: Promise<unknown> = Promise.resolve();
	private active: AbortController | null = null;
	private epoch = 0;
	private closed = false;
	constructor(private readonly paths = qwenPaths()) {}

	addStatusSink(sink: (event: SttStatusEvent) => void): () => void {
		this.sinks.add(sink);
		return () => this.sinks.delete(sink);
	}
	private emit(event: SttStatusEvent): void {
		for (const sink of this.sinks) sink(event);
	}

	async init(
		options: { statusSink?: (event: SttStatusEvent) => void; modelsBaseDir?: string } = {},
	): Promise<void> {
		if (this.closed) throw cancelled();
		if (options.statusSink) this.addStatusSink(options.statusSink);
		for (const file of [
			this.paths.python,
			this.paths.worker,
			path.join(this.paths.model, "config.json"),
			path.join(this.paths.aligner, "config.json"),
			this.paths.vad,
		]) {
			await access(file).catch(() => {
				throw new Error(`Qwen local runtime is missing: ${file}. Run scripts/setup-qwen-local.sh.`);
			});
		}
	}
	cancel(): void {
		this.epoch++;
		this.active?.abort();
	}
	async shutdown(): Promise<void> {
		this.closed = true;
		this.cancel();
		await this.queue.catch(() => undefined);
	}

	transcribe(req: SttTranscribeRequest): Promise<SttTranscribeResponse> {
		const epoch = this.epoch;
		const task = this.queue.then(async () => {
			if (this.closed || epoch !== this.epoch) throw cancelled();
			await this.init();
			if (this.closed || epoch !== this.epoch) throw cancelled();
			const controller = new AbortController();
			this.active = controller;
			let wav: string | undefined;
			try {
				const samples =
					req.samples ??
					(req.sourcePath
						? await extractMono16kPcm(req.sourcePath, { signal: controller.signal })
						: undefined);
				if (!samples) throw new Error("stt:transcribe requires samples or sourcePath");
				if (controller.signal.aborted) throw cancelled();
				wav = await writeSamplesAsWav(samples);
				if (controller.signal.aborted) throw cancelled();
				// Retry a failed worker once. Never commit partial transcripts.
				for (let attempt = 0; ; attempt++) {
					try {
						return await this.runWorker(wav, samples.length / 16_000, req, controller.signal);
					} catch (error) {
						if (controller.signal.aborted || attempt >= 1) throw error;
					}
				}
			} finally {
				this.active = null;
				if (wav) await cleanupWav(wav);
			}
		});
		this.queue = task.catch(() => undefined);
		return task;
	}

	private runWorker(
		wavPath: string,
		duration: number,
		req: SttTranscribeRequest,
		signal: AbortSignal,
	): Promise<SttTranscribeResponse> {
		if (signal.aborted) return Promise.reject(cancelled());
		this.emit({ phase: "model", backend: "qwen-mlx", completedSec: 0, totalSec: duration });
		const env = {
			...process.env,
			HF_HUB_OFFLINE: "1",
			HF_HUB_DISABLE_TELEMETRY: "1",
			PYTHONNOUSERSITE: "1",
			PYTHONUNBUFFERED: "1",
		};
		// Parent shells and other local ASR deployments can carry unrelated Python paths.
		delete (env as NodeJS.ProcessEnv).PYTHONPATH;
		delete (env as NodeJS.ProcessEnv).PYTHONHOME;
		const child = spawn(this.paths.python, ["-I", this.paths.worker], {
			env,
			shell: false,
			stdio: "pipe",
		});
		return new Promise((resolve, reject) => {
			let stderr = "";
			let result: SttTranscribeResponse | undefined;
			let failure: Error | undefined;
			let killTimer: ReturnType<typeof setTimeout> | undefined;
			const stop = () => {
				child.kill("SIGTERM");
				killTimer ??= setTimeout(() => child.kill("SIGKILL"), 3000);
				killTimer.unref();
			};
			const deadline = () => {
				failure = new Error("Qwen worker made no progress before its timeout");
				stop();
			};
			// Reset on actual chunk progress; never put one fixed ceiling on a long recording.
			let timer = setTimeout(deadline, 180_000);
			timer.unref();
			const lines = createInterface({ input: child.stdout });
			lines.on("line", (line) => {
				if (failure) return;
				try {
					if (line.length > 16 * 1024 * 1024) throw new Error("Qwen protocol message is too large");
					const event = eventSchema.parse(JSON.parse(line));
					clearTimeout(timer);
					timer = setTimeout(deadline, 180_000);
					timer.unref();
					if (event.type === "result") result = parseQwenResponse(event.result, duration);
					if (event.type === "error") failure = new Error(event.message);
					if (event.type === "progress")
						this.emit({
							phase: event.phase,
							backend: "qwen-mlx",
							completedSec: Math.min(duration, event.completedSec),
							totalSec: duration,
							rtf: event.rtf,
						});
				} catch (error) {
					failure = error instanceof Error ? error : new Error(String(error));
					stop();
				}
			});
			child.stderr.on("data", (data: Buffer) => {
				stderr = (stderr + data.toString()).slice(-12_000);
			});
			child.stdin.on("error", () => undefined); // EPIPE is reported with the worker's exit.
			child.on("error", (error) => {
				failure = error;
			});
			signal.addEventListener("abort", stop, { once: true });
			child.on("close", (code) => {
				clearTimeout(timer);
				if (killTimer) clearTimeout(killTimer);
				lines.close();
				signal.removeEventListener("abort", stop);
				if (signal.aborted) return reject(cancelled());
				if (failure) return reject(failure);
				if (code !== 0 || !result)
					return reject(new Error(`Qwen worker failed (${code}): ${stderr}`));
				this.emit({
					phase: "transcribe",
					backend: "qwen-mlx",
					completedSec: duration,
					totalSec: duration,
					rtf: result.timing?.rtf,
				});
				resolve(result);
			});
			child.stdin.end(
				JSON.stringify({
					version: 1,
					wavPath,
					model: this.paths.model,
					aligner: this.paths.aligner,
					vad: this.paths.vad,
					language: req.language,
					prompt: req.prompt,
				}) + "\n",
			);
			if (signal.aborted) stop();
		});
	}
}
