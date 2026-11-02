import type { AxcutDocument } from "../schema";
import { type CaptionTextRegion, captionCuesToTextRegions, deriveCaptionCues } from "./cues";
import {
	type CaptionBoxRect,
	type CaptionSettings,
	captionBoxRect,
	getCaptionSettings,
	resolveCaptionLane,
} from "./settings";
import { getCaptionTranslations } from "./translations";

export type RecordedCaptionSource = "system" | "microphone";
export interface RecordedCaptionOptions {
	system: { enabled: boolean };
	microphone: { enabled: boolean };
	swap: boolean;
}

export function availableRecordedCaptionSources(
	document: AxcutDocument | null | undefined,
): RecordedCaptionSource[] {
	return (["system", "microphone"] as const).filter((kind) =>
		document?.audioTracks?.some((track) => track.recordingSource === kind),
	);
}

export function getRecordedCaptionOptions(
	document: AxcutDocument | null | undefined,
): RecordedCaptionOptions {
	const raw = document?.legacyEditor?.recordedCaptions as
		| Partial<RecordedCaptionOptions>
		| undefined;
	return {
		system: { enabled: raw?.system?.enabled !== false },
		microphone: { enabled: raw?.microphone?.enabled !== false },
		swap: raw?.swap === true,
	};
}

export function patchRecordedCaptionOptions(
	document: AxcutDocument,
	patch: Partial<RecordedCaptionOptions>,
): AxcutDocument {
	const previous = document.legacyEditor?.recordedCaptions as Record<string, unknown> | undefined;
	return {
		...document,
		legacyEditor: {
			...document.legacyEditor,
			recordedCaptions: {
				...previous,
				...patch,
				system: { ...(previous?.system as object), ...patch.system },
				microphone: { ...(previous?.microphone as object), ...patch.microphone },
			},
		},
	};
}

/** Two equal-height slots reserve enough room for either source's largest wrapped caption.
 * Single-source rendering never enters this path, preserving its six original anchors. */
export function recordedCaptionLayout(
	settings: [CaptionSettings, CaptionSettings],
	aspect: number,
	swap: boolean,
) {
	let fitted = settings;
	const maxHeight = Math.max(...fitted.map((style) => captionBoxRect(style, aspect).height));
	if (maxHeight > 44)
		fitted = fitted.map((style) => ({
			...style,
			fontSize: (style.fontSize * 44) / maxHeight,
		})) as typeof settings;
	const rects = fitted.map((style) => captionBoxRect(style, aspect));
	const height = Math.min(44, Math.max(...rects.map((rect) => rect.height)));
	const gap = 2;
	const natural = fitted.map((style) =>
		Math.max(
			0,
			Math.min(
				100 - height,
				style.anchorV === "bottom" ? 100 - style.insetY - height : style.insetY,
			),
		),
	);
	let y: number[];
	if (Math.abs(natural[0] - natural[1]) >= height + gap) {
		y = swap ? [natural[1], natural[0]] : natural;
	} else {
		const outer = swap ? 0 : 1;
		const bottom = fitted[outer].anchorV === "bottom";
		const outerY = bottom
			? Math.max(height + gap, natural[outer])
			: Math.min(100 - 2 * height - gap, natural[outer]);
		y = [];
		y[outer] = outerY;
		y[1 - outer] = outerY + (bottom ? -1 : 1) * (height + gap);
	}
	return fitted.map((style, index) => ({
		settings: style,
		rect: { ...rects[index], y: y[index], height } as CaptionBoxRect,
	}));
}

/** The only caption assembly used by preview and export. Each source retains its own text,
 * style and on/off state; timestamp projection and the native text renderer are shared. */
export function deriveRecordedCaptionRegions(
	document: AxcutDocument,
	aspect: number,
): CaptionTextRegion[] {
	const base = getCaptionSettings(document, aspect);
	const available = availableRecordedCaptionSources(document);
	const translations = getCaptionTranslations(document);
	if (!available.length || resolveCaptionLane(document, base) === "voiceover")
		return captionCuesToTextRegions(deriveCaptionCues(document, base, translations), base, aspect);
	const options = getRecordedCaptionOptions(document);
	const active = available.filter((source) => options[source].enabled);
	const styles = active.map((source) => getCaptionSettings(document, aspect, source));
	const layouts =
		active.length === 2
			? recordedCaptionLayout(styles as [CaptionSettings, CaptionSettings], aspect, options.swap)
			: styles.map((settings) => ({ settings, rect: captionBoxRect(settings, aspect) }));
	const regions = active.flatMap((source, index) => {
		const { settings, rect } = layouts[index];
		return captionCuesToTextRegions(
			deriveCaptionCues(document, settings, translations, source),
			settings,
			aspect,
		).map((region) => ({
			...region,
			id: `${source}:${region.id}`,
			position: { x: rect.x, y: rect.y },
			size: { width: rect.width, height: rect.height },
		}));
	});
	// A mixed legacy clip has no independently recoverable sources and keeps its original captions.
	const legacyClips = document.timeline.clips.filter(
		(clip) => !document.assets.find((asset) => asset.id === clip.assetId)?.recordingAudio?.length,
	);
	if (legacyClips.length)
		regions.push(
			...captionCuesToTextRegions(
				deriveCaptionCues(
					{ ...document, timeline: { ...document.timeline, clips: legacyClips } },
					base,
					translations,
					"recording",
				),
				base,
				aspect,
			).map((region) => ({ ...region, id: `legacy:${region.id}` })),
		);
	return regions;
}
