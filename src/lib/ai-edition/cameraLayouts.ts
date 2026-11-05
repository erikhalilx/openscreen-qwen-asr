import { computeCompositeLayout } from "@/lib/compositeLayout";
import {
	isWebcamAnchor,
	WEBCAM_SIZE_MAX,
	WEBCAM_SIZE_MIN,
	type WebcamAnchor,
	type WebcamMask,
	webcamAnchorFractions,
} from "@/lib/projectDefaults";
import { projectRawTimelineSecToPlayback, readSpeedRegions } from "./document/timeline";
import type { AxcutDocument } from "./schema";
import { getEditorSettings } from "./store/editorSettings";
import { keptRawSpans } from "./timeline/programme-time";
import {
	anchorRegionsWithDerivedMs,
	coalesceRegionsForRuler,
	resolveRegionIds,
} from "./timeline/timelineMap";

export interface CameraLayoutStyle {
	mode: "pip" | "fullscreen";
	anchor: WebcamAnchor;
	size: number;
	shape: WebcamMask;
	roundness: number;
	reactiveZoom: boolean;
}

/** Uses the existing clip-anchored camera lane, so reorder, trim, copy and undo keep working. */
export interface CameraLayoutRegion {
	id: string;
	startMs: number;
	endMs: number;
	clipId?: string;
	sourceStartSec?: number;
	sourceEndSec?: number;
	cameraLayout?: CameraLayoutStyle;
	/** Explicitly independent layouts remain independently selectable even when their styles match. */
	layoutId?: string;
}

export interface CameraLayoutFrame {
	startSec: number;
	endSec: number;
	rect: { x: number; y: number; width: number; height: number };
	/** Corner radius as a fraction of the output frame's shorter side. */
	radius: number;
	fullscreen: boolean;
	reactiveZoom: boolean;
	anchor: [number, number];
}

export function cameraLayoutsEnabled(document: AxcutDocument | null | undefined): boolean {
	return document?.legacyEditor?.cameraLayoutEnabled === true;
}

export function readCameraLayouts(document: AxcutDocument): CameraLayoutRegion[] {
	const value = document.legacyEditor?.cameraFullscreenRegions;
	if (!Array.isArray(value)) return [];
	return (value as CameraLayoutRegion[]).filter(
		(r) =>
			r &&
			typeof r.id === "string" &&
			Number.isFinite(r.startMs) &&
			Number.isFinite(r.endMs) &&
			r.endMs > r.startMs,
	);
}

export function defaultCameraLayout(document: AxcutDocument): CameraLayoutStyle {
	const settings = getEditorSettings(document);
	return {
		mode: "pip",
		anchor: settings.webcamAnchor,
		size: settings.webcamSizePreset,
		shape: settings.webcamMaskShape,
		roundness: settings.webcamRoundness,
		reactiveZoom: settings.webcamReactiveZoom,
	};
}

export function cameraLayoutStyle(
	region: CameraLayoutRegion,
	defaults: CameraLayoutStyle,
): CameraLayoutStyle {
	const style = region.cameraLayout;
	if (!style) return { ...defaults, mode: "fullscreen" };
	return {
		reactiveZoom:
			typeof style.reactiveZoom === "boolean" ? style.reactiveZoom : defaults.reactiveZoom,
		mode: style.mode === "fullscreen" ? "fullscreen" : "pip",
		anchor: isWebcamAnchor(style.anchor) ? style.anchor : defaults.anchor,
		size: Number.isFinite(style.size)
			? Math.max(WEBCAM_SIZE_MIN, Math.min(WEBCAM_SIZE_MAX, style.size))
			: defaults.size,
		shape: ["square", "rectangle"].includes(style.shape) ? style.shape : defaults.shape,
		roundness: Number.isFinite(style.roundness)
			? Math.max(0, Math.min(1, style.roundness))
			: defaults.roundness,
	};
}

function withRegions(document: AxcutDocument, regions: CameraLayoutRegion[]): AxcutDocument {
	return {
		...document,
		legacyEditor: {
			...document.legacyEditor,
			cameraLayoutEnabled: true,
			cameraFullscreenRegions: regions,
		},
	};
}

/** Overlay one new layout without leaving overlapping states. Retained pieces get fresh anchors. */
function overlayLayout(
	document: AxcutDocument,
	regions: CameraLayoutRegion[],
	region: CameraLayoutRegion,
	makeId: () => string,
): CameraLayoutRegion[] {
	const rest = regions.flatMap((previous) => {
		if (previous.endMs <= region.startMs || previous.startMs >= region.endMs) return [previous];
		const pieces: CameraLayoutRegion[] = [];
		if (previous.startMs < region.startMs)
			pieces.push({ ...previous, id: makeId(), endMs: region.startMs, layoutId: makeId() });
		if (previous.endMs > region.endMs)
			pieces.push({ ...previous, id: makeId(), startMs: region.endMs, layoutId: makeId() });
		return anchorRegionsWithDerivedMs(pieces, document.timeline.clips, makeId);
	});
	return [...rest, ...anchorRegionsWithDerivedMs([region], document.timeline.clips, makeId)].sort(
		(a, b) => a.startMs - b.startMs,
	);
}

/** Opt in without changing an old PiP project's visible camera or its existing full-camera spans. */
export function enableCameraLayouts(document: AxcutDocument, makeId: () => string): AxcutDocument {
	if (cameraLayoutsEnabled(document)) return document;
	const defaults = defaultCameraLayout(document);
	const settings = getEditorSettings(document);
	let regions: CameraLayoutRegion[] = [];
	if (settings.webcamLayoutPreset !== "no-webcam") {
		for (const clip of document.timeline.clips) {
			if (!document.assets.find((a) => a.id === clip.assetId)?.cameraTrack?.visible) continue;
			const region = {
				id: makeId(),
				layoutId: makeId(),
				startMs: Math.round(clip.timelineStartSec * 1000),
				endMs: Math.round(clip.timelineEndSec * 1000),
				cameraLayout: defaults,
			};
			regions.push(...anchorRegionsWithDerivedMs([region], document.timeline.clips, makeId));
		}
	}
	for (const pill of coalesceRegionsForRuler(readCameraLayouts(document))) {
		regions = overlayLayout(
			document,
			regions,
			{
				...pill.member,
				id: pill.member.id,
				layoutId: makeId(),
				startMs: pill.start * 1000,
				endMs: pill.end * 1000,
				cameraLayout: cameraLayoutStyle(pill.member, defaults),
			},
			makeId,
		);
	}
	return withRegions(document, regions);
}

export function addCameraLayout(
	document: AxcutDocument,
	startMs: number,
	endMs: number,
	style: CameraLayoutStyle,
	makeId: () => string,
): AxcutDocument {
	const enabled = enableCameraLayouts(document, makeId);
	const end = Math.min(
		Math.max(...document.timeline.clips.map((c) => c.timelineEndSec * 1000), 0),
		endMs,
	);
	if (!Number.isFinite(startMs) || !Number.isFinite(end) || end <= startMs) return enabled;
	return withRegions(
		enabled,
		overlayLayout(
			enabled,
			readCameraLayouts(enabled),
			{ id: makeId(), layoutId: makeId(), startMs, endMs: end, cameraLayout: style },
			makeId,
		),
	);
}

export function patchCameraLayout(
	document: AxcutDocument,
	id: string,
	patch: Partial<CameraLayoutStyle>,
): AxcutDocument {
	document = enableCameraLayouts(document, () => crypto.randomUUID());
	const regions = readCameraLayouts(document);
	const ids = new Set(resolveRegionIds(regions, id));
	const defaults = defaultCameraLayout(document);
	return withRegions(
		document,
		regions.map((region) =>
			ids.has(region.id)
				? { ...region, cameraLayout: { ...cameraLayoutStyle(region, defaults), ...patch } }
				: region,
		),
	);
}

/** Flat programme-clock regions are shared by native export and preview hit areas. */
export function buildCameraLayoutFrames(
	document: AxcutDocument,
	canvas: { width: number; height: number },
	maxContent: { width: number; height: number },
	probedCamera: { width: number; height: number } | null = null,
): CameraLayoutFrame[] {
	if (!cameraLayoutsEnabled(document)) return [];
	const defaults = defaultCameraLayout(document);
	const settings = getEditorSettings(document);
	const clips = document.timeline.clips;
	const kept = keptRawSpans(clips, document.timeline.trimRanges);
	const programmeSec = (sec: number) =>
		projectRawTimelineSecToPlayback(
			clips,
			document.timeline.trimRanges,
			sec,
			readSpeedRegions(document),
		);
	const frames: CameraLayoutFrame[] = [];
	for (const region of readCameraLayouts(document)) {
		const style = cameraLayoutStyle(region, defaults);
		for (const clip of clips) {
			if (region.clipId && region.clipId !== clip.id) continue;
			const asset = document.assets.find((a) => a.id === clip.assetId);
			const camera = asset?.cameraTrack;
			if (!camera?.visible || !camera.sourcePath) continue;
			// Anchors, rather than a stale ruler cache, decide what footage owns this layout.
			const start =
				region.clipId && region.sourceStartSec !== undefined
					? clip.timelineStartSec + region.sourceStartSec - clip.sourceStartSec
					: region.startMs / 1000;
			const end =
				region.clipId && region.sourceEndSec !== undefined
					? clip.timelineStartSec + region.sourceEndSec - clip.sourceStartSec
					: region.endMs / 1000;
			const size = {
				width: (camera.width || probedCamera?.width || 960) * settings.webcamCropRegion.width,
				height: (camera.height || probedCamera?.height || 720) * settings.webcamCropRegion.height,
			};
			const box = computeCompositeLayout({
				canvasSize: canvas,
				maxContentSize: maxContent,
				screenSize: { width: 16, height: 9 },
				webcamSize: size,
				layoutPreset: "picture-in-picture",
				webcamSizePreset: style.size,
				webcamAnchor: style.anchor,
				webcamMaskShape: style.shape,
				webcamRoundness: style.roundness,
				frame: settings.frame,
			})?.webcamRect;
			if (!box) continue;
			for (const span of kept) {
				const from = Math.max(start, clip.timelineStartSec, span.startSec);
				const to = Math.min(end, clip.timelineEndSec, span.endSec);
				if (to <= from) continue;
				const startSec = programmeSec(from),
					endSec = programmeSec(to);
				if (endSec <= startSec) continue;
				frames.push({
					startSec,
					endSec,
					rect:
						style.mode === "fullscreen"
							? { x: 0, y: 0, width: 1, height: 1 }
							: {
									x: box.x / canvas.width,
									y: box.y / canvas.height,
									width: box.width / canvas.width,
									height: box.height / canvas.height,
								},
					radius:
						style.mode === "fullscreen"
							? 0
							: box.borderRadius / Math.min(canvas.width, canvas.height),
					fullscreen: style.mode === "fullscreen",
					reactiveZoom: style.mode === "pip" && style.reactiveZoom,
					anchor: webcamAnchorFractions(style.anchor),
				});
			}
		}
	}
	return frames.sort((a, b) => a.startSec - b.startSec);
}

export interface CameraLayoutPresentation {
	rect: CameraLayoutFrame["rect"];
	radius: number;
	opacity: number;
	decoration: number;
	reactiveWeight: number;
	anchor: [number, number];
}

const smooth = (t: number) => {
	const u = Math.max(0, Math.min(1, t));
	return u * u * u * (10 + u * (-15 + u * 6));
};
const touches = (a: CameraLayoutFrame, b: CameraLayoutFrame) =>
	Math.abs(a.endSec - b.startSec) <= 0.001;

/** C2-continuous moves between adjacent layouts; gaps fade the camera, never its audio. */
export function cameraLayoutAt(
	frames: readonly CameraLayoutFrame[],
	time: number,
): CameraLayoutPresentation | null {
	for (let i = 0; i + 1 < frames.length; i++) {
		const a = frames[i],
			b = frames[i + 1];
		if (!touches(a, b)) continue;
		const half = Math.min(0.25, (a.endSec - a.startSec) / 2, (b.endSec - b.startSec) / 2);
		if (half <= 0 || time < a.endSec - half || time > b.startSec + half) continue;
		const t = smooth((time - (a.endSec - half)) / (2 * half));
		const mix = (x: number, y: number, k = t) => x + (y - x) * k;
		const shape =
			a.fullscreen && !b.fullscreen
				? smooth(t * 2)
				: !a.fullscreen && b.fullscreen
					? smooth((t - 0.5) * 2)
					: t;
		return {
			rect: {
				x: mix(a.rect.x, b.rect.x),
				y: mix(a.rect.y, b.rect.y),
				width: mix(a.rect.width, b.rect.width),
				height: mix(a.rect.height, b.rect.height),
			},
			radius: mix(a.radius, b.radius, shape),
			opacity: 1,
			decoration: mix(a.fullscreen ? 0 : 1, b.fullscreen ? 0 : 1, shape),
			reactiveWeight: mix(a.reactiveZoom ? 1 : 0, b.reactiveZoom ? 1 : 0),
			anchor: [mix(a.anchor[0], b.anchor[0]), mix(a.anchor[1], b.anchor[1])],
		};
	}
	const index = frames.findIndex((r) => time >= r.startSec && time < r.endSec);
	if (index < 0) return null;
	const r = frames[index],
		half = (r.endSec - r.startSec) / 2;
	const previous = frames[index - 1],
		next = frames[index + 1];
	const enter =
		previous && touches(previous, r) ? 1 : smooth((time - r.startSec) / Math.min(0.35, half));
	const leave = next && touches(r, next) ? 1 : smooth((r.endSec - time) / Math.min(0.45, half));
	const opacity = Math.min(enter, leave),
		scale = 0.92 + 0.08 * opacity;
	return {
		rect: {
			x: r.rect.x + (r.rect.width * (1 - scale)) / 2,
			y: r.rect.y + (r.rect.height * (1 - scale)) / 2,
			width: r.rect.width * scale,
			height: r.rect.height * scale,
		},
		radius: r.radius * scale,
		opacity,
		decoration: r.fullscreen ? 0 : 1,
		reactiveWeight: r.reactiveZoom ? 1 : 0,
		anchor: r.anchor,
	};
}
