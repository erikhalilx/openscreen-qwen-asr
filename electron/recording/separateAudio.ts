import { spawn } from "node:child_process";
import { lstat, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { RecordedAudioSource } from "../../src/lib/recordingSession";
import { resolveFfmpeg } from "../media/audioPeaks";

/** Only complete, regular sibling files may replace the original recording's audio. */
export async function validatedRecordedAudio(videoPath: string, sources: RecordedAudioSource[]) {
	const parsed = path.parse(path.resolve(videoPath));
	const valid: RecordedAudioSource[] = [];
	for (const source of sources) {
		const expected = path.join(parsed.dir, `${parsed.name}-${source.kind}.m4a`);
		// Relocation is safe: select the current sibling by name, never the manifest's directory.
		if (path.basename(source.sourcePath) !== path.basename(expected)) return [];
		try {
			const stat = await lstat(expected);
			if (!stat.isFile() || !stat.size) return [];
		} catch {
			return [];
		}
		valid.push({ kind: source.kind, sourcePath: expected });
	}
	return valid;
}

/** Copy the already synchronized AAC streams without re-encoding or changing levels. */
export async function separateRecordedAudio(
	videoPath: string,
	sources: RecordedAudioSource["kind"][],
): Promise<RecordedAudioSource[]> {
	if (!sources.length) return [];
	if (sources.length > 2 || new Set(sources).size !== sources.length)
		throw new Error("Invalid recorded audio source list");
	const ffmpeg = resolveFfmpeg();
	if (!ffmpeg) throw new Error("ffmpeg is required to preserve separate recording tracks");
	const base = path.join(path.dirname(videoPath), path.parse(videoPath).name);
	const result: RecordedAudioSource[] = [];
	try {
		for (const [index, kind] of sources.entries()) {
			const sourcePath = `${base}-${kind}.m4a`;
			const temporary = `${sourcePath}.${process.pid}.partial.m4a`;
			try {
				await new Promise<void>((resolve, reject) => {
					const child = spawn(
						ffmpeg,
						[
							"-nostdin",
							"-y",
							"-v",
							"error",
							"-i",
							videoPath,
							"-map",
							`0:a:${index}`,
							"-c:a",
							"copy",
							"-vn",
							temporary,
						],
						{ stdio: "ignore" },
					);
					const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
					child.once("error", (error) => {
						clearTimeout(timer);
						reject(error);
					});
					child.once("close", (code) => {
						clearTimeout(timer);
						if (code === 0) resolve();
						else reject(new Error(`Could not preserve the ${kind} recording track`));
					});
				});
				await rename(temporary, sourcePath);
				result.push({ kind, sourcePath });
			} finally {
				await rm(temporary, { force: true });
			}
		}
		return result;
	} catch (error) {
		await Promise.all(result.map((source) => rm(source.sourcePath, { force: true })));
		throw error;
	}
}
