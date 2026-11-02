import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../schema";
import { patchAudioTrack, removeAudioTrack, separateAudioLanes } from "./audioTracks";
import { syncRecordingAudio } from "./recordingAudio";
import {
	duplicateClip,
	moveClip,
	removeClip,
	setClipSourceRange,
	withClipsChanged,
} from "./timeline";

function recording() {
	const doc = createEmptyDocument({ projectId: "p", title: "Audio" });
	doc.assets = [
		{
			id: "v",
			kind: "video",
			label: "Screen",
			originalPath: "/media/screen.mp4",
			durationSec: 10,
			cameraTrack: null,
			separateRecordingAudio: true,
			recordingAudio: [
				{ kind: "system", assetId: "s" },
				{ kind: "microphone", assetId: "m" },
			],
		},
		{
			id: "s",
			kind: "audio",
			label: "System",
			originalPath: "/media/screen-system.m4a",
			durationSec: 10,
			cameraTrack: null,
		},
		{
			id: "m",
			kind: "audio",
			label: "Mic",
			originalPath: "/media/screen-microphone.m4a",
			durationSec: 10,
			cameraTrack: null,
		},
	];
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "v",
			sourceStartSec: 0,
			sourceEndSec: 10,
			timelineStartSec: 0,
			timelineEndSec: 10,
			wordRefs: [],
			origin: "system",
			reason: "",
		},
	];
	return syncRecordingAudio(doc);
}

describe("recording source tracks", () => {
	it("keeps two overlapping sources in separate rows, with independent gain and mute", () => {
		let doc = recording();
		expect(doc.audioTracks.map((t) => t.recordingSource)).toEqual(["system", "microphone"]);
		doc = syncRecordingAudio(
			patchAudioTrack(doc, "c:recorded:system", { gainDb: -9, muted: true }),
		);
		expect(doc.audioTracks.map((t) => [t.gainDb, t.muted])).toEqual([
			[-9, true],
			[0, false],
		]);
		expect(separateAudioLanes(doc.audioTracks)).toEqual(doc.audioTracks);
	});
	it("copies both sources with a duplicate and follows reordering and source trims", () => {
		let doc = duplicateClip(recording(), "c");
		expect(doc.audioTracks).toHaveLength(4);
		const copy = doc.timeline.clips[1].id;
		doc = moveClip(doc, copy, 0);
		doc = setClipSourceRange(doc, copy, 2, 7);
		const tracks = doc.audioTracks.filter((t) => t.clipId === copy);
		expect(tracks.map((t) => [t.offsetMs, t.startMs, t.endMs])).toEqual([
			[2000, 0, 5000],
			[2000, 0, 5000],
		]);
		expect(removeClip(doc, copy).audioTracks).toHaveLength(2);
	});
	it("deleting a source pill mutes it and keeps its file available", () => {
		const doc = syncRecordingAudio(removeAudioTrack(recording(), "c:recorded:system"));
		expect(doc.audioTracks[0].muted).toBe(true);
		expect(doc.assets.some((a) => a.id === "s")).toBe(true);
	});
	it("leaves legacy mixed recordings untouched", () => {
		const doc = createEmptyDocument({ projectId: "p", title: "Old" });
		expect(syncRecordingAudio(doc)).toBe(doc);
	});
	it("duplicates the selected clip's source levels rather than borrowing the first clip's levels", () => {
		let doc = duplicateClip(recording(), "c");
		const second = doc.timeline.clips[1].id;
		doc = patchAudioTrack(doc, `${second}:recorded:system`, { gainDb: -12 });
		doc = duplicateClip(doc, second);
		const copy = doc.timeline.clips[2].id;
		expect(
			doc.audioTracks.find((track) => track.clipId === copy && track.recordingSource === "system")
				?.gainDb,
		).toBe(-12);
		expect(
			doc.audioTracks.find((track) => track.clipId === "c" && track.recordingSource === "system")
				?.gainDb,
		).toBe(0);
	});
	it("keeps contiguous picture clips separate when joining would lose their different source levels", () => {
		let doc = recording();
		const first = { ...doc.timeline.clips[0], sourceEndSec: 5, timelineEndSec: 5 };
		const second = {
			...first,
			id: "c2",
			sourceStartSec: 5,
			sourceEndSec: 10,
			timelineStartSec: 5,
			timelineEndSec: 10,
		};
		doc = syncRecordingAudio({ ...doc, timeline: { ...doc.timeline, clips: [first, second] } });
		doc = patchAudioTrack(doc, "c2:recorded:system", { gainDb: -9 });
		doc = withClipsChanged(doc, [first, second]);
		expect(doc.timeline.clips).toHaveLength(2);
		expect(
			doc.audioTracks
				.filter((track) => track.recordingSource === "system")
				.map((track) => track.gainDb),
		).toEqual([0, -9]);
	});
});
