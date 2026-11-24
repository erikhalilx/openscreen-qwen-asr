import { describe, expect, it } from "vitest";
import { formatQwenDiagnosticLog, summarizeCaptureOutput } from "./qwen-diagnostic-log";

describe("Qwen diagnostic privacy", () => {
	it("keeps known messages without persisting private arguments or unknown messages", () => {
		expect(
			formatQwenDiagnosticLog(["[native-sck] starting macOS capture", { path: "/private/take" }]),
		).toBe("[native-sck] starting macOS capture");
		expect(formatQwenDiagnosticLog(["[native-sck] /private/take"])).toBe(
			"[native-sck] (details withheld)",
		);
		expect(formatQwenDiagnosticLog(["[stt] private transcript"])).toBe("(details withheld)");
	});

	it("reports only recognised helper event types", () => {
		expect(
			summarizeCaptureOutput(
				'{"event":"recording-started","path":"/private/take"}\n{"event":"private title"}',
			),
		).toEqual(["recording-started"]);
	});
});
