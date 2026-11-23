import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import { z } from "zod";
import { AppSettingsStore } from "../app-settings";
import { extractMono16kPcm } from "./extractAudio";
import type { SttTranscribeResponse, SttWordSegment } from "./transcriptionContract";
import { cleanupWav, writeSamplesAsWav } from "./wav";

const run = promisify(execFile);
const speakerTurn = z
	.object({
		speakerId: z.string().min(1),
		startSec: z.number().nonnegative(),
		endSec: z.number().nonnegative(),
	})
	.refine((turn) => turn.startSec < turn.endSec);
const attribution = z.object({
	version: z.literal(1),
	speakerTurns: z.array(speakerTurn),
	wordSegments: z.array(z.object({ speakerId: z.string().min(1).nullable() })),
});

export function localTranscriptionRoot() {
	return (
		process.env.LOCAL_TRANSCRIPTION_ROOT ??
		path.join(os.homedir(), "Library/Application Support/LocalTranscription")
	);
}

function toolPaths() {
	const root = localTranscriptionRoot();
	return {
		script: path.join(root, "local_transcription.py"),
		python: path.join(root, "runtime/venv/bin/python"),
		binary: path.join(root, "LocalDiarizer"),
	};
}

export async function getSpeakerSettings() {
	const available =
		process.platform === "darwin" &&
		(await Promise.all(Object.values(toolPaths()).map((file) => access(file))).then(
			() => true,
			() => false,
		));
	return {
		available,
		enabled: new AppSettingsStore(app.getPath("userData")).getSpeakerAttributionEnabled(),
	};
}

async function attributeWords(
	words: SttWordSegment[],
	wav: string,
	duration: number,
	signal: AbortSignal,
) {
	const { script, python } = toolPaths();
	const job = run(python, ["-I", script, "attribute", wav], {
		signal,
		killSignal: "SIGINT",
		maxBuffer: 32 * 1024 * 1024,
		timeout: Math.max(300_000, duration * 1000),
	});
	job.child.stdin?.on("error", () => undefined);
	job.child.stdin?.end(JSON.stringify({ version: 1, wordSegments: words }));
	const { stdout } = await job;
	const parsed = attribution.parse(JSON.parse(stdout));
	if (parsed.wordSegments.length !== words.length)
		throw new Error("Speaker attribution did not return every aligned word");
	return {
		speakerTurns: parsed.speakerTurns,
		wordSegments: words.map((word, index) => ({
			...word,
			speakerId: parsed.wordSegments[index].speakerId,
		})),
	};
}

export async function attributeSpeakers(
	result: SttTranscribeResponse,
	wav: string,
	signal: AbortSignal,
): Promise<SttTranscribeResponse> {
	if (!result.wordSegments.length) return result;
	const settings = await getSpeakerSettings();
	if (!settings.enabled || !settings.available) return result;
	return {
		...result,
		...(await attributeWords(result.wordSegments, wav, result.timing?.audioSec ?? 0, signal)),
	};
}

const backfillRequest = z.object({
	sourcePath: z.string().min(1),
	words: z
		.array(
			z
				.object({
					word: z.string().min(1),
					startSec: z.number().nonnegative(),
					endSec: z.number().nonnegative(),
				})
				.refine((word) => word.endSec >= word.startSec),
		)
		.min(1),
});

export async function backfillSpeakers(request: unknown, signal: AbortSignal) {
	const { sourcePath, words } = backfillRequest.parse(request);
	if (!(await getSpeakerSettings()).available) {
		throw new Error("Install the shared LocalTranscription runtime to generate speaker labels.");
	}
	const audio = await extractMono16kPcm(sourcePath, { signal });
	const wav = await writeSamplesAsWav(audio);
	try {
		const result = await attributeWords(words, wav, audio.length / 16_000, signal);
		return {
			speakerIds: result.wordSegments.map((word) => word.speakerId),
			speakerTurns: result.speakerTurns,
		};
	} finally {
		await cleanupWav(wav);
	}
}
