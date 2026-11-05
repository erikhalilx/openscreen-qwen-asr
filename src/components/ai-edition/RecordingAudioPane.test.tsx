// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { type AxcutDocument, createAudioTrack, createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { AudioPane, AudioTrackPane } from "./RightPanes";

vi.mock("@/contexts/I18nContext", () => ({ useScopedT: () => (key: string) => key }));
const original = useProjectStore.getState();
afterEach(() => {
	cleanup();
	useProjectStore.setState(original, true);
});

it("edits each source independently and applies the Audio panel gain across that source's clips", async () => {
	const doc = createEmptyDocument({ projectId: "p", title: "Two sources" });
	const system = {
		...createAudioTrack({ assetId: "s", durationSec: 10, timelineStartSec: 0, spanSec: 10 }),
		id: "sys",
		gainDb: 0,
		recordingSource: "system" as const,
	};
	const mic = { ...system, id: "mic", assetId: "m", recordingSource: "microphone" as const };
	doc.audioTracks = [system, { ...system, id: "sys-copy", startMs: 10_000, endMs: 20_000 }, mic];
	const save = vi.fn(async (_document: AxcutDocument, _options: { history: boolean }) => true);
	useProjectStore.setState({ document: doc, projectId: "p", saveDocument: save });
	const { unmount } = render(<AudioPane />);
	expect(screen.getAllByRole("slider")).toHaveLength(4);
	expect(screen.getByRole("slider", { name: "cursor.clickSoundVolume" })).toBeDisabled();
	const slider = screen.getByRole("slider", { name: "audio.systemSource" });
	fireEvent.change(slider, { target: { value: "-12" } });
	await act(async () => {
		fireEvent.mouseUp(slider);
	});
	expect(save).toHaveBeenCalledTimes(1);
	expect(save.mock.calls[0][0].audioTracks.map((t) => t.gainDb)).toEqual([-12, -12, 0]);
	expect(save.mock.calls[0][1]).toEqual({ history: true });
	unmount();
	render(
		<AudioTrackPane
			tl={
				{
					selectedAudioTrackId: "mic",
					audioTracks: [mic],
					assets: [],
					clearSelection: vi.fn(),
				} as never
			}
		/>,
	);
	expect(screen.getByRole("slider", { name: "audio.microphoneSource" })).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "audioTrack.remove" })).toBeNull();
});
