// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
	addLayoutChange,
	layoutRuns,
	patchLayoutCamera,
	setLayoutPreset,
} from "@/lib/ai-edition/document/layout";
import { layoutCameraSettings } from "@/lib/ai-edition/layoutCamera";

import { type AxcutDocument, createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { CameraLayoutPane } from "./CameraLayoutPane";

vi.mock("@/contexts/I18nContext", () => ({ useScopedT: () => (key: string) => key }));
const original = useProjectStore.getState();
afterEach(() => {
	cleanup();
	useProjectStore.setState(original, true);
});

function open() {
	let doc = createEmptyDocument({ projectId: "camera-pane", title: "Camera settings" });
	doc.assets = [
		{
			id: "video",
			kind: "video",
			label: "Recording",
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
			assetId: "video",
			sourceStartSec: 0,
			sourceEndSec: 10,
			timelineStartSec: 0,
			timelineEndSec: 10,
			wordRefs: [],
			origin: "agent",
			reason: "Take",
		},
	];
	doc = addLayoutChange(doc, 2, "picture-in-picture");
	const selected = layoutRuns(doc).find((r) => r.start === 2)!.member;
	doc = patchLayoutCamera(doc, selected.id, layoutCameraSettings(doc));
	const save = vi.fn(async (next: AxcutDocument) => {
		useProjectStore.setState({ document: next });
		return true;
	});
	useProjectStore.setState({ document: doc, projectId: doc.project.id, saveDocument: save });
	const remove = vi.fn();
	render(<CameraLayoutPane regionId={selected.id} onDelete={remove} />);
	return { selected, save, remove };
}

it("configures the selected segment's position and size without altering neighbouring styles", async () => {
	const { selected, save } = open();
	const neighbours = (useProjectStore.getState().document!.layoutRegions ?? []).filter(
		(r) => r.id !== selected.id,
	);
	await act(async () =>
		fireEvent.click(screen.getByRole("button", { name: "layout.anchors.center" })),
	);
	expect(
		(useProjectStore.getState().document!.layoutRegions ?? []).find((r) => r.id === selected.id)
			?.camera?.anchor,
	).toBe("center");
	const slider = screen.getByRole("slider", { name: "layout.webcamSize" });
	fireEvent.change(slider, { target: { value: "60" } });
	await act(async () => fireEvent.mouseUp(slider));
	const after = useProjectStore.getState().document!.layoutRegions ?? [];
	expect(after.find((r) => r.id === selected.id)?.camera?.size).toBe(60);
	expect(after.filter((r) => r.id !== selected.id)).toEqual(neighbours);
	expect(save).toHaveBeenCalled();
});
it("keeps camera roundness editable in block layouts without offering ineffective size controls", async () => {
	const { selected } = open();
	await act(async () => {
		useProjectStore.setState({
			document: setLayoutPreset(useProjectStore.getState().document!, selected.id, "dual-frame"),
		});
	});
	expect(screen.queryByRole("slider", { name: "layout.webcamSize" })).toBeNull();
	const slider = screen.getByRole("slider", { name: "effects.roundness" });
	fireEvent.change(slider, { target: { value: "20" } });
	await act(async () => fireEvent.mouseUp(slider));
	expect(
		layoutRuns(useProjectStore.getState().document!).find((r) => r.ids.includes(selected.id))!
			.member.camera?.roundness,
	).toBe(0.2);
});
