import { describe, expect, it } from "vitest";
import { syncRecordingAudio } from "../document/recordingAudio";
import { createEmptyDocument } from "../schema";
import { transcriptFromSegments } from "../transcription/fromStt";
import { patchRecordedCaptionOptions } from "./recordedSources";
import { patchCaptionSettings } from "./settings";
import { captionSrtCues, captionSrtFileName, captionSrtSources, captionsToSrt } from "./srt";
import { captionTranslationUnits, putCaptionTranslation } from "./translations";

function fixture() {
	const doc = createEmptyDocument({ projectId: "srt", title: "字幕测试" });
	doc.assets = [
		{
			id: "v",
			kind: "video",
			label: "Picture",
			cameraTrack: null,
			originalPath: "/media/video.mp4",
			durationSec: 10,
			recordingAudio: [
				{ kind: "system", assetId: "s" },
				{ kind: "microphone", assetId: "m" },
			],
			separateRecordingAudio: true,
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
			id: "clip",
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
		transcriptFromSegments("s", [{ startSec: 1, endSec: 2, text: "系统字幕。" }], "zh"),
		transcriptFromSegments("m", [{ startSec: 3, endSec: 4, text: "麦克风字幕。" }], "zh"),
	];
	return syncRecordingAudio(doc);
}

describe("source-specific SRT", () => {
	it("exports hidden sources separately on a common zero-based clock without modifying the project", () => {
		const doc = patchRecordedCaptionOptions(patchCaptionSettings(fixture(), { enabled: false }), {
			system: { enabled: false },
			microphone: { enabled: false },
		});
		const before = JSON.stringify(doc);
		expect(captionSrtSources(doc)).toEqual(["system", "microphone"]);
		expect(captionsToSrt(captionSrtCues(doc, "system"))).toBe(
			"1\r\n00:00:01,000 --> 00:00:03,000\r\n系统字幕。\r\n\r\n",
		);
		expect(captionsToSrt(captionSrtCues(doc, "microphone"))).toContain(
			"00:00:03,000 --> 00:00:05,000\r\n麦克风字幕。",
		);
		expect(JSON.stringify(doc)).toBe(before);
	});
	it("removes cut speech and compresses timestamps through the same picture cuts", () => {
		const doc = fixture();
		doc.timeline.trimRanges = [
			{
				id: "cut",
				assetId: "v",
				clipId: "clip",
				startSec: 2,
				endSec: 5,
				origin: "user",
				reason: "",
			},
		];
		expect(captionSrtCues(doc, "microphone")).toEqual([]);
		expect(captionSrtCues(doc, "system")[0]).toMatchObject({ startMs: 1000, endMs: 3000 });
	});
	it("maps 2x playback and the one-second display hold onto finished-video time", () => {
		const doc = fixture();
		doc.legacyEditor = { speedRegions: [{ id: "speed", startMs: 0, endMs: 10_000, speed: 2 }] };
		expect(captionSrtCues(doc, "system")[0]).toMatchObject({ startMs: 500, endMs: 2000 });
		expect(captionSrtCues(doc, "microphone")[0]).toMatchObject({ startMs: 1500, endMs: 3000 });
	});
	it("keeps both sources on the same clock when cuts and speed changes are combined", () => {
		const doc = fixture();
		doc.timeline.trimRanges = [
			{
				id: "head",
				assetId: "v",
				clipId: "clip",
				startSec: 0,
				endSec: 1,
				origin: "user",
				reason: "",
			},
		];
		doc.legacyEditor = { speedRegions: [{ id: "speed", startMs: 0, endMs: 10_000, speed: 2 }] };
		expect(captionSrtCues(doc, "system")[0]).toMatchObject({ startMs: 0, endMs: 1500 });
		expect(captionSrtCues(doc, "microphone")[0]).toMatchObject({ startMs: 1000, endMs: 2500 });
	});
	it("stops holding at the next cue on the same source", () => {
		const doc = fixture();
		doc.transcripts[0] = transcriptFromSegments(
			"s",
			[
				{ startSec: 1, endSec: 2, text: "第一句。" },
				{ startSec: 2.4, endSec: 2.6, text: "第二句。" },
			],
			"zh",
		);
		expect(captionSrtCues(doc, "system").map((cue) => [cue.startMs, cue.endMs])).toEqual([
			[1000, 2400],
			[2400, 3600],
		]);
	});
	it("uses corrected text and each source's selected translation", () => {
		let doc = fixture();
		doc.transcripts[0].words[0].text = "修正后的字幕。";
		expect(captionsToSrt(captionSrtCues(doc, "system"))).toContain("修正后的字幕。");
		const unit = captionTranslationUnits(doc.transcripts[1])[0];
		doc = putCaptionTranslation(doc, {
			language: "en",
			label: "English",
			assetId: "m",
			segments: { [unit.id]: "Microphone caption." },
		});
		doc = patchCaptionSettings(doc, { language: "en" }, 16 / 9, "microphone");
		expect(captionsToSrt(captionSrtCues(doc, "microphone"))).toContain("Microphone caption.");
		expect(captionsToSrt(captionSrtCues(doc, "system"))).not.toContain("Microphone caption.");
	});
	it("retains mixed legacy captions without inventing separate audio sources", () => {
		const doc = fixture();
		doc.audioTracks = [];
		doc.assets[0].recordingAudio = undefined;
		doc.transcripts = [
			transcriptFromSegments("v", [{ startSec: 1, endSec: 2, text: "混合音轨。" }], "zh"),
		];
		expect(captionSrtSources(doc)).toEqual(["recording"]);
		expect(captionSrtCues(doc, "system")).toEqual([]);
		expect(captionsToSrt(captionSrtCues(doc, "recording"))).toContain("混合音轨。");
	});
	it("accepts older projects without the additive audioTracks field", () => {
		const doc = fixture();
		Reflect.deleteProperty(doc, "audioTracks");
		doc.assets[0].recordingAudio = undefined;
		doc.transcripts = [
			transcriptFromSegments("v", [{ startSec: 1, endSec: 2, text: "旧项目字幕。" }], "zh"),
		];
		expect(captionSrtSources(doc)).toEqual(["recording"]);
		expect(captionsToSrt(captionSrtCues(doc, "recording"))).toContain("旧项目字幕。");
	});
	it("keeps the shared output offset after a duplicated clip", () => {
		const doc = fixture();
		doc.timeline.clips.push({
			...doc.timeline.clips[0],
			id: "copy",
			timelineStartSec: 10,
			timelineEndSec: 20,
		});
		const synced = syncRecordingAudio(doc);
		expect(captionSrtCues(synced, "system").map((cue) => cue.startMs)).toEqual([1000, 11_000]);
		expect(captionSrtCues(synced, "microphone").map((cue) => cue.startMs)).toEqual([3000, 13_000]);
	});
	it("produces distinct safe names without stripping Chinese titles", () => {
		expect(captionSrtFileName(" ..字幕/测试:01 ", "system")).toBe("字幕_测试_01-system.srt");
		expect(captionSrtFileName("..", "microphone")).toBe("captions-microphone.srt");
	});
	it("formats hours, millisecond carry and multiline text with sequential SRT numbering", () => {
		const cues = [
			{ id: "blank", startMs: 0, endMs: 1000, text: " " },
			{ id: "a", startMs: 3_599_999.6, endMs: 3_601_001, text: "第一行\n\n第二行" },
			{ id: "b", startMs: 3_602_000, endMs: 3_603_000, text: "后一句" },
		];
		expect(captionsToSrt(cues)).toBe(
			"1\r\n01:00:00,000 --> 01:00:01,001\r\n第一行\r\n第二行\r\n\r\n2\r\n01:00:02,000 --> 01:00:03,000\r\n后一句\r\n\r\n",
		);
		expect(captionsToSrt([])).toBe("");
	});
});
