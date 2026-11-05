// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type AxcutDocument, createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { AudioPane } from "./RightPanes";

const telemetry = vi.hoisted(() => vi.fn());
vi.mock("@/native/client", () => ({ nativeBridgeClient: { cursor: { getTelemetry: telemetry } } }));
vi.mock("@/contexts/I18nContext", () => ({ useScopedT: () => (key: string) => key }));
const original = useProjectStore.getState();
beforeEach(() => {
	vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
	telemetry.mockResolvedValue([{ timeMs: 1000, cx: 0.5, cy: 0.5, interactionType: "click" }]);
});
afterEach(() => {
	vi.restoreAllMocks();
	cleanup();
	useProjectStore.setState(original, true);
});

function open(path: string) {
	const doc = createEmptyDocument({ projectId: path, title: "Sound controls" });
	doc.assets = [
		{
			id: "video",
			kind: "video",
			label: "Recording",
			originalPath: path,
			durationSec: 10,
			cameraTrack: null,
		},
	];
	doc.project.primaryAssetId = "video";
	doc.legacyEditor = { cursorShow: false, cursorClickSound: false };
	const save = vi.fn(async (next: AxcutDocument) => {
		useProjectStore.setState({ document: next });
		return true;
	});
	useProjectStore.setState({ document: doc, projectId: path, saveDocument: save });
	render(<AudioPane />);
	return save;
}

it("edits and persists click audio while the cursor is hidden, independently of recording gains", async () => {
	const save = open("/media/click-controls.mp4");
	const toggle = screen.getByRole("button", { name: "cursor.clickSound" });
	await waitFor(() => expect(toggle).toBeEnabled());
	expect(screen.getByText("audio.mouseEffects")).toBeInTheDocument();
	expect(screen.getByRole("slider", { name: "cursor.clickSoundVolume" })).toBeDisabled();
	await act(async () => {
		fireEvent.click(toggle);
	});
	expect(useProjectStore.getState().document?.legacyEditor?.cursorClickSound).toBe(true);
	const slider = screen.getByRole("slider", { name: "cursor.clickSoundVolume" });
	expect(slider).toBeEnabled();
	fireEvent.change(slider, { target: { value: "-12" } });
	await act(async () => {
		fireEvent.mouseUp(slider);
	});
	expect(useProjectStore.getState().document?.legacyEditor?.cursorClickSoundGainDb).toBe(-12);
	expect(useProjectStore.getState().document?.legacyEditor?.cursorShow).toBe(false);
	expect(save).toHaveBeenCalled();
	await act(async () => {
		fireEvent.click(toggle);
	});
	expect(useProjectStore.getState().document?.legacyEditor?.cursorClickSound).toBe(false);
});

it("does not enable sounds for a recording without captured click events", async () => {
	telemetry.mockResolvedValue([]);
	open("/media/no-click-controls.mp4");
	await screen.findByText("audio.noMouseClicks");
	expect(screen.getByRole("button", { name: "cursor.clickSound" })).toBeDisabled();
});

it("persists the selected sound set independently of its enable switch", async () => {
	open("/media/sound-presets.mp4");
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "audio.mouseBubble" }));
	});
	expect(useProjectStore.getState().document?.legacyEditor?.cursorClickSoundPreset).toBe("bubble");
	expect(useProjectStore.getState().document?.legacyEditor?.cursorClickSound).toBe(false);
});

it("previews one single click per press, including the selected preset", async () => {
	const save = open("/media/sound-preview.mp4");
	const realistic = screen.getByRole("button", { name: "audio.mouseRealistic" });
	const bubble = screen.getByRole("button", { name: "audio.mouseBubble" });
	await act(async () => {
		fireEvent.click(realistic);
		fireEvent.click(realistic);
	});
	expect(save).not.toHaveBeenCalled();
	await act(async () => {
		fireEvent.click(bubble);
	});
	await act(async () => {
		fireEvent.click(bubble);
	});
	const played = vi
		.mocked(HTMLMediaElement.prototype.play)
		.mock.contexts.map((audio) =>
			audio instanceof HTMLMediaElement ? new URL(audio.src).pathname.split("/").pop() : null,
		);
	expect(played).toEqual([
		"mouse-realistic-single.wav",
		"mouse-realistic-single.wav",
		"mouse-bubble-single.wav",
		"mouse-bubble-single.wav",
	]);
	expect(save).toHaveBeenCalledOnce();
	expect(useProjectStore.getState().document?.legacyEditor?.cursorClickSound).toBe(false);
});
