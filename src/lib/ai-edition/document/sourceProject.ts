import { type AxcutDocument, createEmptyDocument } from "../schema";
import { syncRecordingAudio } from "./recordingAudio";

/** Studio 0.3 starts older projects again from their intact sources, without overwriting media. */
export function openSourceProject(document: AxcutDocument): AxcutDocument {
	if (document.studioVersion === 3) return document;
	const fresh = createEmptyDocument({
		projectId: document.project.id,
		title: document.project.title,
		createdAt: document.project.createdAt,
	});
	let time = 0;
	const clips = document.assets
		.filter((a) => a.kind === "video" && a.originalPath)
		.map((asset) => {
			const duration =
				asset.durationSec ??
				Math.max(
					0,
					...document.timeline.clips
						.filter((c) => c.assetId === asset.id)
						.map((c) => c.sourceEndSec ?? c.sourceStartSec + c.timelineEndSec - c.timelineStartSec),
				);
			const start = time;
			time += duration;
			return {
				id: `source_${asset.id}`,
				assetId: asset.id,
				sourceStartSec: 0,
				sourceEndSec: duration,
				timelineStartSec: start,
				timelineEndSec: time,
				wordRefs: [],
				origin: "system" as const,
				reason: "Original recording",
			};
		});
	const assets = document.assets.map(({ transcriptionFailure: _failure, ...asset }) => ({
		...asset,
		...(asset.cameraTrack ? { cameraTrack: { ...asset.cameraTrack, visible: true } } : {}),
	}));
	return syncRecordingAudio({
		...fresh,
		project: { ...fresh.project, primaryAssetId: clips[0]?.assetId },
		assets,
		timeline: { ...fresh.timeline, clips },
	});
}
