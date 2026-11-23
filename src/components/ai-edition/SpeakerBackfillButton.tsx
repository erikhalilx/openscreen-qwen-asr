import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { create } from "zustand";
import { useScopedT } from "@/contexts/I18nContext";
import { applySpeakerBackfill } from "@/lib/ai-edition/document/transcript";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import styles from "./NewEditorShell.module.css";

export const useSpeakerAnalysis = create<{
	progress: { completed: number; total: number } | null;
}>(() => ({ progress: null }));

export function SpeakerAnalysisStatus() {
	const t = useScopedT("settings");
	const progress = useSpeakerAnalysis((state) => state.progress);
	if (!progress) return null;
	return (
		<span role="status" className="inline-flex shrink-0 items-center gap-1 text-xs">
			<Loader2 size={14} className="animate-spin" aria-hidden="true" />
			{t("captions.backfillRunning")}
			{progress.total > 1 ? ` ${progress.completed}/${progress.total}` : null}
		</span>
	);
}

export function SpeakerBackfillButton({
	assetIds,
	busy,
}: {
	assetIds: readonly string[];
	busy: boolean;
}) {
	const t = useScopedT("settings");
	const running = useSpeakerAnalysis((state) => state.progress !== null);
	const hasAnalysis = useProjectStore((state) =>
		state.document?.transcripts.some(
			(transcript) =>
				assetIds.includes(transcript.assetId) && transcript.speakerTurns !== undefined,
		),
	);

	const run = async () => {
		const api = window.electronAPI?.stt?.backfillSpeakers;
		const initial = useProjectStore.getState().document;
		if (!api || !initial || useSpeakerAnalysis.getState().progress || busy) return;
		const targets = [...new Set(assetIds)];
		let completed = 0;
		useSpeakerAnalysis.setState({ progress: { completed, total: targets.length } });
		try {
			for (const assetId of targets) {
				const current = useProjectStore.getState().document;
				if (!current || current.project.id !== initial.project.id) break;
				const asset = current.assets.find((entry) => entry.id === assetId);
				const transcript = current.transcripts.find((entry) => entry.assetId === assetId);
				if (!asset || !transcript?.words.length) continue;
				const words = transcript.words.map((word) => ({
					word: word.originalText || word.text,
					startSec: word.startSec,
					endSec: word.endSec,
				}));
				const result = await api({ sourcePath: asset.originalPath, words });
				const state = useProjectStore.getState();
				const latest = state.document;
				if (!latest || latest.project.id !== initial.project.id) break;
				const next = applySpeakerBackfill(latest, transcript, result);
				if (!next) {
					toast.error(t("captions.backfillChanged"));
					break;
				}
				if (!(await state.saveDocument(next, { history: true, historyBase: latest }))) break;
				useSpeakerAnalysis.setState({
					progress: { completed: ++completed, total: targets.length },
				});
			}
		} catch (error) {
			toast.error(t("captions.backfillFailed"), {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			useSpeakerAnalysis.setState({ progress: null });
		}
	};

	if (!assetIds.length || !window.electronAPI?.stt?.backfillSpeakers) return null;
	return (
		<button
			type="button"
			className={styles.paneHeadBtn}
			disabled={running || busy}
			aria-busy={running}
			onClick={() => void run()}
		>
			{t(
				running
					? "captions.backfillRunning"
					: hasAnalysis
						? "captions.regenerateSpeakers"
						: "captions.backfillSpeakers",
			)}
		</button>
	);
}
