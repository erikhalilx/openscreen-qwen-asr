// @vitest-environment jsdom
// The caption pane's fixed choices are rows of buttons and its word counts are sliders: one
// click each, no list to open. The translation target stays a list — fifteen languages.

import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { getCaptionSettings } from "@/lib/ai-edition/captions";
import { getRecordedCaptionOptions } from "@/lib/ai-edition/captions/recordedSources";
import { type AxcutDocument, createAudioTrack, createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { useTranscriptionStore } from "@/lib/ai-edition/store/transcriptionStore";
import { CaptionsPane } from "./CaptionsPane";

vi.mock("@/native", () => ({ nativeBridgeClient: { aiEdition: {} } }));
vi.mock("@/native/client", () => ({ nativeBridgeClient: { aiEdition: {} } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function show(legacyEditor: Record<string, unknown> = {}, withSources = false) {
	const base = createEmptyDocument({ title: "T", projectId: "p1" });
	if (withSources)
		base.audioTracks = (["system", "microphone"] as const).map((recordingSource) => ({
			...createAudioTrack({ assetId: recordingSource, durationSec: 10, spanSec: 10 }),
			recordingSource,
		}));
	useProjectStore.setState({
		document: { ...base, legacyEditor: { captions: { enabled: true }, ...legacyEditor } },
	});
	render(
		<I18nProvider>
			<CaptionsPane />
		</I18nProvider>,
	);
}

const stored = () => getCaptionSettings(useProjectStore.getState().document as AxcutDocument);

beforeEach(() => {
	useTranscriptionStore.getState().reset();
	useProjectStore.getState().clear();
});

afterEach(() => {
	cleanup();
});

describe("caption choices", () => {
	it("shows the actual inner-caption inset and excludes the collision dead zone", () => {
		show({}, true);
		const inset = screen.getByRole("slider", { name: "Distance from bottom" });
		const minimum = Number(inset.getAttribute("min"));
		expect(minimum).toBeGreaterThan(0);
		expect(minimum).toBeLessThan(12);
		expect(inset).toHaveValue(String(minimum));
		fireEvent.change(inset, { target: { value: String(minimum + 0.5) } });
		expect(getCaptionSettings(useProjectStore.getState().document, 16 / 9, "system").insetY).toBe(
			minimum + 0.5,
		);
		fireEvent.click(screen.getByRole("button", { name: "Microphone", pressed: true }));
		expect(screen.getByRole("slider", { name: "Distance from bottom" })).toHaveAttribute(
			"min",
			"0",
		);
	});
	it("offers separate caption visibility, height swap and per-source style controls", () => {
		show({}, true);
		const styleSources = screen.getByRole("group", { name: "Style settings for" });
		fireEvent.click(within(styleSources).getByRole("button", { name: "Microphone" }));
		fireEvent.change(screen.getByRole("slider", { name: "Size" }), {
			target: { value: "66" },
		});
		expect(
			getCaptionSettings(useProjectStore.getState().document, 16 / 9, "microphone").fontSize,
		).toBe(66);
		expect(getCaptionSettings(useProjectStore.getState().document, 16 / 9, "system").fontSize).toBe(
			48,
		);
		fireEvent.click(screen.getByRole("button", { name: "Swap caption heights" }));
		expect(getRecordedCaptionOptions(useProjectStore.getState().document).swap).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: "System audio", pressed: true }));
		expect(getRecordedCaptionOptions(useProjectStore.getState().document).system.enabled).toBe(
			false,
		);
		expect(screen.getByRole("button", { name: "Swap caption heights" })).toBeDisabled();
	});
	it("offers the display language only once there is a translation to switch to", () => {
		show();
		expect(screen.queryByRole("group", { name: "Display" })).not.toBeInTheDocument();
		cleanup();

		show({ captionTranslations: { fr: { label: "Français", byAsset: {} } } });
		const row = screen.getByRole("group", { name: "Display" });
		expect(within(row).getByRole("button", { name: "Original (transcript)" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		fireEvent.click(within(row).getByRole("button", { name: "Français" }));
		expect(stored().language).toBe("fr");
	});

	it("shows each font as a specimen of itself and writes the one clicked", () => {
		show();
		const lora = within(screen.getByRole("group", { name: "Font", hidden: true })).getByRole(
			"button",
			{ name: "Lora", hidden: true },
		);
		expect(lora.querySelector("span")).toHaveStyle({ fontFamily: "Lora" });
		fireEvent.click(lora);
		expect(stored().fontFamily).toBe("Lora");
	});

	it("never lets the minimum words per line pass the maximum", () => {
		show({ captions: { enabled: true, minWordsPerLine: 2, maxWordsPerLine: 5 } });
		fireEvent.change(screen.getByRole("slider", { name: "Min words per line" }), {
			target: { value: "9" },
		});
		expect(stored()).toMatchObject({ minWordsPerLine: 5, maxWordsPerLine: 5 });
		fireEvent.change(screen.getByRole("slider", { name: "Max words per line" }), {
			target: { value: "1" },
		});
		expect(stored()).toMatchObject({ minWordsPerLine: 5, maxWordsPerLine: 5 });
	});
});
