import type { AxcutDocument } from "../schema";
import { type CaptionTextRegion, captionCuesToTextRegions, deriveCaptionCues } from "./cues";
import { captionDisplayCues } from "./display";
import {
	CAPTION_INSET_Y_MAX,
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

// Use the text that can actually wrap, not the single-source box's three-line headroom.
// The bound is deterministic in the renderer and main process. ASCII advances in all
// shipped faces fit within 1.25 em; CJK fallback glyphs occupy one em. Word boundaries
// can wrap earlier than character boundaries, so account for both.
function captionLines(text: string, widthEm: number): number {
	let lines = 0;
	for (const paragraph of text.split(/\r\n|[\r\n\u2028\u2029]/u)) {
		lines++;
		let used = 0;
		for (const token of paragraph.match(/\s+|\S+/gu) ?? []) {
			const advances = [...token].map((char) =>
				/\p{Mn}/u.test(char)
					? 0
					: char === " "
						? 0.75
						: char === "\t"
							? 4
							: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
										char,
									)
								? 1
								: 1.25,
			);
			const width = advances.reduce<number>((sum, advance) => sum + advance, 0);
			if (used > 0 && used + width > widthEm) {
				lines++;
				used = 0;
			}
			for (const advance of advances) {
				if (used > 0 && used + advance > widthEm) {
					lines++;
					used = 0;
				}
				used += advance;
			}
		}
	}
	return Math.min(3, Math.max(1, lines));
}

function captionHeight(settings: CaptionSettings, aspect: number, texts: string[]) {
	const width = (captionBoxRect(settings, aspect).width / 100) * 1080 * aspect;
	const widthEm = Math.max(1, width / settings.fontSize - 0.4);
	let lines = 1;
	for (const text of texts) lines = Math.max(lines, captionLines(text, widthEm));
	return (
		((settings.fontSize * (lines * 1.5 + (settings.backgroundEnabled ? 0.2 : 0))) / 1080) * 100
	);
}

/** Shared rendering and slider limits. Each source's own inset controls its position;
 * only real collision constraints limit it. Single-source placement is unchanged. */
export function recordedCaptionLayout(
	settings: [CaptionSettings, CaptionSettings],
	aspect: number,
	swap: boolean,
	texts: [string[], string[]] = [[], []],
) {
	let fitted = settings;
	const maxHeight = Math.max(...fitted.map((style, i) => captionHeight(style, aspect, texts[i])));
	if (maxHeight > 44)
		fitted = fitted.map((style) => ({
			...style,
			fontSize: (style.fontSize * 44) / maxHeight,
		})) as typeof settings;
	const rects = fitted.map((style) => captionBoxRect(style, aspect));
	const height = Math.min(
		44,
		Math.ceil(Math.max(...fitted.map((style, i) => captionHeight(style, aspect, texts[i]))) * 2) /
			2,
	);
	const gap = 1;
	const insets = fitted.map((style) => style.insetY);
	const minimum = [0, 0];
	const maximum = [CAPTION_INSET_Y_MAX, CAPTION_INSET_Y_MAX];
	const anchors = fitted.map((_, i) => fitted[swap ? 1 - i : i].anchorV);
	if (anchors[0] === anchors[1]) {
		const outer = swap ? 0 : 1;
		const inner = 1 - outer;
		maximum[outer] = Math.floor((CAPTION_INSET_Y_MAX - height - gap) * 2) / 2;
		insets[outer] = Math.min(insets[outer], maximum[outer]);
		minimum[inner] = Math.ceil((insets[outer] + height + gap) * 2) / 2;
		insets[inner] = Math.max(insets[inner], minimum[inner]);
	} else {
		const budget = 100 - 2 * height - gap;
		maximum[1] = Math.min(CAPTION_INSET_Y_MAX, Math.floor(budget * 2) / 2);
		insets[1] = Math.min(insets[1], maximum[1]);
		maximum[0] = Math.min(CAPTION_INSET_Y_MAX, Math.floor((budget - insets[1]) * 2) / 2);
		insets[0] = Math.min(insets[0], maximum[0]);
	}
	return fitted.map((style, index) => ({
		settings: style,
		insetY: insets[index],
		minInsetY: minimum[index],
		maxInsetY: maximum[index],
		rect: {
			...rects[index],
			y: anchors[index] === "bottom" ? 100 - insets[index] - height : insets[index],
			height,
			verticalAlign: anchors[index],
		} as CaptionBoxRect,
	}));
}

export function recordedCaptionLayers(document: AxcutDocument, aspect: number) {
	const options = getRecordedCaptionOptions(document);
	const active = availableRecordedCaptionSources(document).filter(
		(source) => options[source].enabled,
	);
	const styles = active.map((source) => getCaptionSettings(document, aspect, source));
	const translations = getCaptionTranslations(document);
	const cues = active.map((source, i) =>
		deriveCaptionCues(document, styles[i], translations, source),
	);
	const layouts =
		active.length === 2
			? recordedCaptionLayout(
					styles as [CaptionSettings, CaptionSettings],
					aspect,
					options.swap,
					cues.map((items) => items.map((cue) => cue.text)) as [string[], string[]],
				)
			: styles.map((settings) => ({
					settings,
					rect: captionBoxRect(settings, aspect),
					insetY: settings.insetY,
					minInsetY: 0,
					maxInsetY: CAPTION_INSET_Y_MAX,
				}));
	return active.map((source, i) => ({ source, cues: cues[i], ...layouts[i] }));
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
		return captionCuesToTextRegions(
			captionDisplayCues(deriveCaptionCues(document, base, translations), document),
			base,
			aspect,
		);
	const regions = recordedCaptionLayers(document, aspect).flatMap(
		({ source, cues, settings, rect }) => {
			return captionCuesToTextRegions(captionDisplayCues(cues, document), settings, aspect).map(
				(region) => ({
					...region,
					id: `${source}:${region.id}`,
					verticalAlign: rect.verticalAlign,
					position: { x: rect.x, y: rect.y },
					size: { width: rect.width, height: rect.height },
				}),
			);
		},
	);
	// A mixed legacy clip has no independently recoverable sources and keeps its original captions.
	const legacyClips = document.timeline.clips.filter(
		(clip) => !document.assets.find((asset) => asset.id === clip.assetId)?.recordingAudio?.length,
	);
	if (legacyClips.length)
		regions.push(
			...captionCuesToTextRegions(
				captionDisplayCues(
					deriveCaptionCues(
						{ ...document, timeline: { ...document.timeline, clips: legacyClips } },
						base,
						translations,
						"recording",
					),
					document,
				),
				base,
				aspect,
			).map((region) => ({ ...region, id: `legacy:${region.id}` })),
		);
	return regions;
}
