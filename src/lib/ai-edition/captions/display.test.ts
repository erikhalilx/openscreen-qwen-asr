import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../schema";
import type { CaptionCue } from "./cues";
import { captionDisplayCues } from "./display";

function document() {
	const doc = createEmptyDocument({ projectId: "display", title: "Caption hold" });
	doc.timeline.clips = [
		{
			id: "clip",
			assetId: "video",
			sourceStartSec: 0,
			sourceEndSec: 10,
			timelineStartSec: 0,
			timelineEndSec: 10,
			wordRefs: [],
			origin: "user",
			reason: "",
		},
	];
	return doc;
}
const cue = (startMs: number, endMs: number, id = "first"): CaptionCue => ({
	id,
	startMs,
	endMs,
	text: id,
});

describe("caption display hold", () => {
	it("adds one second without changing aligned cues or document data", () => {
		const doc = document();
		const aligned = [cue(1000, 1200), cue(4000, 4200, "next")];
		const before = JSON.stringify({ doc, aligned });
		expect(captionDisplayCues(aligned, doc)).toEqual([cue(1000, 2200), cue(4000, 5200, "next")]);
		expect(JSON.stringify({ doc, aligned })).toBe(before);
	});
	it.each([0, 200, 999, 1000])("switches on time when the next gap is %i ms", (gap) => {
		const doc = document();
		const nextStart = 2000 + gap;
		const result = captionDisplayCues([cue(1000, 2000), cue(nextStart, 4000, "next")], doc);
		expect(result[0].endMs).toBe(nextStart);
		expect(result[1].startMs).toBe(nextStart);
	});
	it("stops at the last frame instead of lengthening the programme", () => {
		expect(captionDisplayCues([cue(9500, 9800)], document())).toEqual([cue(9500, 10_000)]);
	});
	it("does not revive cut speech or let it cancel a visible caption's hold", () => {
		const doc = document();
		doc.timeline.trimRanges = [
			{
				id: "cut",
				assetId: "video",
				clipId: "clip",
				startSec: 2,
				endSec: 5,
				origin: "user",
				reason: "",
			},
		];
		expect(
			captionDisplayCues(
				[cue(1000, 2000), cue(2500, 3000, "deleted"), cue(6000, 7000, "next")],
				doc,
			),
		).toEqual([cue(1000, 6000), cue(6000, 8000, "next")]);
	});
	it.each([
		[2, 4000],
		[0.5, 2500],
	])("holds for one playback second at %sx", (speed, expectedEnd) => {
		const doc = document();
		doc.legacyEditor = { speedRegions: [{ id: "speed", startMs: 0, endMs: 10_000, speed }] };
		expect(captionDisplayCues([cue(1000, 2000)], doc)[0].endMs).toBe(expectedEnd);
	});
	it("accounts for a speed boundary during the extra second", () => {
		const doc = document();
		doc.legacyEditor = { speedRegions: [{ id: "speed", startMs: 2500, endMs: 4500, speed: 2 }] };
		expect(captionDisplayCues([cue(1000, 2000)], doc)[0].endMs).toBe(3500);
	});
	it("never moves the next onset even when a faster section shortens the gap", () => {
		const doc = document();
		doc.legacyEditor = { speedRegions: [{ id: "speed", startMs: 0, endMs: 10_000, speed: 2 }] };
		const result = captionDisplayCues([cue(1000, 2000), cue(3000, 3500, "next")], doc);
		expect(result[0].endMs).toBe(3000);
		expect(result[1].startMs).toBe(3000);
	});
});
