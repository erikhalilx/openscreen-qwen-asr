import { describe, expect, it } from "vitest";
import { applySpeakerBackfill, withTranscript } from "../document/transcript";
import { createEmptyDocument, parseDocumentFile } from "../schema";
import { transcriptFromSegments } from "../transcription/fromStt";
import { captionCuesToTextRegions, inferCaptionSpeaker } from "./cues";
import { DEFAULT_CAPTION_SETTINGS } from "./settings";
import { replaceCaptionSpeaker } from "./speakerEdits";
import { captionSrtCues, captionsToSrt, captionsToText } from "./srt";

function setup() {
	let doc = createEmptyDocument({ projectId: "speakers", title: "Speakers" });
	doc.assets = ["a", "b"].map((id) => ({
		id,
		kind: "video",
		originalPath: `/tmp/${id}.mp4`,
		label: id,
		durationSec: 5,
		cameraTrack: null,
	}));
	doc.timeline.clips = doc.assets.map(({ id }, index) => ({
		id: `clip-${id}`,
		assetId: id,
		sourceStartSec: 0,
		sourceEndSec: 5,
		timelineStartSec: index * 5,
		timelineEndSec: (index + 1) * 5,
		origin: "user",
		reason: "",
		wordRefs: [],
	}));
	doc = withTranscript(
		doc,
		transcriptFromSegments(
			"a",
			[
				{ startSec: 0, endSec: 0.4, text: "Hello!", speakerId: "speaker-1" },
				{ startSec: 0.4, endSec: 0.8, text: "Hello!", speakerId: "speaker-2" },
				{ startSec: 1.5, endSec: 2.1, text: "Again!", speakerId: "speaker-1" },
				{ startSec: 3, endSec: 3.5, text: "Goodbye!", speakerId: "speaker-1" },
			],
			"en",
			[],
		),
	);
	return withTranscript(
		doc,
		transcriptFromSegments(
			"b",
			[{ startSec: 0, endSec: 0.5, text: "Next", speakerId: "speaker-1" }],
			"en",
			[],
		),
	);
}

describe("speaker-aware captions", () => {
	it("fills a short gap only between matching original speaker labels", () => {
		const lines = [
			{ startSec: 0, endSec: 0.5, text: "Before", speakerId: "speaker-1" },
			{ startSec: 1, endSec: 1.5, text: "Gap", speakerId: null },
			{ startSec: 2, endSec: 2.5, text: "After", speakerId: "speaker-1" },
		];
		expect(inferCaptionSpeaker(lines, 1)).toBe("speaker-1");
		expect(inferCaptionSpeaker(lines, 0)).toBeNull();
		expect(
			inferCaptionSpeaker([lines[0], lines[1], { ...lines[2], startSec: 2.01 }], 1),
		).toBeNull();
		expect(
			inferCaptionSpeaker([lines[0], lines[1], { ...lines[2], speakerId: "speaker-2" }], 1),
		).toBeNull();
	});

	it("keeps identical phrases from different speakers and assigns unique project numbers", () => {
		const doc = setup();
		const cues = captionSrtCues(doc, "recording");
		expect(cues.map((cue) => [cue.speakerLabel, cue.text])).toEqual([
			["Speaker 1", "Hello!"],
			["Speaker 2", "Hello!"],
			["Speaker 1", "Again!"],
			["Speaker 1", "Goodbye!"],
			["Speaker 3", "Next"],
		]);
	});

	it("keeps zero-duration aligned text at a shared onset", () => {
		const doc = withTranscript(
			setup(),
			transcriptFromSegments(
				"a",
				[
					{ startSec: 1, endSec: 1, text: "我", speakerId: null },
					{ startSec: 1, endSec: 1.6, text: "在这里。", speakerId: "speaker-1" },
				],
				"zh",
				[],
			),
		);
		const cues = captionSrtCues(doc, "recording");
		expect(cues[0]).toMatchObject({ startMs: 1000, text: "我在这里。", speakerId: null });
		expect(cues.filter((cue) => cue.startMs === 1000)).toHaveLength(1);
	});

	it("keeps manually cleared legacy labels on their original subtitle span", () => {
		const transcript = transcriptFromSegments(
			"a",
			[
				{ startSec: 1, endSec: 1.1, text: "你", speakerId: null },
				{ startSec: 1.2, endSec: 1.6, text: "好吗？", speakerId: "speaker-1" },
			],
			"zh",
			[],
		);
		const legacy = withTranscript(
			{ ...setup(), chineseSentenceCaptions: undefined },
			{
				...transcript,
				speakerTurns: [{ speakerId: "speaker-1", startSec: 1.15, endSec: 1.65 }],
				captionSpeakerOverrides: { "1200000": null },
			},
		);
		const upgraded = { ...legacy, chineseSentenceCaptions: true };
		expect(captionSrtCues(upgraded, "recording").slice(0, 2)).toMatchObject([
			{ text: "你" },
			{ text: "好吗？", speakerLabel: undefined, speakerNeedsReview: false },
		]);
	});

	it("persists a bulk rename and leaves explicitly cleared labels blank in both exports", () => {
		let doc = setup();
		const first = doc.transcripts.find((entry) => entry.assetId === "a")!;
		doc = withTranscript(doc, { ...first, captionSpeakerOverrides: { "1500000": null } });
		doc = replaceCaptionSpeaker(doc, captionSrtCues(doc, "recording"), "Speaker 1", "Editor");
		const cues = captionSrtCues(parseDocumentFile(JSON.parse(JSON.stringify(doc))), "recording");
		expect(cues.map((cue) => cue.speakerLabel)).toEqual([
			"Editor",
			"Speaker 2",
			undefined,
			"Editor",
			"Speaker 3",
		]);
		expect(captionsToText(cues, true)).toContain("Editor: Hello!\nSpeaker 2: Hello!\nAgain!");
		expect(captionsToSrt(cues, true)).toContain("Editor: Goodbye!");
		expect(captionsToSrt(cues)).not.toContain("Editor");
		expect(captionsToText(cues, true)).not.toContain("-->");
	});

	it("styles just the prefix without changing the caption body", () => {
		const cue = captionSrtCues(setup(), "recording")[0];
		const [preview] = captionCuesToTextRegions(
			[cue],
			{
				...DEFAULT_CAPTION_SETTINGS,
				showSpeakers: true,
				speakerSeparator: "：",
				speakerColor: "#FF0000",
			},
			16 / 9,
		);
		expect(preview.content).toBe("Speaker 1：Hello!");
		expect(preview.textPrefixStyle).toMatchObject({
			length: "Speaker 1：".length,
			color: "#FF0000",
		});
		expect(preview.style.color).toBe(DEFAULT_CAPTION_SETTINGS.color);
	});

	it("backfills the original timings and retains edits made while analysis was in flight", () => {
		const old = transcriptFromSegments("old", [{ startSec: 1, endSec: 2, text: "Original" }], "en");
		const doc = withTranscript(setup(), {
			...old,
			words: [{ ...old.words[0], text: "Corrected", originalText: "Original", source: "user" }],
		});
		const next = applySpeakerBackfill(doc, old, {
			speakerIds: ["speaker-1"],
			speakerTurns: [{ speakerId: "speaker-1", startSec: 1, endSec: 2 }],
		});
		expect(next?.transcripts.find((entry) => entry.assetId === "old")?.words[0]).toMatchObject({
			text: "Corrected",
			startSec: 1,
			endSec: 2,
			speakerId: "speaker-1",
		});
	});

	it("replaces existing speaker analysis while preserving manual caption labels", () => {
		const initial = setup();
		const doc = withTranscript(initial, {
			...initial.transcripts[0],
			speakerTurns: [{ speakerId: "speaker-1", startSec: 0, endSec: 0.4 }],
			captionSpeakerOverrides: { "0": "Manual label" },
		});
		const analyzed = doc.transcripts.find((entry) => entry.assetId === "a")!;
		const result = {
			speakerIds: analyzed.words.map(() => "speaker-2"),
			speakerTurns: [{ speakerId: "speaker-2", startSec: 0, endSec: 3.5 }],
		};
		const next = applySpeakerBackfill(doc, analyzed, result);
		expect(next?.transcripts.find((entry) => entry.assetId === "a")).toMatchObject({
			speakerTurns: result.speakerTurns,
			captionSpeakerOverrides: { "0": "Manual label" },
			words: analyzed.words.map((word) => ({ ...word, speakerId: "speaker-2" })),
		});
		expect(applySpeakerBackfill(next!, analyzed, result)).toBeNull();
	});
});
