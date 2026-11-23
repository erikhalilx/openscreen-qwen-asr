import { joinTranscriptText } from "./joinText";
import type { CaptionSegment } from "./transcribe";

type Turn = { startSec: number; endSec: number; speakerId: string };
const sentenceEnd = /[。！？.!?…]["'”’」』）)]*$/;
const clauseEnd = /[，、；：,;:]$/;
const hasHan = /\p{Script=Han}/u;

function overlaps(turn: Turn, start: number, end: number) {
	return turn.startSec < end && turn.endSec > start;
}

function chooseSpeaker(words: CaptionSegment[], turns: Turn[]): string | null | undefined {
	const start = words[0].startSec;
	const end = words.at(-1)!.endSec;
	const direct = turns.filter((turn) => overlaps(turn, start, end));
	const nearby = direct.length
		? direct
		: turns.filter((turn) => overlaps(turn, start - 0.1, end + 0.1));
	const tags = new Set(words.flatMap(({ speakerId }) => (speakerId ? [speakerId] : [])));
	if (nearby.length === 0) {
		if (turns.length === 0 && tags.size === 1 && words.every((word) => word.speakerId))
			return [...tags][0];
		return words.some(({ speakerId }) => speakerId !== undefined) ? null : undefined;
	}
	const ids = new Set(nearby.map((turn) => turn.speakerId));
	if (ids.size !== 1 || tags.size > 1) return null;
	const [id] = ids;
	return [...tags].every((tag) => tag === id) &&
		(tags.size > 0 || nearby.some((turn) => overlaps(turn, start, end)))
		? id
		: null;
}

export function groupChineseSentences(
	input: CaptionSegment[],
	turns: Turn[],
	maxUnits: number,
): CaptionSegment[] {
	const words = input.filter((word) => word.text.trim()).sort((a, b) => a.startSec - b.startSec);
	const out: CaptionSegment[] = [];
	// Count Han characters even when imported as a single token. Keep Latin words intact.
	const size = (word: CaptionSegment) =>
		(word.text.match(/\p{Script=Han}|[\p{L}\p{N}]+/gu) ?? []).length || 1;
	const limit = Math.max(1, Math.floor(maxUnits));
	const cutAt = (run: CaptionSegment[], budget: number) => {
		let units = 0;
		let split = 0;
		let clause = 0;
		for (const word of run) {
			units += size(word);
			if (split > 0 && units > budget) break;
			split++;
			if (units >= budget / 2 && clauseEnd.test(word.text.trim())) clause = split;
		}
		return split === run.length ? split : clause || split;
	};
	const flush = (run: CaptionSegment[]) => {
		const speakerId = chooseSpeaker(run, turns);
		for (let rest = run; rest.length > 0; ) {
			const first = cutAt(rest, limit);
			const second = first + cutAt(rest.slice(first), limit);
			const join = (slice: CaptionSegment[]) => joinTranscriptText(slice.map((word) => word.text));
			const text = [join(rest.slice(0, first)), join(rest.slice(first, second))]
				.filter(Boolean)
				.join("\n");
			const startSec = rest[0].startSec;
			const endSec = Math.max(startSec + 0.02, rest[second - 1].endSec);
			const previous = out.at(-1);
			if (previous && Math.round(startSec * 1000) === Math.round(previous.startSec * 1000)) {
				previous.text = joinTranscriptText([previous.text, text]);
				previous.endSec = Math.max(previous.endSec, endSec);
				if (previous.speakerId !== speakerId) previous.speakerId = null;
			} else out.push({ startSec, endSec, text, speakerId });
			rest = rest.slice(second);
		}
	};
	let start = 0;
	for (let i = 1; i < words.length; i++) {
		const before = words[i - 1];
		const after = words[i];
		const clearChange =
			before.speakerId &&
			after.speakerId &&
			before.speakerId !== after.speakerId &&
			!turns.some(
				(turn) =>
					overlaps(turn, before.endSec - 0.04, after.startSec + 0.04) &&
					((turn.speakerId === before.speakerId && turn.endSec > after.startSec + 0.04) ||
						(turn.speakerId === after.speakerId && turn.startSec < before.endSec - 0.04)),
			);
		if (
			sentenceEnd.test(before.text.trim()) ||
			after.startSec - before.endSec >= 0.65 ||
			clearChange
		) {
			flush(words.slice(start, i));
			start = i;
		}
	}
	if (start < words.length) flush(words.slice(start));
	return out;
}

export function usesChineseSentences(language: string, words: CaptionSegment[]) {
	return (
		/^(zh|yue)(-|$)/i.test(language) ||
		(language === "auto" && words.some((word) => hasHan.test(word.text)))
	);
}
