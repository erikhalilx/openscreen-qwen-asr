// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as recorderHandles from "./recorderHandle";
import { useCameraHudSync } from "./useCameraHudSync";
import { useScreenRecorder } from "./useScreenRecorder";

vi.mock("@/contexts/I18nContext", () => {
	const translate = (key: string) => key;
	return { useScopedT: () => translate };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("./useCameraDevices", () => ({
	useCameraDevices: (_enabled: boolean, preferred?: string) => ({
		selectedDeviceId: preferred ?? "cam-1",
		selectedDevice: { label: preferred === "cam-2" ? "Camera 2" : "Camera 1" },
		isReady: true,
	}),
}));

type Prefs = Awaited<ReturnType<Window["electronAPI"]["getRecordingPrefs"]>>;
const initial: Prefs = {
	micEnabled: false,
	micDeviceId: null,
	micDeviceName: null,
	camEnabled: true,
	camDeviceId: null,
	camDeviceName: null,
	camQuality: "2160p",
	systemAudioEnabled: false,
	cursorCaptureMode: "editable-overlay",
	hideDesktopIcons: false,
	autoZoomEnabled: true,
};

afterEach(() => {
	cleanup();
	window.history.replaceState({}, "", "/");
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function setup(overrides: Partial<Window["electronAPI"]> = {}) {
	window.history.replaceState({}, "", "/?windowType=hud-overlay");
	let publish: ((prefs: Prefs) => void) | undefined;
	const stops: Array<ReturnType<typeof vi.fn>> = [];
	const getUserMedia = vi.fn(async () => {
		const stop = vi.fn();
		stops.push(stop);
		const track = { stop, onended: null, getSettings: () => ({ width: 1920, height: 1080 }) };
		return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
	});
	Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
	window.electronAPI = {
		getPlatform: () => "darwin",
		getRecordingPrefs: async () => initial,
		onRecordingPrefsChanged: (callback: (prefs: Prefs) => void) => {
			publish = callback;
			return () => undefined;
		},
		hideCountdownOverlay: vi.fn().mockResolvedValue(undefined),
		...overrides,
	} as unknown as Window["electronAPI"];
	const view = renderHook(() => {
		const recorder = useScreenRecorder();
		useCameraHudSync(recorder);
		return recorder;
	});
	return { view, getUserMedia, stops, publish: (prefs: Prefs) => publish?.(prefs) };
}

describe("camera preview across recording preference broadcasts", () => {
	it("keeps the resolved default camera stream alive when audio toggles publish unchanged camera preferences", async () => {
		const { view, getUserMedia, stops, publish } = setup();
		await waitFor(() => expect(view.result.current.webcamPreviewStream).not.toBeNull());
		const stream = view.result.current.webcamPreviewStream;
		const calls = getUserMedia.mock.calls.length;
		const stop = stops.at(-1);
		await act(async () => {
			view.result.current.setSystemAudioEnabled(true);
			publish({ ...initial, systemAudioEnabled: true });
		});
		await act(async () => {
			view.result.current.setMicrophoneEnabled(true);
			publish({ ...initial, micEnabled: true, systemAudioEnabled: true });
		});
		expect(view.result.current.webcamPreviewStream).toBe(stream);
		expect(getUserMedia).toHaveBeenCalledTimes(calls);
		expect(stop).not.toHaveBeenCalled();
	});

	it("still applies a changed camera selection and an explicit reset to the default", async () => {
		const { view, publish } = setup();
		await waitFor(() => expect(view.result.current.webcamPreviewStream).not.toBeNull());
		const first = view.result.current.webcamPreviewStream;
		await act(async () => publish({ ...initial, camDeviceId: "cam-2", camDeviceName: "Camera 2" }));
		expect(view.result.current.webcamDeviceId).toBe("cam-2");
		expect(view.result.current.webcamPreviewStream).not.toBe(first);
		await act(async () => publish(initial));
		expect(view.result.current.webcamDeviceId).toBe("cam-1");
	});

	it("stops and discards the camera take when macOS screen capture refuses to start", async () => {
		vi.stubGlobal("MediaRecorder", { isTypeSupported: () => true });
		const stop = vi.fn();
		const discard = vi.fn(async () => undefined);
		vi.spyOn(recorderHandles, "createRecorderHandle").mockReturnValue({
			recorder: { stop, state: "recording" } as unknown as MediaRecorder,
			recordedBlobPromise: Promise.resolve(new Blob()),
			discard,
			isStreaming: () => true,
		});
		const start = vi.fn(async () => ({ success: false, error: "Screen start refused" }));
		const { view } = setup({
			getSelectedSource: async () => ({
				id: "screen:0:0",
				name: "Screen",
				display_id: "1",
				thumbnail: "",
				appIcon: null,
			}),
			getSystemVersion: () => "26.5",
			getRecordingPrefs: async () => ({ ...initial, cursorCaptureMode: "system" }),
			isNativeMacCaptureAvailable: async () => ({ success: true, available: true }),
			startNativeMacRecording: start,
			showCountdownOverlay: async () => undefined,
			setCountdownOverlayValue: async () => undefined,
		});
		await waitFor(() => expect(view.result.current.webcamPreviewStream).not.toBeNull());
		act(() => view.result.current.toggleRecording());
		await waitFor(() => expect(discard).toHaveBeenCalledOnce(), { timeout: 6000 });
		expect(start).toHaveBeenCalledOnce();
		expect(stop).toHaveBeenCalledOnce();
		expect(view.result.current.recording).toBe(false);
	});
});
