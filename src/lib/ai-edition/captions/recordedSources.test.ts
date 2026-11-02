import { describe, expect, it } from "vitest";
import { buildSceneDescription } from "@/native/sceneDescription";
import { syncRecordingAudio } from "../document/recordingAudio";
import { setDocumentWordText } from "../document/transcript";
import { createEmptyDocument } from "../schema";
import { buildAggregatedSections, lanePlacements } from "../timeline/aggregated-transcript";
import { removedRawSpans } from "../timeline/programme-time";
import { transcriptFromSegments } from "../transcription/fromStt";
import { assetCanCarrySpeech, transcriptRelevantAssetIds } from "../transcription/status";
import { captionCuesToTextRegions, deriveCaptionCues } from "./cues";
import {
	deriveRecordedCaptionRegions,
	getRecordedCaptionOptions,
	patchRecordedCaptionOptions,
	recordedCaptionLayout,
} from "./recordedSources";
import { DEFAULT_CAPTION_SETTINGS, getCaptionSettings, patchCaptionSettings } from "./settings";
import {
	getCaptionTranslations,
	putCaptionTranslation,
	removeCaptionTranslation,
} from "./translations";

function recording() {
	const doc = createEmptyDocument({ projectId: "p", title: "Sources" });
	doc.project.primaryAssetId = "v";
	doc.assets = [
		{
			id: "v",
			kind: "video",
			label: "Picture",
			originalPath: "/media/screen.mp4",
			durationSec: 10,
			cameraTrack: null,
			separateRecordingAudio: true,
			recordingAudio: [
				{ kind: "system", assetId: "s" },
				{ kind: "microphone", assetId: "m" },
			],
		},
		...["s", "m"].map((id) => ({
			id,
			kind: "audio" as const,
			label: id,
			originalPath: `/media/${id}.m4a`,
			durationSec: 10,
			cameraTrack: null,
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
			origin: "system",
			reason: "",
			wordRefs: [],
		},
	];
	doc.transcripts = [
		transcriptFromSegments("s", [{ startSec: 1, endSec: 2, text: "system speech" }], "en"),
		transcriptFromSegments("m", [{ startSec: 1, endSec: 2, text: "microphone speech" }], "en"),
	];
	return patchCaptionSettings(syncRecordingAudio(doc), { enabled: true });
}

describe("recorded source captions", () => {
	it("queues both source files without transcribing the embedded combined audio", () => {
		const doc = recording();
		expect(assetCanCarrySpeech(doc, "v")).toBe(false);
		expect(assetCanCarrySpeech(doc, "s")).toBe(true);
		expect(assetCanCarrySpeech(doc, "m")).toBe(true);
		expect(transcriptRelevantAssetIds(doc)).toEqual(["s", "m"]);
	});
	it("keeps overlapping speech on the same recording clock, with distinct text and styles", () => {
		let doc = recording();
		doc = patchCaptionSettings(
			doc,
			{ color: "#ffcc44", fontSize: 52, anchorH: "left" },
			16 / 9,
			"system",
		);
		doc = patchCaptionSettings(doc, { color: "#ffffff", fontSize: 40 }, 16 / 9, "microphone");
		const regions = deriveRecordedCaptionRegions(doc, 16 / 9);
		expect(regions).toHaveLength(2);
		expect(regions.map((r) => [r.startMs, r.endMs])).toEqual([
			[1000, 2000],
			[1000, 2000],
		]);
		expect(regions.map((r) => r.style?.color)).toEqual(["#ffcc44", "#ffffff"]);
		expect(regions[0].position.y + regions[0].size.height).toBeLessThan(regions[1].position.y);
		const changed = setDocumentWordText(doc, "s", "word_1", "corrected");
		expect(deriveRecordedCaptionRegions(changed, 16 / 9)[0].content).toContain("corrected");
		expect(deriveRecordedCaptionRegions(changed, 16 / 9)[1].content).toBe(regions[1].content);
		expect(getCaptionSettings(changed, 16 / 9, "microphone").fontSize).toBe(40);
	});
	it("switches either source off independently, restoring the remaining source's original placement", () => {
		const doc = patchRecordedCaptionOptions(recording(), { system: { enabled: false } });
		const style = getCaptionSettings(doc, 16 / 9, "microphone");
		const expected = captionCuesToTextRegions(
			deriveCaptionCues(doc, style, {}, "microphone"),
			style,
			16 / 9,
		).map((region) => ({ ...region, id: `microphone:${region.id}` }));
		expect(deriveRecordedCaptionRegions(doc, 16 / 9)).toEqual(expected);
		expect(
			deriveRecordedCaptionRegions(
				patchRecordedCaptionOptions(doc, { microphone: { enabled: false } }),
				16 / 9,
			),
		).toEqual([]);
	});
	it("swaps vertical positions while retaining each source's own style", () => {
		const doc = recording();
		const before = deriveRecordedCaptionRegions(doc, 16 / 9);
		const after = deriveRecordedCaptionRegions(
			patchRecordedCaptionOptions(doc, { swap: true }),
			16 / 9,
		);
		expect(after[0].position.y).toBe(before[1].position.y);
		expect(after[1].position.y).toBe(before[0].position.y);
		expect(after.map((r) => r.content)).toEqual(before.map((r) => r.content));
	});
	it("retains every original anchor for either source when shown alone", () => {
		for (const source of ["system", "microphone"] as const)
			for (const anchorV of ["top", "bottom"] as const)
				for (const anchorH of ["left", "center", "right"] as const) {
					let doc = patchCaptionSettings(
						recording(),
						{ anchorV, anchorH, insetX: 6, insetY: 8, fontSize: 60 },
						16 / 9,
						source,
					);
					doc = patchRecordedCaptionOptions(doc, {
						system: { enabled: source === "system" },
						microphone: { enabled: source === "microphone" },
						swap: true,
					});
					const style = getCaptionSettings(doc, 16 / 9, source);
					expect(deriveRecordedCaptionRegions(doc, 16 / 9)).toEqual(
						captionCuesToTextRegions(deriveCaptionCues(doc, style, {}, source), style, 16 / 9).map(
							(region) => ({ ...region, id: `${source}:${region.id}` }),
						),
					);
				}
	});
	it("prevents collisions across all anchor pairs, frame aspects and large or mismatched fonts", () => {
		for (const aspect of [16 / 9, 9 / 16, 1])
			for (const a of ["top", "bottom"] as const)
				for (const b of ["top", "bottom"] as const)
					for (const h of ["left", "center", "right"] as const)
						for (const fonts of [
							[48, 48],
							[16, 140],
							[140, 140],
						])
							for (const swap of [false, true]) {
								const rows = recordedCaptionLayout(
									[
										{ ...DEFAULT_CAPTION_SETTINGS, anchorV: a, anchorH: h, fontSize: fonts[0] },
										{ ...DEFAULT_CAPTION_SETTINGS, anchorV: b, anchorH: h, fontSize: fonts[1] },
									],
									aspect,
									swap,
								);
								const [first, second] = rows.map((r) => r.rect).sort((x, y) => x.y - y.y);
								expect(first.y).toBeGreaterThanOrEqual(0);
								expect(first.y + first.height).toBeLessThanOrEqual(second.y);
								expect(second.y + second.height).toBeLessThanOrEqual(100);
							}
	});
	it("keeps both transcript editors aligned with common picture cuts and exports both caption sources", () => {
		const doc = recording();
		doc.timeline.trimRanges = [
			{
				id: "trim",
				assetId: "v",
				clipId: "c",
				startSec: 1,
				endSec: 1.5,
				origin: "user",
				reason: "",
			},
		];
		for (const source of ["system", "microphone"] as const) {
			const removed = removedRawSpans(doc.timeline.clips, doc.timeline.trimRanges);
			const sections = buildAggregatedSections(
				lanePlacements(source, doc.timeline.clips, doc.audioTracks),
				doc.transcripts,
				doc.assets,
				removed,
			);
			expect(
				sections[0].words.filter((word) =>
					word.word.text.endsWith(source === "system" ? "system" : "microphone"),
				)[0].kept,
			).toBe(false);
		}
		const scene = buildSceneDescription(doc);
		expect(scene.annotations.filter((r) => r.kind === "text")).toHaveLength(2);
	});
	it("preserves per-source translations when the other source's translation is removed", () => {
		let doc = recording();
		for (const assetId of ["s", "m"])
			doc = putCaptionTranslation(doc, {
				language: "zh",
				label: "中文",
				assetId,
				segments: { seg_1: assetId },
			});
		doc = removeCaptionTranslation(doc, "zh", ["s"]);
		expect(getCaptionTranslations(doc).zh.byAsset).toEqual({ m: { seg_1: "m" } });
		expect(getRecordedCaptionOptions(doc)).toEqual({
			system: { enabled: true },
			microphone: { enabled: true },
			swap: false,
		});
	});
});
