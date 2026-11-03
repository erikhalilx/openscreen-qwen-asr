import { Download, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useScopedT } from "@/contexts/I18nContext";
import {
	captionSrtCues,
	captionSrtFileName,
	captionSrtSources,
	captionsToSrt,
} from "@/lib/ai-edition/captions/srt";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { useTimelineTranscriptGate } from "@/lib/ai-edition/store/transcriptionStore";
import styles from "./NewEditorShell.module.css";

/** Shared by the transcript editor and caption settings. Exporting is read-only:
 * showing a hidden source or saving an SRT must not alter project settings/history. */
export function CaptionSrtExport() {
	const t = useScopedT("settings");
	const document = useProjectStore((state) => state.document);
	const gate = useTimelineTranscriptGate();
	const [open, setOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const sources = useMemo(() => captionSrtSources(document), [document]);
	const options = useMemo(
		() =>
			open && document
				? sources.map((source) => ({ source, cues: captionSrtCues(document, source) }))
				: [],
		[document, sources, open],
	);
	const busy = saving || gate.state === "pending";

	const save = async (option: (typeof options)[number]) => {
		if (!document || busy || !option.cues.length) return;
		setOpen(false);
		setSaving(true);
		try {
			const result = await window.electronAPI?.saveCaptionSrt(
				captionSrtFileName(document.project.title, option.source),
				captionsToSrt(option.cues),
			);
			if (result?.success) toast.success(t("captions.srtSaved"));
			else if (!result?.canceled) toast.error(t("captions.srtFailed"));
		} catch {
			toast.error(t("captions.srtFailed"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={styles.paneHeadBtn}
					aria-label={t("captions.exportSrt")}
					disabled={
						busy ||
						!sources.length ||
						!document?.transcripts.some(
							(transcript) => transcript.words.length || transcript.segments.length,
						)
					}
					aria-busy={saving}
				>
					{saving ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
					SRT
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className={styles.srtExportMenu}>
				<strong>{t("captions.exportSrt")}</strong>
				{options.map((option) => (
					<button
						key={option.source}
						type="button"
						className={styles.paneHeadBtn}
						disabled={busy || !option.cues.length}
						onClick={() => void save(option)}
					>
						<Download size={14} />
						{t(
							option.source === "system"
								? "audio.systemSource"
								: option.source === "microphone"
									? "audio.microphoneSource"
									: option.source === "voiceover"
										? "transcript.laneVoiceover"
										: "captions.srtMixedRecording",
						)}{" "}
						(.srt)
					</button>
				))}
				<p>{t("captions.srtHint")}</p>
			</PopoverContent>
		</Popover>
	);
}
