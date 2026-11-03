import { projectRawTimelineSecToPlayback, readSpeedRegions } from "../document/timeline";
import type { AxcutDocument } from "../schema";
import type { TranscriptLane } from "../timeline/aggregated-transcript";
import type { SpeedRegion } from "../timeline/speed";
import { type CaptionCue, deriveCaptionCues } from "./cues";
import { captionDisplayCues } from "./display";
import { availableRecordedCaptionSources } from "./recordedSources";
import { getCaptionSettings } from "./settings";
import { getCaptionTranslations } from "./translations";

export type CaptionSrtSource = TranscriptLane;

/** Legacy mixed recordings cannot be separated retrospectively. Never label their
 * transcript as either of the independently recorded audio sources. */
function legacyRecording(document: AxcutDocument): AxcutDocument {
	return {
		...document,
		timeline: {
			...document.timeline,
			clips: document.timeline.clips.filter(
				(clip) =>
					!document.assets.find((asset) => asset.id === clip.assetId)?.recordingAudio?.length,
			),
		},
	};
}

export function captionSrtSources(document: AxcutDocument | null): CaptionSrtSource[] {
	if (!document) return [];
	const sources: CaptionSrtSource[] = availableRecordedCaptionSources(document);
	if (legacyRecording(document).timeline.clips.length) sources.push("recording");
	if (document.audioTracks?.some((track) => track.kind === "voiceover" && !track.recordingSource))
		sources.push("voiceover");
	return sources;
}

/** Export the current text/line layout and display hold, independently of visibility.
 * Project both ends through the same cut/speed clock used to mix the finished video.
 * The original transcript and its source timestamps are never changed. */
export function captionSrtCues(document: AxcutDocument, source: CaptionSrtSource): CaptionCue[] {
	if (!captionSrtSources(document).includes(source)) return [];
	const sourceDocument = source === "recording" ? legacyRecording(document) : document;
	const settings = getCaptionSettings(
		document,
		16 / 9,
		source === "system" || source === "microphone" ? source : undefined,
	);
	const aligned = deriveCaptionCues(
		sourceDocument,
		{ ...settings, enabled: true },
		getCaptionTranslations(document),
		source,
	);
	const speeds = readSpeedRegions<SpeedRegion>(document);
	const project = (timeMs: number) =>
		Math.max(
			0,
			Math.round(
				projectRawTimelineSecToPlayback(
					document.timeline.clips,
					document.timeline.trimRanges,
					timeMs / 1000,
					speeds,
				) * 1000,
			),
		);
	return captionDisplayCues(aligned, document)
		.map((cue) => ({ ...cue, startMs: project(cue.startMs), endMs: project(cue.endMs) }))
		.filter((cue) => cue.endMs > cue.startMs);
}

function timestamp(timeMs: number): string {
	const ms = Math.max(0, Math.round(timeMs));
	const seconds = Math.floor(ms / 1000);
	return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(
		Math.floor(seconds / 60) % 60,
	).padStart(
		2,
		"0",
	)}:${String(seconds % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}

export function captionsToSrt(cues: CaptionCue[]): string {
	return cues
		.filter(
			(cue) =>
				Number.isFinite(cue.startMs) &&
				Number.isFinite(cue.endMs) &&
				Math.round(cue.endMs) > Math.max(0, Math.round(cue.startMs)) &&
				cue.text.trim(),
		)
		.map((cue, index) => {
			// Blank lines delimit SRT entries; they cannot occur inside one caption.
			const text = cue.text
				.trim()
				.replace(/\r\n|\r/g, "\n")
				.replace(/\n\s*\n/g, "\n");
			return `${index + 1}\r\n${timestamp(cue.startMs)} --> ${timestamp(cue.endMs)}\r\n${text.replace(/\n/g, "\r\n")}\r\n\r\n`;
		})
		.join("");
}

export function captionSrtFileName(title: string, source: CaptionSrtSource): string {
	const base = title
		.replace(/[\p{Cc}<>:"/\\|?*]/gu, "_")
		.replace(/^[.\s]+|[.\s]+$/g, "")
		.slice(0, 100);
	return `${base || "captions"}-${source}.srt`;
}
