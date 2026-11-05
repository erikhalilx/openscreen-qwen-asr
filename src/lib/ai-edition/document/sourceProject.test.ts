import { expect, it } from "vitest";
import { createEmptyDocument, documentSchema } from "../schema";
import { openSourceProject } from "./sourceProject";

it("opens an older edited project at full source length, retaining camera, separate audio and original paths", () => {
	const doc = createEmptyDocument({ projectId: "old", title: "Old recording" });
	delete doc.studioVersion;
	doc.assets = [
		{
			id: "screen",
			kind: "video",
			label: "Screen",
			originalPath: "/original.mp4",
			durationSec: 20,
			cameraTrack: { sourcePath: "/camera.webm", startMs: 0, offsetMs: 125, visible: false },
			separateRecordingAudio: true,
			recordingAudio: [{ kind: "microphone", assetId: "mic" }],
		},
		{
			id: "mic",
			kind: "audio",
			label: "Mic",
			originalPath: "/mic.m4a",
			durationSec: 20,
			cameraTrack: null,
		},
	];
	doc.timeline.clips = [
		{
			id: "cut",
			assetId: "screen",
			sourceStartSec: 5,
			sourceEndSec: 8,
			timelineStartSec: 0,
			timelineEndSec: 3,
			wordRefs: [],
			origin: "user",
			reason: "Trimmed",
		},
	];
	doc.legacyEditor = { borderRadius: 64, cameraLayoutEnabled: true };
	const next = openSourceProject(doc);
	expect(next.timeline.clips).toMatchObject([
		{ sourceStartSec: 0, sourceEndSec: 20, timelineEndSec: 20 },
	]);
	expect(next.assets[0].cameraTrack).toMatchObject({
		sourcePath: "/camera.webm",
		offsetMs: 125,
		visible: true,
	});
	expect(next.audioTracks).toMatchObject([
		{
			recordingSource: "microphone",
			assetId: "mic",
			startMs: 0,
			endMs: 20000,
			gainDb: 0,
			muted: false,
		},
	]);
	expect(next.legacyEditor).toBeNull();
	expect(next.annotations).toEqual([]);
	expect(next.transcripts).toEqual([]);
	expect(next.assets.map((a) => a.originalPath)).toEqual(["/original.mp4", "/mic.m4a"]);
	expect(doc.timeline.clips[0].sourceStartSec).toBe(5);
	expect(documentSchema.parse(next)).toEqual(next);
	expect(openSourceProject(next)).toBe(next);
});
it("does not discard edits saved by studio 0.3", () => {
	const doc = createEmptyDocument({ projectId: "new", title: "Edited" });
	doc.legacyEditor = { borderRadius: 42 };
	expect(openSourceProject(doc)).toBe(doc);
});
