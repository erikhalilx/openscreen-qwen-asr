import { describe, expect, it, vi } from "vitest";
import type { CursorTelemetryPoint } from "@/components/video-editor/types";
import { nativeBridgeClient } from "@/native/client";
import type { ClickCue } from "./clickSound";
import {
	buildClickCues,
	clickCuesFitTake,
	clickSoundForDocument,
	crossedClickHits,
	ensureClickHitPaths,
	levelClickCues,
	loadClickCues,
	placeClickHits,
	placedClickHits,
	playClickHits,
	resetClickPlayhead,
	takeCrossedClickHits,
} from "./clickSound";

const point = (
	timeMs: number,
	interactionType: CursorTelemetryPoint["interactionType"],
): CursorTelemetryPoint => ({
	timeMs,
	cx: 0.5,
	cy: 0.5,
	interactionType,
});

const cue = (timeSec: number) => ({ timeSec, gain: 1, release: false });

const asset = { id: "asset_1", kind: "video", originalPath: "/t.mp4", durationSec: 10 };
const clip = (over: Record<string, number | string> = {}) => ({
	id: "clip_1",
	assetId: "asset_1",
	timelineStartSec: 0,
	timelineEndSec: 10,
	sourceStartSec: 0,
	sourceEndSec: 10,
	...over,
});
const doc = (clips: unknown[], speedRegions: unknown[] = [], trimRanges: unknown[] = []) =>
	({
		project: { primaryAssetId: "asset_1" },
		assets: [asset],
		audioTracks: [],
		timeline: { clips, trimRanges, speedRanges: [] },
		// Speed regions live on the legacy envelope — `readSpeedRegions` is the only reader.
		legacyEditor: { speedRegions },
	}) as never;
/** A cut of `startSec..startSec+lenSec` of the recording, on the one clip. */
const cut = (startSec: number, lenSec: number) => ({
	id: "trim_1",
	assetId: "asset_1",
	clipId: "clip_1",
	startSec,
	endSec: startSec + lenSec,
	origin: "user",
});

describe("buildClickCues", () => {
	it("plays one complete single sample, ignoring motion and release", () => {
		expect(
			buildClickCues([point(1000, "move"), point(7056, "click"), point(7123, "mouseup")]),
		).toEqual([{ timeSec: 7.056, gain: 1, release: false }]);
	});
	it("pairs two nearby left presses once at the first click", () => {
		expect(
			buildClickCues([
				point(1000, "click"),
				point(1050, "mouseup"),
				point(1200, "click"),
				point(1250, "mouseup"),
			]),
		).toEqual([{ timeSec: 1, gain: 1, release: true, pairedTimeSec: 1.2 }]);
	});
	it("honors a native double marker without adding synthetic presses", () => {
		expect(buildClickCues([point(300, "double-click"), point(360, "mouseup")])).toEqual([
			{ timeSec: 0.3, gain: 1, release: true },
		]);
		expect(buildClickCues([point(1000, "click"), point(1200, "double-click")])).toHaveLength(1);
	});
	it("keeps slow clicks and rapid clicks at different positions separate", () => {
		expect(
			buildClickCues([point(1000, "click"), point(1501, "click")]).map((c) => c.release),
		).toEqual([false, false]);
		expect(
			buildClickCues([point(1000, "click"), { ...point(1100, "click"), cx: 0.8 }]).map(
				(c) => c.release,
			),
		).toEqual([false, false]);
	});
	it("recognizes the 500ms boundary and pairs a triple click only once", () => {
		expect(buildClickCues([point(1000, "click"), point(1500, "click")])[0].release).toBe(true);
		expect(
			buildClickCues([point(1000, "click"), point(1100, "click"), point(1200, "click")]).map(
				(c) => c.release,
			),
		).toEqual([true, false]);
	});
	it("keeps mouse buttons distinct and does not interpret releases as clicks", () => {
		expect(
			buildClickCues([
				point(1000, "right-click"),
				point(1100, "middle-click"),
				point(1150, "mouseup"),
			]),
		).toEqual([
			{ timeSec: 1, gain: 0.85, release: false },
			{ timeSec: 1.1, gain: 0.85, release: false },
		]);
	});
	it("sorts without changing telemetry and rejects invalid times", () => {
		const input = [
			point(2000, "click"),
			point(1000, "click"),
			point(NaN, "click"),
			point(-1, "click"),
		];
		const copy = input.map((p) => ({ ...p }));
		expect(buildClickCues(input).map((c) => c.timeSec)).toEqual([1, 2]);
		expect(input).toEqual(copy);
	});
});

describe("placeClickHits", () => {
	it("reduces a double to the surviving single when an edit removes either press", () => {
		const pair = buildClickCues([point(1000, "click"), point(1200, "click")]);
		expect(placeClickHits(doc([clip()], [], [cut(1.1, 0.2)]), asset as never, pair)).toEqual([
			{ timeSec: 1, gain: 1, release: false },
		]);
		expect(
			placeClickHits(doc([clip()], [], [cut(0.9, 0.2)]), asset as never, pair)[0],
		).toMatchObject({ timeSec: expect.closeTo(1, 5), release: false });
		expect(placeClickHits(doc([clip()]), asset as never, pair)).toEqual([
			{ timeSec: 1, gain: 1, release: true },
		]);
	});
	it("does not pair clicks across independently trimmed clips", () => {
		const pair = buildClickCues([point(1000, "click"), point(1200, "click")]);
		const result = placedClickHits(
			doc([
				clip({ sourceEndSec: 1.1, timelineEndSec: 1.1 }),
				clip({ id: "copy", sourceStartSec: 1.1, timelineStartSec: 1.1, timelineEndSec: 10 }),
			]),
			asset as never,
			pair,
		);
		expect(result.map((p) => p.cue.release)).toEqual([false, false]);
	});
	const at = (document: never, cues: ClickCue[], take = asset) =>
		placeClickHits(document, take as never, cues).map((hit) => hit.timeSec);

	it("is the identity for an untouched single take", () => {
		expect(at(doc([clip()]), [cue(7.25)])).toEqual([7.25]);
	});

	it("moves a click into the compressed programme a 2x region makes", () => {
		// Raw 2..4 at 2x: the click at 3 s is heard at 2.5 s, the one at 5 s at 4 s. This is the
		// arithmetic an imported audio track cannot do — its content is placed, never stretched.
		expect(
			at(doc([clip()], [{ startMs: 2000, endMs: 4000, speed: 2 }]), [cue(1), cue(3), cue(5)]),
		).toEqual([1, 2.5, 4]);
	});

	it("follows the clip the take sits on rather than ruler zero", () => {
		// The take trimmed to start 2 s into the recording: the click recorded at 2.5 s of the
		// recording is half a second into the film, and a click before the trim is never on
		// screen at all. (The programme is the clips concatenated, so the clip's own timeline
		// position is not part of it — see `projectRawTimelineSecToPlayback`.)
		expect(
			at(doc([clip({ timelineStartSec: 30, timelineEndSec: 38, sourceStartSec: 2 })]), [
				cue(2.5),
				cue(1.5),
			]),
		).toEqual([0.5]);
	});

	it("drops a click the cut took out of the film and pulls the later ones up", () => {
		expect(at(doc([clip()], [], [cut(2, 2)]), [cue(1), cue(3), cue(5)])).toEqual([1, 3]);
	});

	it("plays a click once for every clip of the take that keeps it", () => {
		// The take, then a copy of its first 4 s pasted after it, each with its own 2x region over
		// 1..2 s of the source. Each clip is half a second shorter for its region, so the copy starts
		// at 9.5 s of the programme: its click at 3 s sits at 9.5 + 1 + 0.5 + 1. The click at 5 s is
		// past the copy's end and sounds once, in the first clip only.
		const document = doc(
			[clip(), clip({ id: "clip_2", timelineStartSec: 10, timelineEndSec: 14, sourceEndSec: 4 })],
			[
				{ startMs: 1000, endMs: 2000, speed: 2 },
				{ startMs: 11000, endMs: 12000, speed: 2 },
			],
		);
		expect(at(document, [cue(3), cue(5)])).toEqual([2.5, 4.5, 12]);
		expect(placedClickHits(document, asset as never, [cue(3)]).map((p) => p.clipId)).toEqual([
			"clip_1",
			"clip_2",
		]);
	});
});

describe("placedClickHits", () => {
	it("hears what the export hears, even for a cut narrower than the seek threshold", () => {
		// The preview's playhead steps over a tenth-of-a-second cut as an ordinary frame, so the
		// crossing alone would fire this click. Placement is what says it is not in the film.
		const document = doc([clip()], [], [cut(2, 0.1)]);
		const cues = [cue(2.05), cue(3)];
		expect(crossedClickHits(cues, 1.99, 2.11).map((c) => c.timeSec)).toEqual([2.05]);
		expect(placedClickHits(document, asset as never, cues).map((p) => p.cue.timeSec)).toEqual([3]);
		expect(placeClickHits(document, asset as never, [cue(2.05)])).toEqual([]);
	});

	it("names the clip that plays the click, when a twin clip cuts it away", () => {
		// The same recording twice, with a cut on the first one only: the export places the click on
		// the second clip, and the preview must not fire it while the first clip's clock is running.
		const document = doc(
			[
				clip(),
				clip({
					id: "clip_2",
					timelineStartSec: 10,
					timelineEndSec: 20,
					sourceStartSec: 0,
					sourceEndSec: 10,
				}),
			],
			[],
			[cut(2, 0.1)],
		);
		expect(placedClickHits(document, asset as never, [cue(2.05)]).map((p) => p.clipId)).toEqual([
			"clip_2",
		]);
	});

	it("keeps every click of an edit that cuts nothing out", () => {
		const cues = [cue(1), cue(2.05), cue(5)];
		expect(placedClickHits(doc([clip()]), asset as never, cues).map((p) => p.cue.timeSec)).toEqual([
			1, 2.05, 5,
		]);
	});
});

describe("takeCrossedClickHits with a mounted clip", () => {
	// The placement test above says which clip keeps the click; this says the preview listens to it.
	const document = doc(
		[clip(), clip({ id: "clip_2", timelineStartSec: 10, timelineEndSec: 20 })],
		[],
		[cut(2, 0.1)],
	);

	it("fires a click a twin clip keeps only over the clip that keeps it", async () => {
		const getTelemetry = vi
			.spyOn(nativeBridgeClient.cursor, "getTelemetry")
			.mockResolvedValue([point(2050, "click")]);
		try {
			await loadClickCues(asset.originalPath);
			clickSoundForDocument(document, { clickSound: true, clickSoundGainDb: 0 });
			// clip_1 cut 2..2.1 away, so its clock owes nothing across it.
			resetClickPlayhead();
			takeCrossedClickHits(2, asset.originalPath, "clip_1");
			expect(takeCrossedClickHits(2.06, asset.originalPath, "clip_1")).toEqual([]);
			resetClickPlayhead();
			takeCrossedClickHits(2, asset.originalPath, "clip_2");
			expect(
				takeCrossedClickHits(2.06, asset.originalPath, "clip_2").map((c) => c.timeSec),
			).toEqual([2.05]);
			// An unresolved clip id is not a reason to go silent: the edit's whole list plays.
			resetClickPlayhead();
			takeCrossedClickHits(2, asset.originalPath);
			expect(takeCrossedClickHits(2.06, asset.originalPath).map((c) => c.timeSec)).toEqual([2.05]);
		} finally {
			getTelemetry.mockRestore();
		}
	});

	it("fires a click over each clip that keeps it, and once when the clip is unresolved", async () => {
		const getTelemetry = vi
			.spyOn(nativeBridgeClient.cursor, "getTelemetry")
			.mockResolvedValue([point(2050, "click")]);
		try {
			await loadClickCues(asset.originalPath);
			// No cut: both copies keep the click.
			clickSoundForDocument(doc([clip(), clip({ id: "clip_2", timelineStartSec: 10 })]), {
				clickSound: true,
				clickSoundGainDb: 0,
			});
			for (const clipId of ["clip_1", "clip_2", undefined]) {
				resetClickPlayhead();
				takeCrossedClickHits(2, asset.originalPath, clipId);
				expect(
					takeCrossedClickHits(2.06, asset.originalPath, clipId).map((c) => c.timeSec),
				).toEqual([2.05]);
			}
		} finally {
			getTelemetry.mockRestore();
		}
	});
});

describe("levelClickCues", () => {
	it("scales every cue by the level the user set, and leaves 0 dB alone", () => {
		const cues = [cue(1), { timeSec: 2, gain: 0.85, release: true }];
		// The very same list at unity: nothing is rebuilt, so the cache stays the cache.
		expect(levelClickCues(cues, 0)).toBe(cues);
		const louder = levelClickCues(cues, 6);
		expect(louder[0].gain).toBeCloseTo(1.995, 3);
		expect(louder[1].gain).toBeCloseTo(1.696, 3);
		expect(louder[1].release).toBe(true);
	});
});

describe("clickCuesFitTake", () => {
	it("goes silent only on a known mismatch of takes", () => {
		expect(clickCuesFitTake("/t/a.mp4", "/t/a.mp4")).toBe(true);
		expect(clickCuesFitTake("/t/a.mp4", "/t/b.mp4")).toBe(false);
		// A source whose path is not resolved yet, and a document with no cues stashed, are not
		// mismatches: neither is a reason to stop hearing the sound.
		expect(clickCuesFitTake("/t/a.mp4", undefined)).toBe(true);
		expect(clickCuesFitTake(undefined, "/t/b.mp4")).toBe(true);
	});
});

describe("crossedClickHits", () => {
	const cues = [cue(1), cue(2.02), cue(3)];

	it("fires the hits between two readings of the playhead", () => {
		expect(crossedClickHits(cues, 1.99, 2.05).map((c) => c.timeSec)).toEqual([2.02]);
	});

	it("fires nothing across a seek, which is a jump too big for one frame", () => {
		expect(crossedClickHits(cues, 0.5, 2.5)).toEqual([]);
	});

	it("fires nothing on a move backwards, and consumes nothing", () => {
		expect(crossedClickHits(cues, 3, 1)).toEqual([]);
		// Rewound and played again, the same clicks are still there to cross.
		expect(crossedClickHits(cues, 0.95, 1.01).map((c) => c.timeSec)).toEqual([1]);
	});

	it("fires nothing before the playhead has a position to compare with", () => {
		expect(crossedClickHits(cues, Number.NaN, 1)).toEqual([]);
	});
});

describe("playClickHits", () => {
	// The smallest context that records a `start()`: a real AudioContext needs a media pipeline.
	type FakeNode = { connect: () => FakeNode };
	const node = (): FakeNode => ({ connect: node });
	const context = (started: number[]) =>
		({
			state: "running",
			createGain: () => ({ gain: { value: 0 }, connect: node }),
			createBufferSource: () => ({ buffer: null, connect: node, start: () => started.push(1) }),
		}) as never;
	const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

	it("plays every hit it is handed while the preview is running", async () => {
		const started: number[] = [];
		const cues = [cue(1), { timeSec: 2, gain: 1, release: true }];
		playClickHits(context(started), node() as never, Promise.resolve([{}, {}] as never[]), cues);
		await settled();
		expect(started.length).toBe(2);
	});

	it("drops hits still being decoded when the preview stopped in the meantime", async () => {
		// The sample decodes on its own time, so a crossing can be queued and land after the stop.
		let decode!: (buffers: never[]) => void;
		const pending = new Promise<never[]>((resolve) => (decode = resolve));
		const started: number[] = [];
		playClickHits(context(started), node() as never, pending, [cue(1)]);
		resetClickPlayhead();
		decode([{}, {}] as never[]);
		await settled();
		expect(started).toEqual([]);
	});
});

describe("clickSoundForDocument outside a renderer", () => {
	it("reads no sidecar where there is no bridge to read it through", () => {
		// This file runs in node, like the main process when getFrames renders from the document.
		const getTelemetry = vi.spyOn(nativeBridgeClient.cursor, "getTelemetry");
		try {
			const unread = {
				project: { primaryAssetId: "asset_1" },
				assets: [{ ...asset, originalPath: "/never-read.mp4" }],
				audioTracks: [],
				timeline: { clips: [clip()], trimRanges: [], speedRanges: [] },
				legacyEditor: { speedRegions: [] },
			} as never;
			expect(clickSoundForDocument(unread, { clickSound: true, clickSoundGainDb: 0 })).toBeNull();
			expect(getTelemetry).not.toHaveBeenCalled();
		} finally {
			getTelemetry.mockRestore();
		}
	});
});

describe("ensureClickHitPaths", () => {
	it("stages the two samples once when two callers ask at the same time", async () => {
		const stage = vi.fn(async (name: string) => ({ success: true, path: `/sfx/${name}` }));
		vi.stubGlobal("window", {
			location: { href: "http://localhost/" },
			electronAPI: { stageClickSoundHit: stage },
		});
		vi.stubGlobal("fetch", async () => new Response(new Uint8Array([1])));
		try {
			const [a, b] = await Promise.all([ensureClickHitPaths(), ensureClickHitPaths()]);
			expect(a).toEqual({
				down: "/sfx/mouse-realistic-single.wav",
				up: "/sfx/mouse-realistic-double.wav",
			});
			expect(b).toBe(a);
			expect(stage).toHaveBeenCalledTimes(2);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
