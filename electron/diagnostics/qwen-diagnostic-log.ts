// Console arguments may contain window titles, paths, transcripts or model/provider
// configuration. Persist only known events; arbitrary args go to the live console only.
const KNOWN_MESSAGES = [
	"[native-sck] starting macOS capture",
	"[native-sck] recovered the part of the take written before its stop failed",
	"[native-sck] Could not create separate audio sidecars:",
	"[app] the last window closed; quitting",
	"[app] quitting",
	"Failed to start recording:",
	"Global shortcut registered: CommandOrControl+Shift+O",
] as const;
const KNOWN_SUBSYSTEM = /^\[(?:native-sck|diagnostics|permissions|compositor|capture|live)\]/;

export function formatQwenDiagnosticLog(args: unknown[]): string {
	const message = args[0];
	if (typeof message !== "string") return "(details withheld)";
	if (KNOWN_MESSAGES.some((known) => known === message)) return message;
	const subsystem = KNOWN_SUBSYSTEM.exec(message)?.[0];
	return subsystem ? `${subsystem} (details withheld)` : "(details withheld)";
}

const CAPTURE_EVENTS = new Set([
	"recording-started",
	"recording-stopped",
	"system-audio-unavailable",
	"presenter-overlay-changed",
	"error",
]);

export function summarizeCaptureOutput(output: string): string[] {
	return output.split("\n").flatMap((line) => {
		try {
			const event: unknown = JSON.parse(line);
			if (
				event &&
				typeof event === "object" &&
				"event" in event &&
				typeof event.event === "string" &&
				CAPTURE_EVENTS.has(event.event)
			) {
				return [event.event];
			}
		} catch {
			// The helper also writes free-form messages. They can contain private paths.
		}
		return [];
	});
}
