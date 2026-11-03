// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { syncRecordingAudio } from "@/lib/ai-edition/document/recordingAudio";
import { createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { useTranscriptionStore } from "@/lib/ai-edition/store/transcriptionStore";
import { transcriptFromSegments } from "@/lib/ai-edition/transcription/fromStt";
import { CaptionSrtExport } from "./CaptionSrtExport";

const mocks = vi.hoisted(() => ({ save: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/native/client", () => ({ nativeBridgeClient: { aiEdition: {} } }));

function show() {
	const doc = createEmptyDocument({ projectId: "srt-ui", title: "Caption test" });
	doc.assets = [
		{
			id: "v",
			kind: "video",
			label: "Video",
			cameraTrack: null,
			originalPath: "/media/video.mp4",
			durationSec: 10,
			recordingAudio: [
				{ kind: "system", assetId: "s" },
				{ kind: "microphone", assetId: "m" },
			],
		},
		...["s", "m"].map((id) => ({
			id,
			kind: "audio" as const,
			label: id,
			cameraTrack: null,
			originalPath: `/media/${id}.m4a`,
			durationSec: 10,
		})),
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
			origin: "user",
			reason: "",
		},
	];
	doc.transcripts = [
		transcriptFromSegments("s", [{ startSec: 1, endSec: 2, text: "System caption" }], "en"),
		transcriptFromSegments("m", [{ startSec: 3, endSec: 4, text: "Microphone caption" }], "en"),
	];
	useProjectStore.setState({ document: syncRecordingAudio(doc) });
	render(
		<I18nProvider>
			<CaptionSrtExport />
		</I18nProvider>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	useProjectStore.getState().clear();
	useTranscriptionStore.getState().reset();
	vi.stubGlobal("electronAPI", { saveCaptionSrt: mocks.save });
	mocks.save.mockResolvedValue({ success: true });
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("SRT export control", () => {
	it.each([
		["System audio", "system", "System caption", "Microphone caption"],
		["Microphone", "microphone", "Microphone caption", "System caption"],
	])("exports only %s, even with captions hidden", async (label, source, included, excluded) => {
		show();
		const before = JSON.stringify(useProjectStore.getState().document);
		fireEvent.click(screen.getByRole("button", { name: "Export SRT" }));
		fireEvent.click(
			within(screen.getByRole("dialog")).getByRole("button", { name: `${label} (.srt)` }),
		);
		await waitFor(() => expect(mocks.success).toHaveBeenCalled());
		expect(mocks.save).toHaveBeenCalledWith(
			`Caption test-${source}.srt`,
			expect.stringContaining(included),
		);
		expect(mocks.save.mock.calls[0][1]).not.toContain(excluded);
		expect(JSON.stringify(useProjectStore.getState().document)).toBe(before);
	});
	it("treats a dismissed save dialog as cancellation and lets the user retry", async () => {
		mocks.save.mockResolvedValueOnce({ success: false, canceled: true });
		show();
		fireEvent.click(screen.getByRole("button", { name: "Export SRT" }));
		fireEvent.click(screen.getByRole("button", { name: "System audio (.srt)" }));
		await waitFor(() => expect(screen.getByRole("button", { name: "Export SRT" })).toBeEnabled());
		expect(mocks.error).not.toHaveBeenCalled();
		expect(mocks.success).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Export SRT" }));
		fireEvent.click(screen.getByRole("button", { name: "Microphone (.srt)" }));
		await waitFor(() => expect(mocks.success).toHaveBeenCalled());
	});
	it("reports a save failure and restores the export control", async () => {
		mocks.save.mockRejectedValueOnce(new Error("write failed"));
		show();
		fireEvent.click(screen.getByRole("button", { name: "Export SRT" }));
		fireEvent.click(screen.getByRole("button", { name: "System audio (.srt)" }));
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith("Could not export SRT subtitles."),
		);
		expect(screen.getByRole("button", { name: "Export SRT" })).toBeEnabled();
	});
	it("disables export until a transcript is available", () => {
		render(
			<I18nProvider>
				<CaptionSrtExport />
			</I18nProvider>,
		);
		expect(screen.getByRole("button", { name: "Export SRT" })).toBeDisabled();
	});
});
