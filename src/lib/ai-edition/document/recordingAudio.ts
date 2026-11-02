import type { AxcutAudioTrack, AxcutDocument } from "../schema";

/** Source tracks are intrinsic to a recording, not independently placed background music. */
export function syncRecordingAudio(document: AxcutDocument): AxcutDocument {
	if (!document.assets.some((asset) => asset.recordingAudio?.length)) return document;
	const previous = document.audioTracks.filter((track) => track.recordingSource);
	const tracks: AxcutAudioTrack[] = [];
	for (const clip of document.timeline.clips) {
		const asset = document.assets.find((candidate) => candidate.id === clip.assetId);
		for (const source of asset?.recordingAudio ?? []) {
			const sourceAsset = document.assets.find((candidate) => candidate.id === source.assetId);
			if (!sourceAsset) continue;
			const end = clip.sourceEndSec ?? asset?.durationSec ?? sourceAsset?.durationSec ?? 0;
			if (end <= clip.sourceStartSec) continue;
			const id = `${clip.id}:recorded:${source.kind}`;
			const old =
				previous.find((track) => track.id === id) ??
				previous.find((track) => track.clipId === clip.id && track.assetId === source.assetId) ??
				previous.find((track) => track.assetId === source.assetId);
			tracks.push({
				id,
				assetId: source.assetId,
				kind: "music",
				recordingSource: source.kind,
				clipId: clip.id,
				sourceStartSec: clip.sourceStartSec,
				sourceEndSec: end,
				startMs: Math.round(clip.timelineStartSec * 1000),
				endMs: Math.round(clip.timelineEndSec * 1000),
				offsetMs: Math.round(clip.sourceStartSec * 1000),
				durationSec: sourceAsset?.durationSec ?? asset?.durationSec ?? end,
				gainDb: old?.gainDb ?? 0,
				muted: old?.muted ?? false,
				loop: false,
				fadeInMs: 0,
				fadeOutMs: 0,
				label: source.kind === "system" ? "System audio" : "Microphone",
				origin: "system",
			});
		}
	}
	return {
		...document,
		audioTracks: [...document.audioTracks.filter((track) => !track.recordingSource), ...tracks],
	};
}
