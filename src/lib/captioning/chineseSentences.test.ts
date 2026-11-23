import { expect, it } from "vitest";
import { groupChineseSentences } from "./chineseSentences";

it("keeps an untagged sentence onset with the supported speaker", () => {
	expect(
		groupChineseSentences(
			[
				{ startSec: 20.416, endSec: 20.576, text: "你", speakerId: null },
				{ startSec: 20.736, endSec: 21.936, text: "选的高难度吗？", speakerId: "a" },
			],
			[{ startSec: 20.611, endSec: 21.969, speakerId: "a" }],
			16,
		),
	).toMatchObject([{ text: "你选的高难度吗？", speakerId: "a", startSec: 20.416 }]);
});

it("keeps overlapping speech readable without assigning an uncertain name", () => {
	const cues = groupChineseSentences(
		[
			{ startSec: 22.736, endSec: 22.816, text: "我", speakerId: "a" },
			{ startSec: 22.816, endSec: 23.296, text: "怎么一", speakerId: null },
			{ startSec: 23.616, endSec: 23.776, text: "点也选不出", speakerId: null },
			{ startSec: 24.256, endSec: 24.336, text: "来。", speakerId: "b" },
		],
		[
			{ startSec: 22.699, endSec: 24.278, speakerId: "a" },
			{ startSec: 22.784, endSec: 24.448, speakerId: "b" },
		],
		7,
	);
	expect(cues).toHaveLength(1);
	expect(cues[0].speakerId).toBeNull();
	expect(cues[0].text.replace("\n", "")).toBe("我怎么一点也选不出来。");
});
