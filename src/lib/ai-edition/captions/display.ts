import { readSpeedRegions } from "../document/timeline";
import type { AxcutDocument } from "../schema";
import { keptRawSpans } from "../timeline/programme-time";
import { type SpeedRegion, screenTimeMs, timelineTimeMs } from "../timeline/speed";
import type { CaptionCue } from "./cues";

const CAPTION_HOLD_MS = 1000;

/** Presentation only: preserve aligned onsets and keep each visible cue for up to one
 * extra playback second, stopping at the next cue on THIS source or the programme end.
 * Walk kept spans so cuts do not consume the hold or resurrect deleted speech; use
 * the existing playback clock so speed changes do not shorten or lengthen that second. */
export function captionDisplayCues(cues: CaptionCue[], document: AxcutDocument): CaptionCue[] {
	const kept = keptRawSpans(document.timeline.clips, document.timeline.trimRanges).map((span) => ({
		startMs: span.startSec * 1000,
		endMs: span.endSec * 1000,
	}));
	const speeds = readSpeedRegions<SpeedRegion>(document);
	const visible = cues.filter((cue) =>
		kept.some((span) => cue.startMs < span.endMs && cue.endMs > span.startMs),
	);
	return visible
		.map((cue, index) => {
			let endMs = cue.endMs;
			let remaining = CAPTION_HOLD_MS;
			for (const span of kept) {
				const from = Math.max(cue.endMs, span.startMs);
				if (from >= span.endMs) continue;
				const screenFrom = screenTimeMs(speeds, from);
				const duration = screenTimeMs(speeds, span.endMs) - screenFrom;
				if (duration >= remaining) {
					endMs = Math.min(span.endMs, Math.round(timelineTimeMs(speeds, screenFrom + remaining)));
					break;
				}
				remaining -= duration;
				endMs = span.endMs;
			}
			return { ...cue, endMs: Math.min(endMs, visible[index + 1]?.startMs ?? Infinity) };
		})
		.filter((cue) => cue.endMs > cue.startMs);
}
