// This fork retains the upstream settings/planner API for compatibility, but its
// telemetry transport is disabled for both GUI and CLI/MCP. No usage data is sent.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { InstallChannel } from "./install-channel";

/** Often enough that an app left running in the tray for days still counts every day. */
export const USAGE_PING_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface UsagePingState {
	enabled: boolean;
	/** UTC day, ISO week and month of the last ping that went through. */
	day: string | null;
	week: string | null;
	month: string | null;
}

export interface UsagePingFacts {
	version: string;
	os: NodeJS.Platform;
	arch: string;
	channel: InstallChannel;
	/** What the install was used through: the app's window, or `openscreen mcp` for an agent.
	 *  Both share one state file, so a day counts once, under whichever pinged first. */
	surface: "app" | "mcp";
}

const DEFAULT_STATE: UsagePingState = { enabled: true, day: null, week: null, month: null };

/** An environment flag counts as set unless it is empty, "0" or "false": `CI=false` is off. */
const isSet = (value: string | undefined) =>
	value !== undefined && !["", "0", "false"].includes(value.toLowerCase());

/** The usual opt-out convention (consoledonottrack.com). */
export function doNotTrack(env: Readonly<Record<string, string | undefined>>): boolean {
	return isSet(env.DO_NOT_TRACK);
}

/** UTC, so the flags fall in the same buckets as PostHog's UTC days. */
export function periodKeys(now: Date): { day: string; week: string; month: string } {
	const iso = now.toISOString();
	// ISO 8601 week: the week belongs to the year of its Thursday.
	const thursday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
	const year = thursday.getUTCFullYear();
	const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
	return {
		day: iso.slice(0, 10),
		week: `${year}-W${String(week).padStart(2, "0")}`,
		month: iso.slice(0, 7),
	};
}

/** The ping to send now, or null. Pure, so the whole matrix pins from any platform. */
export function planUsagePing(
	state: UsagePingState,
	channel: InstallChannel,
	env: Readonly<Record<string, string | undefined>>,
	now: Date,
): { firstThisWeek: boolean; firstThisMonth: boolean; keys: ReturnType<typeof periodKeys> } | null {
	if (!state.enabled || channel === "dev" || doNotTrack(env) || isSet(env.CI)) return null;
	const keys = periodKeys(now);
	if (state.day === keys.day) return null;
	return {
		firstThisWeek: state.week !== keys.week,
		firstThisMonth: state.month !== keys.month,
		keys,
	};
}

function statePath(userData: string): string {
	return path.join(userData, "usage-ping.json");
}

export function loadUsagePingState(userData: string): UsagePingState {
	try {
		const raw = JSON.parse(readFileSync(statePath(userData), "utf8")) as Partial<UsagePingState>;
		const text = (value: unknown) => (typeof value === "string" ? value : null);
		return {
			enabled: raw.enabled !== false,
			day: text(raw.day),
			week: text(raw.week),
			month: text(raw.month),
		};
	} catch {
		return { ...DEFAULT_STATE };
	}
}

function saveUsagePingState(userData: string, state: UsagePingState): void {
	try {
		writeFileSync(statePath(userData), `${JSON.stringify(state)}\n`, "utf8");
	} catch {
		// Best-effort: a failed write only means the next launch pings again.
	}
}

export function setUsagePingEnabled(userData: string, enabled: boolean): void {
	saveUsagePingState(userData, { ...loadUsagePingState(userData), enabled });
}

type Fetch = (url: string, init: RequestInit) => Promise<{ ok: boolean }>;

/** Upstream-compatible API; this fork sends no installation telemetry from GUI or MCP. */
export async function sendUsagePing(
	_userData: string,
	_facts: UsagePingFacts,
	_env: Readonly<Record<string, string | undefined>> = process.env,
	_now: Date = new Date(),
	_fetchImpl: Fetch = fetch,
): Promise<void> {
	// Deliberate no-op for this independent fork.
}
