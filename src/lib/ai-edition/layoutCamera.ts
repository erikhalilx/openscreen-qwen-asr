import type { LayoutCameraSettings, LayoutRegion } from "../layoutTypes";
import {
	DEFAULT_PROJECT_APPEARANCE,
	readWebcamAnchor,
	readWebcamMask,
	WEBCAM_SIZE_MAX,
	WEBCAM_SIZE_MIN,
} from "../projectDefaults";
import type { AxcutDocument } from "./schema";
export function layoutCameraSettings(
	document: Pick<AxcutDocument, "legacyEditor">,
	region?: Pick<LayoutRegion, "camera">,
): LayoutCameraSettings {
	if (region?.camera) return region.camera;
	const s = document.legacyEditor ?? {};
	const number = (v: unknown, fallback: number, min: number, max: number) =>
		typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
	return {
		anchor: readWebcamAnchor(s.webcamAnchor, s.webcamPosition),
		size: number(
			s.webcamSizePreset,
			DEFAULT_PROJECT_APPEARANCE.webcamSizePreset,
			WEBCAM_SIZE_MIN,
			WEBCAM_SIZE_MAX,
		),
		shape: readWebcamMask(s.webcamMaskShape, s.webcamRoundness).shape,
		roundness: number(s.webcamRoundness, DEFAULT_PROJECT_APPEARANCE.webcamRoundness, 0, 1),
		reactiveZoom:
			typeof s.webcamReactiveZoom === "boolean"
				? s.webcamReactiveZoom
				: DEFAULT_PROJECT_APPEARANCE.webcamReactiveZoom,
	};
}
