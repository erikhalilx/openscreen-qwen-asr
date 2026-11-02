import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../media/audioPeaks", () => ({ resolveFfmpeg: () => null }));

import { separateRecordedAudio, validatedRecordedAudio } from "./separateAudio";

const dirs: string[] = [];
afterEach(async () => {
	for (const dir of dirs.splice(0)) await rm(dir, { force: true, recursive: true });
});
describe("recorded source sidecars", () => {
	it("requires the complete set of exact sibling files, rejecting arbitrary paths and symlinks", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "openscreen-source-audio-"));
		dirs.push(dir);
		const video = path.join(dir, "take.mp4");
		const system = { kind: "system" as const, sourcePath: path.join(dir, "take-system.m4a") };
		const mic = { kind: "microphone" as const, sourcePath: path.join(dir, "take-microphone.m4a") };
		await writeFile(system.sourcePath, "audio");
		expect(await validatedRecordedAudio(video, [system, mic])).toEqual([]);
		await writeFile(mic.sourcePath, "audio");
		expect(await validatedRecordedAudio(video, [system, mic])).toEqual([system, mic]);
		expect(
			await validatedRecordedAudio(video, [{ ...system, sourcePath: mic.sourcePath }]),
		).toEqual([]);
		await rm(mic.sourcePath);
		await symlink(system.sourcePath, mic.sourcePath);
		expect(await validatedRecordedAudio(video, [system, mic])).toEqual([]);
	});
	it("reports unavailable extraction without modifying the original recording", async () => {
		expect(await separateRecordedAudio("/media/take.mp4", [])).toEqual([]);
		await expect(separateRecordedAudio("/media/take.mp4", ["system"])).rejects.toThrow("ffmpeg");
	});
});
