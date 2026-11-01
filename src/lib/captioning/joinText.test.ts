import { describe, expect, it } from "vitest";
import { groupTimedCaptionWordsIntoLines } from "./annotationsFromCaptions";
import { joinTranscriptText } from "./joinText";

describe("Qwen caption text", () => {
	it("preserves Chinese punctuation without inserting spaces between characters", () => {
		expect(joinTranscriptText(["你", "好，", "世", "界！"])).toBe("你好，世界！");
	});
	it("preserves English word boundaries in mixed transcripts", () => {
		expect(joinTranscriptText(["使", "用", "Qwen", "ASR", "识", "别。"])).toBe(
			"使用 Qwen ASR 识别。",
		);
	});
	it("groups real aligned characters without stretching individual word times", () => {
		const lines = groupTimedCaptionWordsIntoLines(
			[
				{ text: "你", startSec: 1, endSec: 1.2 },
				{ text: "好。", startSec: 1.2, endSec: 1.5 },
				{ text: "Hi!", startSec: 3, endSec: 3.3 },
			],
			1,
			8,
		);
		expect(lines).toEqual([
			{ text: "你好。", startSec: 1, endSec: 1.5 },
			{ text: "Hi!", startSec: 3, endSec: 3.3 },
		]);
	});
});
