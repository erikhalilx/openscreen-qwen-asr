import { withTranscript } from "../document/transcript";
import type { AxcutDocument } from "../schema";
import { type CaptionCue, transcriptSpeakerLabel } from "./cues";

export function replaceCaptionSpeaker(
	document: AxcutDocument,
	cues: CaptionCue[],
	currentLabel: string,
	replacement: string,
): AxcutDocument {
	const label = replacement.trim();
	if (!label || label === currentLabel) return document;
	const matches = new Map<string, CaptionCue[]>();
	for (const cue of cues) {
		if (!cue.speakerRef || cue.speakerLabel !== currentLabel) continue;
		const { assetId } = cue.speakerRef;
		const existing = matches.get(assetId);
		if (existing) existing.push(cue);
		else matches.set(assetId, [cue]);
	}
	let next = document;
	for (const transcript of document.transcripts) {
		const matchingCues = matches.get(transcript.assetId);
		if (!matchingCues) continue;
		const speakerNames = { ...transcript.speakerNames };
		const overrides = { ...transcript.captionSpeakerOverrides };
		for (const cue of matchingCues) {
			if (!cue.speakerRef) continue;
			const key = cue.speakerRef.startKey;
			if (overrides[key] === currentLabel) overrides[key] = label;
			else if (
				cue.speakerId &&
				overrides[key] === undefined &&
				transcriptSpeakerLabel(transcript, cue.speakerId) === currentLabel
			) {
				speakerNames[cue.speakerId] = label;
			}
		}
		next = withTranscript(next, {
			...transcript,
			speakerNames,
			captionSpeakerOverrides: overrides,
		});
	}
	return next;
}
