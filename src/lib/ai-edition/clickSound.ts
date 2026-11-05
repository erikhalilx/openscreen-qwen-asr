// Mouse-click sound.
//
// The recorded click times (`<video>.cursor.json`, the same telemetry the click bounce and the
// auto-zoom read) become short hits. Nothing is baked into a file: the export sums them in the
// compositor (`mix_click_hits`, crates/compositor/src/audio.rs) and the preview plays them off the
// same list, placed by the raw→programme projection the app lays imported audio tracks out with.
// An imported track is moved by a speed region and never stretched, so a bed rendered against one
// edit falls behind every click after it; these hits are computed from the edit instead.

import type { CursorTelemetryPoint } from "@/components/video-editor/types";
import { nativeBridgeClient } from "@/native/client";
import { projectRawTimelineSecToPlayback, readSpeedRegions } from "./document/timeline";
import type { AxcutAsset, AxcutDocument } from "./schema";
import { audioGainScalar, getEditorSettings } from "./store/editorSettings";
import { resolveClipSourceEndSec } from "./timeline/clipDuration";
import { removedRawSpans } from "./timeline/programme-time";

export type ClickSoundPreset = "realistic" | "bubble";
export const CLICK_SOUND_FILES = {
	realistic: { down: "mouse-realistic-single.wav", up: "mouse-realistic-double.wav" },
	bubble: { down: "mouse-bubble-single.wav", up: "mouse-bubble-double.wav" },
} as const;
export const CLICK_SOUND_DOWN_URL = `sounds/${CLICK_SOUND_FILES.realistic.down}`;
export const CLICK_SOUND_UP_URL = `sounds/${CLICK_SOUND_FILES.realistic.up}`;

export const DOUBLE_CLICK_WINDOW_MS = 500;
const DOUBLE_CLICK_DISTANCE = 0.01;
/** A playhead move larger than this is a seek, not a frame: no hit is owed across it. Kept well
 *  past one frame at the fastest preview rate (16x is ~0.27 s of raw time per frame), because a
 *  stray click after a small jump is a smaller wrong than a click that never sounds.
 *
 *  This is only a seek detector, never a cut detector: a trim narrower than the threshold reads as
 *  an ordinary frame step, which is why the cues the preview fires go through `placedClickHits`. */
const SEEK_JUMP_SEC = 0.5;

export interface ClickCue {
	/** Seconds from the start of the recording — source time, the clock the sidecar is written on,
	 *  not the edited timeline's. */
	timeSec: number;
	gain: number;
	release: boolean;
	/** Second press in a grouped pair, retained so edits can keep either click separately.
	 * The legacy mixer's `release` selector now chooses the complete double-click sample. */
	pairedTimeSec?: number;
}

/** One hit of the scene's `clickSound` block: programme seconds, the compositor's own clock. */
export interface ClickHit {
	timeSec: number;
	gain: number;
	/** Existing native selector: false = complete single sample, true = complete double. */
	release: boolean;
}

export interface ClickSoundScene {
	downPath: string;
	upPath: string;
	hits: ClickHit[];
}

/**
 * Complete single/double samples, rather than separate press/release sounds. Nearby left
 * presses pair non-overlappingly; native double-click markers are not played a second time.
 * Mouse-up and move samples never create sounds. Input telemetry is left untouched.
 */
export function buildClickCues(points: CursorTelemetryPoint[]): ClickCue[] {
	const presses = points
		.filter(
			(point) =>
				Number.isFinite(point.timeMs) &&
				point.timeMs >= 0 &&
				["click", "double-click", "right-click", "middle-click"].includes(
					point.interactionType ?? "",
				),
		)
		.sort((a, b) => a.timeMs - b.timeMs);
	const cues: ClickCue[] = [];
	for (let index = 0; index < presses.length; index++) {
		const first = presses[index];
		const next = presses[index + 1];
		const gap = next ? next.timeMs - first.timeMs : Infinity;
		const nearby =
			next && Math.hypot(next.cx - first.cx, next.cy - first.cy) <= DOUBLE_CLICK_DISTANCE;
		// Explicit native markers carry the OS's own configurable double-click interval.
		const windowMs = next?.interactionType === "double-click" ? 1000 : DOUBLE_CLICK_WINDOW_MS;
		if (
			first.interactionType === "click" &&
			next &&
			(next.interactionType === "click" || next.interactionType === "double-click") &&
			gap > 0 &&
			gap <= windowMs &&
			nearby
		) {
			cues.push({
				timeSec: first.timeMs / 1000,
				gain: 1,
				release: true,
				pairedTimeSec: next.timeMs / 1000,
			});
			index++;
		} else {
			cues.push({
				timeSec: first.timeMs / 1000,
				gain:
					first.interactionType === "right-click" || first.interactionType === "middle-click"
						? 0.85
						: 1,
				release: first.interactionType === "double-click",
			});
		}
	}
	return cues;
}

/** Resolved URLs of the two bundled hits, for the renderer and for staging. */
export function clickHitUrls(preset: ClickSoundPreset = "realistic"): { down: string; up: string } {
	// Page-relative, like the web-demuxer wasm: Vite copies public/sounds into dist/, which an
	// installer ships inside the asar. `getAssetPath` resolves against resources/, which only holds
	// what electron-builder's extraResources copies there.
	const one = (relative: string) => new URL(relative, window.location.href).href;
	return {
		down: one(`sounds/${CLICK_SOUND_FILES[preset].down}`),
		up: one(`sounds/${CLICK_SOUND_FILES[preset].up}`),
	};
}

// Both caches are one-shot: a finished take's sidecar never changes, and the staged samples are
// the same bytes in every project.
const cueCache = new Map<string, ClickCue[]>();
type HitPaths = { down: string; up: string };
const hitPaths = new Map<ClickSoundPreset, HitPaths>();
const hitPathsPending = new Map<ClickSoundPreset, Promise<HitPaths | null>>();
let previewPreset: ClickSoundPreset = "realistic";

/**
 * The take's cues, read from disk once per run. A take whose sidecar cannot be read is cached as
 * holding no clicks: that is the answer the UI gives anyway, and re-asking on every scene build
 * would be a read storm against a file that is simply not there.
 */
export async function loadClickCues(takePath: string): Promise<ClickCue[]> {
	const cached = cueCache.get(takePath);
	if (cached) return cached;
	let cues: ClickCue[] = [];
	try {
		cues = buildClickCues(await nativeBridgeClient.cursor.getTelemetry(takePath));
	} catch (error) {
		console.error("Failed to read the click telemetry of", takePath, error);
	}
	cueCache.set(takePath, cues);
	// A preview that asked for this take gets fed now rather than on the next edit, through the
	// edit that asked for it — the same filter every other stash goes through.
	if (previewTake === takePath && previewEdit) {
		stashPreviewCues(previewEdit.document, previewEdit.take, levelClickCues(cues, previewGainDb));
	}
	return cues;
}

/**
 * The bundled hits as files the compositor can open. The renderer knows them as a URL and the
 * package layout they ship in is nobody else's business, so the bytes go to the main process once
 * and it writes them under userData. `null` outside Electron (the browser shim keeps the URLs,
 * which is all the preview needs).
 */
export function ensureClickHitPaths(
	preset: ClickSoundPreset = "realistic",
): Promise<HitPaths | null> {
	const cached = hitPaths.get(preset);
	if (cached) return Promise.resolve(cached);
	const pending = hitPathsPending.get(preset);
	if (pending) return pending;
	const request = stageClickHits(preset).finally(() => hitPathsPending.delete(preset));
	hitPathsPending.set(preset, request);
	return request;
}

async function stageClickHits(
	preset: ClickSoundPreset,
): Promise<{ down: string; up: string } | null> {
	const stage = window.electronAPI?.stageClickSoundHit;
	if (!stage) return null;
	const urls = clickHitUrls(preset);
	const staged: string[] = [];
	for (const [key, name] of [
		["down", CLICK_SOUND_FILES[preset].down],
		["up", CLICK_SOUND_FILES[preset].up],
	] as const) {
		const response = await fetch(urls[key]);
		if (!response.ok) return null;
		const saved = await stage(name, await response.arrayBuffer());
		if (!saved?.success || !saved.path) return null;
		staged.push(saved.path);
	}
	const paths = { down: staged[0], up: staged[1] };
	hitPaths.set(preset, paths);
	return paths;
}

/** The document's primary take — the one whose sidecar the clicks were recorded in. */
export function clickTakeOf(document: AxcutDocument | null | undefined) {
	return (
		document?.assets.find((asset) => asset.id === document.project?.primaryAssetId) ??
		document?.assets.find((asset) => asset.kind === "video") ??
		document?.assets[0]
	);
}

/**
 * The cues as the user asked to hear them. One place, because the preview plays these gains and
 * the export sums the hits built from them — a level applied to only one of the two would make
 * the preview lie about the file. `audioGainScalar` is the same dB law the output gain and the
 * compositor's `finish_audio` use.
 */
export function levelClickCues(cues: ClickCue[], gainDb: number): ClickCue[] {
	const scalar = audioGainScalar(gainDb);
	return scalar === 1 ? cues : cues.map((cue) => ({ ...cue, gain: cue.gain * scalar }));
}

/**
 * The scene's `clickSound` block for this document, or null when there is nothing to play.
 *
 * Synchronous by design: `buildSceneDescription` runs on paths that cannot await, so the answers
 * come from the caches above and a take that has not been read is read in the background here.
 * That is why an absent block means "off" as often as "not read yet" — the exporter awaits
 * `prepareClickSound` first and never relies on the guess.
 */
export function clickSoundForDocument(
	document: AxcutDocument,
	cursor: { clickSound: boolean; clickSoundGainDb: number; clickSoundPreset?: ClickSoundPreset },
): ClickSoundScene | null {
	const take = cursor.clickSound ? clickTakeOf(document) : undefined;
	const takePath = take?.originalPath;
	// The level rides along, so a cue read that lands after this (the background one below) is
	// still stashed at the level the user set, not at unity.
	previewGainDb = cursor.clickSoundGainDb;
	previewPreset = cursor.clickSoundPreset ?? "realistic";
	if (!takePath || !take) {
		previewEdit = null;
		previewTake = undefined;
		previewCues = [];
		previewByClip.clear();
		return null;
	}
	// A take never read before is read now, in the background: the scene build cannot await.
	// `loadClickCues` feeds the preview when it lands; an export awaits `prepareClickSound`.
	// The main process builds scenes too (getFrames renders from the document) and has no renderer
	// bridge to read the sidecar through. It renders pictures, never this sound, so it skips the read.
	if (!cueCache.has(takePath) && typeof window !== "undefined") void loadClickCues(takePath);
	const cues = levelClickCues(cueCache.get(takePath) || [], cursor.clickSoundGainDb);
	stashPreviewCues(document, take, cues);
	const paths = hitPaths.get(previewPreset);
	if (!paths || cues.length === 0) return null;
	return {
		downPath: paths.down,
		upPath: paths.up,
		// The same placement the preview was filtered by, only mapped onto the programme clock.
		hits: placeClickHits(document, take, cues),
	};
}

/**
 * Where this edit plays a click recorded at `cue.timeSec` of the take: every clip that shows it,
 * each with the PROGRAMME second the compositor mixes onto, and none when nothing is on screen
 * there. A take pasted twice plays its click twice, once per copy that keeps it. Three
 * clocks are in play, so there are three steps: a click is recorded in the take's own source
 * seconds, the timeline plays a clip's source window at that clip's position (a take trimmed at the
 * head, or repeated across clips, is not at ruler zero), and only then do trims and speed regions
 * move what is left. A cue no clip shows — cut out, or past the last frame — has no placement,
 * which is also what keeps a cut from clamping the click onto the seam.
 *
 * The clip comes along in the answer because the preview reads the mounted clip's source clock, and
 * the same take can sit in two clips that cut away different stretches of it: a cue the mounted
 * clip removed is not that clip's to fire, however a twin keeps it. Upstream closes the same leak
 * for playback in `locateKeptSegment`, which is also handed the active clip id.
 *
 *  The edit is read once, so the result is a per-cue lookup; the export's hits and the preview's
 *  cues both come from it, which is the point.
 */
function clickPlacement(
	document: AxcutDocument,
	take: AxcutAsset,
): (cue: ClickCue) => Array<{ clipId: string; sec: number }> {
	const clips = document.timeline.clips;
	const trims = document.timeline.trimRanges;
	const speeds = readSpeedRegions(document);
	const removed = removedRawSpans(clips, trims);
	const windows = clips
		.filter((clip) => clip.assetId === take.id)
		.map((clip) => ({
			id: clip.id,
			from: clip.sourceStartSec,
			to: resolveClipSourceEndSec(clip, take),
			at: clip.timelineStartSec,
		}));
	return (cue) => {
		const placements: Array<{ clipId: string; sec: number }> = [];
		for (const window of windows) {
			if (cue.timeSec < window.from || cue.timeSec >= window.to) continue;
			const rawSec = window.at + (cue.timeSec - window.from);
			if (removed.some((span) => rawSec >= span.startSec && rawSec < span.endSec)) continue;
			placements.push({
				clipId: window.id,
				sec: projectRawTimelineSecToPlayback(clips, trims, rawSec, speeds),
			});
		}
		return placements;
	};
}

/** The take's clicks this edit plays, each with the clip that plays it and its programme second. */
export function placedClickHits(
	document: AxcutDocument,
	take: AxcutAsset,
	cues: ClickCue[],
): Array<{ clipId: string; sec: number; cue: ClickCue }> {
	const place = clickPlacement(document, take);
	const placed: Array<{ clipId: string; sec: number; cue: ClickCue }> = [];
	for (const cue of cues) {
		if (cue.pairedTimeSec === undefined) {
			for (const at of place(cue)) placed.push({ ...at, cue });
			continue;
		}
		const first: ClickCue = { timeSec: cue.timeSec, gain: cue.gain, release: false };
		const second: ClickCue = { ...first, timeSec: cue.pairedTimeSec };
		const firstPlaces = place(first);
		const secondPlaces = place(second);
		for (const at of firstPlaces) {
			const both = secondPlaces.some((other) => other.clipId === at.clipId);
			placed.push({ ...at, cue: both ? cue : first });
		}
		for (const at of secondPlaces) {
			if (!firstPlaces.some((other) => other.clipId === at.clipId))
				placed.push({ ...at, cue: second });
		}
	}
	return placed.sort((a, b) => a.sec - b.sec);
}

/** The take's clicks, as hits on the PROGRAMME seconds the compositor mixes onto. */
export function placeClickHits(
	document: AxcutDocument,
	take: AxcutAsset,
	cues: ClickCue[],
): ClickHit[] {
	return placedClickHits(document, take, cues).map(({ sec, cue }) => ({
		timeSec: sec,
		gain: cue.gain,
		release: cue.release,
	}));
}

/**
 * Loads what the sound needs for `document`: its cues, and the samples staged for the export.
 * Call this where a result must not depend on a background read having finished — switching the
 * sound on, and exporting with it on. Does nothing while the setting is off, so a caller that
 * always asks cannot hand the preview clicks the user never asked to hear.
 */
export async function prepareClickSound(document: AxcutDocument): Promise<void> {
	const settings = getEditorSettings(document);
	const cursor = settings.cursor;
	if (!cursor.clickSound) return;
	const take = clickTakeOf(document);
	if (!take?.originalPath) return;
	previewGainDb = cursor.clickSoundGainDb;
	previewPreset = cursor.clickSoundPreset ?? "realistic";
	const cues = await loadClickCues(take.originalPath);
	stashPreviewCues(document, take, levelClickCues(cues, cursor.clickSoundGainDb));
	await ensureClickHitPaths(cursor.clickSoundPreset ?? "realistic");
}

// What the preview plays. Building the scene is the one place that has the document, the setting
// and the cues together, so it stashes them here and the rAF tick drains them by crossings.
let previewCues: ClickCue[] = [];
/** The same cues under the clip that plays them: a tick crosses one clip's source window, and a
 *  click a twin clip keeps is not this clip's to fire over a stretch it cut away. */
const previewByClip = new Map<string, ClickCue[]>();
let previewTake: string | undefined;
let previewGainDb = 0;
/** The edit the stashed cues belong to, kept so a cue read that lands after the build is filtered
 *  by that same edit instead of going back to playing clicks the cut removed. */
let previewEdit: { document: AxcutDocument; take: AxcutAsset } | null = null;
let lastSourceSec = Number.NaN;
let playheadGeneration = 0;

/** Stashes what the preview may fire, already at the level the user set, through the same placement
 *  the export's hits come from. The two then cannot disagree about which clicks exist, or over which
 *  clip — only about when they sound. */
function stashPreviewCues(
	document: AxcutDocument,
	take: AxcutAsset,
	leveledCues: ClickCue[],
): void {
	previewEdit = { document, take };
	previewTake = take.originalPath;
	previewByClip.clear();
	// A cue two clips keep is one recorded click: the clip-less list, crossed on the source clock,
	// holds it once so a crossing fires it once.
	const kept = new Map<string, ClickCue>();
	for (const placed of placedClickHits(document, take, leveledCues)) {
		const key = `${placed.cue.timeSec}:${placed.cue.gain}`;
		if (!kept.has(key) || placed.cue.release) kept.set(key, placed.cue);
		const bucket = previewByClip.get(placed.clipId) ?? [];
		bucket.push(placed.cue);
		previewByClip.set(placed.clipId, bucket);
	}
	previewCues = [...kept.values()].sort((x, y) => x.timeSec - y.timeSec);
}

/** The hits the playhead passed since the last call, measured in the take's own source seconds —
 *  where a click was recorded, and where the preview's picture is: under a 2x region that clock
 *  races with the picture, so a hit fired on a crossing lands on the click being shown.
 *
 *  `mountedTakePath` is the take on screen now. The cues belong to one take, so playing them over
 *  another take's picture would put a click where no click happened. `mountedClipId` narrows it one
 *  step further, to the clip on screen: the same take can appear in two clips that cut different
 *  stretches, and a click the mounted clip removed belongs to the twin's clock, not this one.
 *  An unresolved id is not a reason to go silent, so it plays every click the edit shows. */
export function takeCrossedClickHits(
	sourceSec: number,
	mountedTakePath?: string | null,
	mountedClipId?: string | null,
): ClickCue[] {
	const fit = clickCuesFitTake(previewTake, mountedTakePath);
	const cues = mountedClipId ? (previewByClip.get(mountedClipId) ?? []) : previewCues;
	const crossed = fit ? crossedClickHits(cues, lastSourceSec, sourceSec) : [];
	// The anchor moves either way: coming back to the right take must not repay a stack of clicks.
	lastSourceSec = sourceSec;
	return crossed;
}

/**
 * Whether cues recorded against `cueTake` may sound while `mountedTake` is on screen. Only a known
 * mismatch suppresses them — a preview that has no path resolved yet (a source still being built,
 * or one loaded from a URL rather than a file) must not fall silent because of this check.
 */
export function clickCuesFitTake(
	cueTake: string | undefined,
	mountedTake?: string | null,
): boolean {
	return !cueTake || !mountedTake || mountedTake === cueTake;
}

/**
 * The clicks whose recorded time lies between two readings of the playhead, both in the take's own
 * source seconds. A move too big for one frame is a seek (or a clip swap) and nothing is owed
 * across it; a move backwards is a rewind, and since nothing is consumed the same clicks are
 * crossed again.
 */
export function crossedClickHits(
	cues: ClickCue[],
	fromSourceSec: number,
	toSourceSec: number,
): ClickCue[] {
	if (
		!(fromSourceSec >= 0) ||
		toSourceSec <= fromSourceSec ||
		toSourceSec - fromSourceSec > SEEK_JUMP_SEC
	) {
		return [];
	}
	return cues.filter((cue) => cue.timeSec > fromSourceSec && cue.timeSec <= toSourceSec);
}

/** The preview calls this while stopped: the next run starts wherever the user left the playhead,
 *  and an anchor from the previous run would fire a stack of clicks that already went by. */
export function resetClickPlayhead(): void {
	lastSourceSec = Number.NaN;
	// Also retires whatever is still being decoded. The sample is fetched and decoded on first use,
	// so the last pre-stop crossing can land a few frames later; a paused context keeps running, so
	// `state` alone cannot tell that run from the one the user stopped.
	playheadGeneration += 1;
}

const hitBuffers = new WeakMap<AudioContext, Map<ClickSoundPreset, Promise<AudioBuffer[]>>>();

/** Complete `[single, double]` samples; legacy mixer field names stay wire-compatible. */
export function clickHitBuffers(
	context: AudioContext,
	preset: ClickSoundPreset = previewPreset,
): Promise<AudioBuffer[]> {
	let cache = hitBuffers.get(context);
	if (!cache) {
		cache = new Map();
		hitBuffers.set(context, cache);
	}
	let pending = cache.get(preset);
	if (!pending) {
		const urls = clickHitUrls(preset);
		pending = Promise.all([decodeHit(context, urls.down), decodeHit(context, urls.up)]);
		cache.set(preset, pending);
	}
	return pending;
}

async function decodeHit(context: AudioContext, url: string): Promise<AudioBuffer> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Failed to fetch ${url}`);
	return context.decodeAudioData(await response.arrayBuffer());
}

/** The hits, heard. `buffers` resolves on its own so a tick never waits on a decode, and a
 *  sample that will not load stays silent rather than throwing on every frame. A crossing that the
 *  preview has since stopped behind is dropped: it was owed to a playhead that is no longer moving. */
export function playClickHits(
	context: AudioContext,
	destination: AudioNode,
	buffers: Promise<AudioBuffer[]>,
	cues: ClickCue[],
): void {
	const generation = playheadGeneration;
	void buffers
		.then(([down, up]) => {
			if (context.state === "closed" || generation !== playheadGeneration) return;
			for (const cue of cues) {
				const buffer = cue.release ? up : down;
				if (!buffer) continue;
				const source = context.createBufferSource();
				source.buffer = buffer;
				const gain = context.createGain();
				gain.gain.value = cue.gain;
				source.connect(gain).connect(destination);
				source.start();
			}
		})
		.catch(() => undefined);
}
