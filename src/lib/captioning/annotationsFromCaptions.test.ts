import { describe, expect, it } from "vitest";

import {
	dedupeAdjacentCaptionRepeats,
	finalizeCaptionSegmentsForPlayback,
	groupPhraseCaptionSegmentsIntoLines,
	groupTimedCaptionWordsIntoLines,
} from "./annotationsFromCaptions";

describe("groupPhraseCaptionSegmentsIntoLines", () => {
	it("preserves phrase boundaries when formatting phrase-timestamp captions", () => {
		const lines = groupPhraseCaptionSegmentsIntoLines(
			[
				{ startSec: 0, endSec: 0.5, text: "alpha beta" },
				{ startSec: 0.62, endSec: 1.6, text: "gamma delta" },
			],
			2,
			2,
		);

		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({ text: "alpha beta", startSec: 0 });
		expect(lines[1]).toMatchObject({ text: "gamma delta", startSec: 0.62 });
		expect(lines[0]!.endSec).toBeLessThanOrEqual(0.62);
	});

	it("slices a single merged phrase into timed caption lines by word bounds", () => {
		const lines = groupPhraseCaptionSegmentsIntoLines(
			[{ startSec: 0, endSec: 1, text: "alpha beta gamma delta" }],
			2,
			2,
		);

		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({
			startSec: 0,
			endSec: 0.5,
			text: "alpha beta",
		});
		expect(lines[1]).toMatchObject({
			startSec: 0.5,
			endSec: 1,
			text: "gamma delta",
		});
	});
});

describe("groupTimedCaptionWordsIntoLines", () => {
	it("keeps the same speaker's sentence together across brief pauses and missing tags", () => {
		const lines = groupTimedCaptionWordsIntoLines(
			[
				{ startSec: 0, endSec: 0.2, text: "我想", speakerId: "a" },
				{ startSec: 0.5, endSec: 0.6, text: "跟你", speakerId: null },
				{ startSec: 0.65, endSec: 0.8, text: "谈谈。", speakerId: "a" },
				{ startSec: 0.81, endSec: 1, text: "关于", speakerId: "a" },
				{ startSec: 1.4, endSec: 1.6, text: "这件事。", speakerId: "a" },
				{ startSec: 1.61, endSec: 1.8, text: "好。", speakerId: "b" },
			],
			1,
			8,
		);
		expect(lines.map(({ text, speakerId }) => [text, speakerId])).toEqual([
			["我想跟你谈谈。", "a"],
			["关于这件事。", "a"],
			["好。", "b"],
		]);
	});

	it("preserves empty timeline space when word timestamps contain a real pause", () => {
		const lines = groupTimedCaptionWordsIntoLines(
			[
				{ startSec: 0, endSec: 0.12, text: "first" },
				{ startSec: 0.13, endSec: 0.28, text: "caption" },
				{ startSec: 0.7, endSec: 0.83, text: "second" },
				{ startSec: 0.84, endSec: 0.98, text: "caption" },
			],
			2,
			2,
		);

		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({ startSec: 0, endSec: 0.28, text: "first caption" });
		expect(lines[1]).toMatchObject({ startSec: 0.7, endSec: 0.98, text: "second caption" });
	});

	it("preserves repeated words instead of collapsing them into one token", () => {
		const lines = groupTimedCaptionWordsIntoLines(
			[
				{ startSec: 0, endSec: 0.12, text: "I" },
				{ startSec: 0.13, endSec: 0.25, text: "I" },
			],
			2,
			2,
		);

		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({ text: "I I" });
	});
});

describe("dedupeAdjacentCaptionRepeats", () => {
	it("merges the same line repeated across a chunk boundary", () => {
		const lines = dedupeAdjacentCaptionRepeats([
			{ startSec: 0, endSec: 1, text: "hello there" },
			{ startSec: 0.9, endSec: 1.8, text: "Hello there." },
		]);

		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({ startSec: 0, endSec: 1.8 });
	});

	it("keeps the same line spoken again after a real silence", () => {
		const lines = dedupeAdjacentCaptionRepeats([
			{ startSec: 0, endSec: 1, text: "hello there" },
			{ startSec: 8, endSec: 9, text: "hello there" },
		]);

		expect(lines).toHaveLength(2);
	});
});

describe("finalizeCaptionSegmentsForPlayback", () => {
	it("ends a line where the next one starts so two never show at once", () => {
		const lines = finalizeCaptionSegmentsForPlayback([
			{ startSec: 0, endSec: 1.5, text: "first" },
			{ startSec: 1, endSec: 2, text: "second" },
		]);

		expect(lines[0]!.endSec).toBeCloseTo(1, 5);
		expect(lines[1]).toMatchObject({ startSec: 1, endSec: 2 });
	});
});
