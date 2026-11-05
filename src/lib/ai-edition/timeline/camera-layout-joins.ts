export interface CameraLayoutJoin {
	start: boolean;
	end: boolean;
}

/** Compare the same whole-millisecond boundaries persisted by the timeline, including live drags. */
export function cameraLayoutJoins(
	segments: readonly { id: string; start: number; end: number }[],
): Map<string, CameraLayoutJoin> {
	const ordered = [...segments]
		.filter(
			(segment) =>
				Number.isFinite(segment.start) &&
				Number.isFinite(segment.end) &&
				segment.end > segment.start,
		)
		.sort((a, b) => a.start - b.start);
	const joins = new Map(ordered.map((segment) => [segment.id, { start: false, end: false }]));
	for (let i = 0; i + 1 < ordered.length; i++) {
		const left = ordered[i],
			right = ordered[i + 1];
		if (left.id === right.id || Math.round(left.end * 1000) !== Math.round(right.start * 1000))
			continue;
		const before = joins.get(left.id),
			after = joins.get(right.id);
		if (before) before.end = true;
		if (after) after.start = true;
	}
	return joins;
}
