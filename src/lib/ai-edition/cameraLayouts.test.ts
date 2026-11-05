import { describe, expect, it } from "vitest";
import { WEBCAM_ANCHORS, webcamAnchorFractions } from "@/lib/projectDefaults";
import {
	addCameraLayout,
	buildCameraLayoutFrames,
	type CameraLayoutFrame,
	cameraLayoutAt,
	defaultCameraLayout,
	enableCameraLayouts,
	patchCameraLayout,
	readCameraLayouts,
} from "./cameraLayouts";
import { createEmptyDocument } from "./schema";
import { coalesceRegionsForRuler } from "./timeline/timelineMap";

function document() {
	const doc = createEmptyDocument({ projectId: "camera-layout-test", title: "Camera layouts" });
	doc.assets = [
		{
			id: "screen",
			kind: "video",
			label: "Screen",
			originalPath: "/media/screen.mp4",
			durationSec: 10,
			cameraTrack: {
				sourcePath: "/media/camera.mp4",
				startMs: 0,
				offsetMs: 0,
				visible: true,
				width: 1280,
				height: 720,
			},
		},
	];
	doc.timeline.clips = [
		{
			id: "clip",
			assetId: "screen",
			sourceStartSec: 0,
			sourceEndSec: 10,
			timelineStartSec: 0,
			timelineEndSec: 10,
			wordRefs: [],
			origin: "agent",
			reason: "Recording",
		},
	];
	doc.legacyEditor = {
		webcamAnchor: "bottom-right",
		webcamSizePreset: 40,
		webcamReactiveZoom: true,
	};
	return doc;
}
let serial = 0;
const id = () => `layout_${++serial}`;
const frames = (doc: ReturnType<typeof document>) =>
	buildCameraLayoutFrames(doc, { width: 1920, height: 1080 }, { width: 1920, height: 1080 });

describe("camera layout editing", () => {
	it("opts in without losing the existing camera or legacy fullscreen sections", () => {
		const doc = document();
		doc.legacyEditor = {
			...doc.legacyEditor,
			cameraFullscreenRegions: [{ id: "full", startMs: 2000, endMs: 4000 }],
		};
		const next = enableCameraLayouts(doc, id);
		expect(readCameraLayouts(next).map((r) => [r.startMs, r.endMs, r.cameraLayout?.mode])).toEqual([
			[0, 2000, "pip"],
			[2000, 4000, "fullscreen"],
			[4000, 10000, "pip"],
		]);
		expect(next.assets).toBe(doc.assets);
		expect(enableCameraLayouts(next, id)).toBe(next);
	});
	it("inserts independently editable segments, including equal touching styles", () => {
		const doc = document(),
			style = defaultCameraLayout(doc);
		const a = addCameraLayout(doc, 2000, 4000, style, id);
		const b = addCameraLayout(a, 4000, 6000, style, id);
		expect(coalesceRegionsForRuler(readCameraLayouts(b))).toHaveLength(4);
		const selected = readCameraLayouts(b).find((r) => r.startMs === 2000)!;
		const next = patchCameraLayout(b, selected.id, { anchor: "center", size: 60, roundness: 1 });
		expect(readCameraLayouts(next).find((r) => r.id === selected.id)?.cameraLayout).toMatchObject({
			anchor: "center",
			size: 60,
			roundness: 1,
		});
		expect(readCameraLayouts(next).find((r) => r.startMs === 4000)?.cameraLayout).toEqual(style);
		expect(next.assets).toBe(b.assets);
		expect(next.timeline).toBe(b.timeline);
	});
	it("does not create a hidden state by removing media or audio", () => {
		const doc = enableCameraLayouts(document(), id);
		doc.legacyEditor = { ...doc.legacyEditor, cameraFullscreenRegions: [] };
		expect(frames(doc)).toEqual([]);
		expect(doc.assets[0].cameraTrack?.sourcePath).toBe("/media/camera.mp4");
		expect(doc.assets[0].cameraTrack?.visible).toBe(true);
	});
	it("uses retained programme time after trims and speed edits", () => {
		let doc = document();
		doc = addCameraLayout(doc, 4000, 8000, { ...defaultCameraLayout(doc), mode: "fullscreen" }, id);
		doc.timeline.trimRanges = [
			{
				id: "trim",
				assetId: "screen",
				clipId: "clip",
				startSec: 1,
				endSec: 3,
				origin: "agent",
				reason: "Cut",
			},
		];
		doc.legacyEditor = {
			...doc.legacyEditor,
			speedRegions: [{ id: "speed", startMs: 4000, endMs: 8000, speed: 2 }],
		};
		expect(
			frames(doc)
				.filter((r) => r.fullscreen)
				.map((r) => [r.startSec, r.endSec]),
		).toEqual([[2, 4]]);
	});
	it("follows clip anchors when ruler caches are stale after a reorder", () => {
		const doc = enableCameraLayouts(document(), id);
		doc.timeline.clips[0] = { ...doc.timeline.clips[0], timelineStartSec: 5, timelineEndSec: 15 };
		// There is no footage in the preceding gap: the output clock still starts at zero.
		expect(frames(doc).map((r) => [r.startSec, r.endSec])).toEqual([[0, 10]]);
	});
	it("centres the new anchor on the same axes as all edge-middle anchors", () => {
		for (const anchor of ["top", "bottom", "left", "right", "center"] as const) {
			const doc = document();
			const enabled = addCameraLayout(doc, 0, 10000, { ...defaultCameraLayout(doc), anchor }, id);
			const r = frames(enabled)[0].rect;
			const [x, y] = webcamAnchorFractions(anchor);
			if (x === 0.5) expect(Math.abs(r.x + r.width / 2 - 0.5) * 1920).toBeLessThanOrEqual(0.51);
			if (y === 0.5) expect(Math.abs(r.y + r.height / 2 - 0.5) * 1080).toBeLessThanOrEqual(0.51);
		}
	});
});

describe("camera layout transitions", () => {
	const states: CameraLayoutFrame[] = [
		...WEBCAM_ANCHORS.map((anchor, i) => ({
			startSec: 0,
			endSec: 2,
			rect: { x: (i % 3) * 0.3, y: Math.floor(i / 3) * 0.3, width: 0.2, height: 0.2 },
			radius: 0.04,
			fullscreen: false,
			reactiveZoom: true,
			anchor: webcamAnchorFractions(anchor),
		})),
		{
			startSec: 0,
			endSec: 2,
			rect: { x: 0, y: 0, width: 1, height: 1 },
			radius: 0,
			fullscreen: true,
			reactiveZoom: false,
			anchor: [0.5, 0.5],
		},
	];
	it("keeps every adjacent pair of the ten layouts visible and continuous", () => {
		for (const a of states)
			for (const state of states) {
				const b = { ...state, startSec: 2, endSec: 4 };
				const list = [a, b];
				const before = cameraLayoutAt(list, 2 - 1e-6)!,
					after = cameraLayoutAt(list, 2 + 1e-6)!;
				expect(before.opacity).toBe(1);
				expect(after.opacity).toBe(1);
				for (const key of ["x", "y", "width", "height"] as const)
					expect(Math.abs(before.rect[key] - after.rect[key])).toBeLessThan(0.0001);
				for (const key of ["x", "y", "width", "height"] as const) {
					expect(cameraLayoutAt(list, 1.75)?.rect[key]).toBeCloseTo(a.rect[key], 8);
					expect(cameraLayoutAt(list, 2.25)?.rect[key]).toBeCloseTo(b.rect[key], 8);
				}
			}
	});
	it("fades to hidden only inside a segment and handles short segments", () => {
		const list = [
			{ ...states[0], startSec: 1, endSec: 1.1 },
			{ ...states[9], startSec: 2, endSec: 3 },
		];
		expect(cameraLayoutAt(list, 0.99)).toBeNull();
		expect(cameraLayoutAt(list, 1.2)).toBeNull();
		expect(cameraLayoutAt(list, 1)?.opacity).toBe(0);
		expect(cameraLayoutAt(list, 1.05)?.opacity).toBeCloseTo(1);
		expect(cameraLayoutAt(list, 2.05)?.opacity).toBeGreaterThan(0);
		expect(cameraLayoutAt(list, 2.05)?.opacity).toBeLessThan(1);
	});
});
