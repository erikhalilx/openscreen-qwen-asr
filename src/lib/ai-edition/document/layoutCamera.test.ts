import { expect, it } from "vitest";
import { buildSceneDescription } from "@/native/sceneDescription";
import { layoutCameraSettings } from "../layoutCamera";
import { createEmptyDocument, documentSchema } from "../schema";
import {
	addLayoutChange,
	layoutRuns,
	moveLayoutBoundary,
	patchLayoutCamera,
	setLayoutPreset,
} from "./layout";

function project() {
	const d = createEmptyDocument({ projectId: "layout", title: "Layout" });
	d.assets = [
		{
			id: "screen",
			kind: "video",
			label: "Screen",
			originalPath: "/screen.mp4",
			durationSec: 10,
			cameraTrack: {
				sourcePath: "/cam.mp4",
				visible: true,
				startMs: 0,
				offsetMs: 0,
				width: 1280,
				height: 720,
			},
		},
	];
	d.timeline.clips = [
		{
			id: "clip",
			assetId: "screen",
			sourceStartSec: 0,
			sourceEndSec: 10,
			timelineStartSec: 0,
			timelineEndSec: 10,
			wordRefs: [],
			origin: "user",
			reason: "Take",
		},
	];
	return d;
}
it("keeps distinct parameters through preset changes, boundary moves and save/reopen", () => {
	let d = addLayoutChange(project(), 4, "picture-in-picture");
	const id = layoutRuns(d)[1].ids[0];
	const camera = {
		...layoutCameraSettings(d),
		anchor: "top-left" as const,
		size: 55,
		roundness: 0.2,
	};
	d = patchLayoutCamera(d, id, camera);
	d = setLayoutPreset(d, id, "dual-frame");
	d = moveLayoutBoundary(d, id, 5);
	const reopened = documentSchema.parse(JSON.parse(JSON.stringify(d)));
	expect(layoutRuns(reopened)).toHaveLength(2);
	expect(layoutRuns(reopened)[1]).toMatchObject({
		start: 5,
		member: { preset: "dual-frame", camera },
	});
	expect(layoutRuns(reopened)[0].member.camera).toBeUndefined();
});
it("feeds both ends of the native transition from the correct segment parameters", () => {
	let d = addLayoutChange(project(), 4, "picture-in-picture");
	let runs = layoutRuns(d);
	d = patchLayoutCamera(d, runs[0].ids[0], {
		...layoutCameraSettings(d),
		anchor: "top-left",
		size: 20,
		roundness: 0.2,
	});
	runs = layoutRuns(d);
	d = patchLayoutCamera(d, runs[1].ids[0], {
		...layoutCameraSettings(d),
		anchor: "bottom-right",
		size: 50,
		roundness: 0.8,
	});
	const scene = buildSceneDescription(d);
	const r = scene.layoutRegions![1];
	expect(r.preset).toBe("picture-in-picture");
	expect(r.fromLayout!.webcamRect!.x).toBeLessThan(r.layout.webcamRect!.x);
	expect(r.layout.webcamRect!.width).toBeGreaterThan(r.fromLayout!.webcamRect!.width);
	expect(r.fromLayout!.webcamRadiusFrac).toBeCloseTo(0.1);
	expect(r.layout.webcamRadiusFrac).toBeCloseTo(0.4);
});
