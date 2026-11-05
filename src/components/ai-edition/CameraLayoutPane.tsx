import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { layoutRuns, patchLayoutCamera } from "@/lib/ai-edition/document/layout";
import { layoutCameraSettings } from "@/lib/ai-edition/layoutCamera";
import type { AxcutDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import type { LayoutCameraSettings } from "@/lib/layoutTypes";
import {
	DEFAULT_PROJECT_APPEARANCE,
	DEFAULT_WEBCAM_ROUNDNESS,
	WEBCAM_ANCHOR_LABEL_KEYS,
	WEBCAM_ANCHORS,
	WEBCAM_SIZE_MAX,
	WEBCAM_SIZE_MIN,
	type WebcamAnchor,
} from "@/lib/projectDefaults";
import styles from "./NewEditorShell.module.css";
import { ChoiceRow, SliderCell, Toggle } from "./RightPanes";

export function CameraLayoutPane({
	regionId,
	onDelete,
}: {
	regionId: string;
	onDelete?: () => void;
}) {
	const ts = useScopedT("settings");
	const document = useProjectStore((s) => s.document);
	const base = useRef<AxcutDocument | null>(null);
	const last = useRef<AxcutDocument | null>(null);
	const projectId = document?.project.id;
	// Retire a drag when its region or project goes away, just like useEditorSettings.
	// biome-ignore lint/correctness/useExhaustiveDependencies: identity resets the transaction.
	useEffect(() => {
		base.current = null;
		last.current = null;
	}, [projectId, regionId]);
	const change = (patch: Partial<LayoutCameraSettings>, live = false) => {
		const store = useProjectStore.getState();
		const doc = store.document;
		if (!doc || !layoutRuns(doc).some((r) => r.ids.includes(regionId))) return;
		const region = layoutRuns(doc).find((r) => r.ids.includes(regionId));
		const next = patchLayoutCamera(doc, regionId, {
			...layoutCameraSettings(doc, region?.member),
			...patch,
		});
		if (live) {
			if (last.current !== doc) base.current = doc;
			store.setDocument(next, { history: false });
			last.current = next;
		} else {
			store.setDocument(next, { history: false });
			void store.saveDocument(next, { history: true, historyBase: doc });
		}
	};
	const commit = () => {
		const store = useProjectStore.getState();
		const doc = store.document;
		if (!doc) return;
		const historyBase = doc === last.current ? base.current : null;
		base.current = null;
		last.current = null;
		void store.saveDocument(doc, { history: true, historyBase });
	};
	const region = document && layoutRuns(document).find((r) => r.ids.includes(regionId));
	if (!document || !region) return null;
	const style = layoutCameraSettings(document, region.member);
	return (
		<>
			{region.member.preset === "picture-in-picture" ? (
				<>
					<ChoiceRow<WebcamAnchor>
						label={ts("layout.webcamPosition")}
						columns={3}
						display="both"
						options={WEBCAM_ANCHORS.map((anchor) => ({
							value: anchor,
							label: ts(WEBCAM_ANCHOR_LABEL_KEYS[anchor]),
						}))}
						value={style.anchor}
						onChange={(anchor) => change({ anchor })}
					/>
					<SliderCell
						label={ts("layout.webcamSize")}
						min={WEBCAM_SIZE_MIN}
						max={WEBCAM_SIZE_MAX}
						value={style.size}
						suffix="%"
						defaultValue={DEFAULT_PROJECT_APPEARANCE.webcamSizePreset}
						onChange={(size) => change({ size }, true)}
						onCommit={commit}
					/>
					<div className={styles.paneRow}>
						<span className={styles.label}>{ts("layout.reactiveWebcam")}</span>
						<Toggle
							ariaLabel={ts("layout.reactiveWebcam")}
							checked={style.reactiveZoom}
							onChange={(reactiveZoom) => change({ reactiveZoom })}
						/>
					</div>
					<ChoiceRow<LayoutCameraSettings["shape"]>
						label={ts("layout.webcamShape")}
						display="both"
						options={[
							{ value: "square", label: ts("layout.shapes.square") },
							{ value: "rectangle", label: ts("layout.shapes.original") },
						]}
						value={style.shape}
						onChange={(shape) =>
							change({
								shape,
								...(style.roundness === DEFAULT_WEBCAM_ROUNDNESS[style.shape]
									? { roundness: DEFAULT_WEBCAM_ROUNDNESS[shape] }
									: {}),
							})
						}
					/>
				</>
			) : null}
			<SliderCell
				label={ts("effects.roundness")}
				min={0}
				max={100}
				value={Math.round(style.roundness * 100)}
				suffix="%"
				defaultValue={Math.round(DEFAULT_WEBCAM_ROUNDNESS[style.shape] * 100)}
				onChange={(roundness) => change({ roundness: roundness / 100 }, true)}
				onCommit={commit}
			/>
			{onDelete ? (
				<button type="button" className={styles.paneButton} onClick={onDelete}>
					<Trash2 size={16} />
					{ts("layout.hideSegment")}
				</button>
			) : null}
		</>
	);
}
