import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { useScopedT } from "@/contexts/I18nContext";
import type { CaptionCue } from "@/lib/ai-edition/captions/cues";
import { replaceCaptionSpeaker } from "@/lib/ai-edition/captions/speakerEdits";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import styles from "./NewEditorShell.module.css";

export function ReplaceSpeakerDialog({ cues }: { cues: CaptionCue[] }) {
	const t = useScopedT("settings");
	const common = useScopedT("common");
	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState("");
	const [drafts, setDrafts] = useState(new Map<string, string>());
	const replacement = drafts.get(selected) ?? "";
	const [saving, setSaving] = useState(false);
	const labels = new Map<string, number>();
	for (const { speakerLabel } of cues) {
		if (speakerLabel) labels.set(speakerLabel, (labels.get(speakerLabel) ?? 0) + 1);
	}

	const changeOpen = (next: boolean) => {
		if (saving) return;
		setSelected("");
		setDrafts(new Map());
		setOpen(next);
	};

	const save = async () => {
		const state = useProjectStore.getState();
		if (!state.document || !labels.has(selected) || saving) return;
		const next = replaceCaptionSpeaker(state.document, cues, selected, replacement);
		if (next === state.document) return;
		setSaving(true);
		try {
			if (await state.saveDocument(next, { history: true, historyBase: state.document })) {
				setOpen(false);
			}
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={changeOpen}>
			<DialogTrigger asChild>
				<button type="button" className={styles.paneHeadBtn} disabled={!labels.size}>
					{t("captions.replaceSpeaker")}
				</button>
			</DialogTrigger>
			<DialogContent>
				<DialogTitle>{t("captions.replaceSpeaker")}</DialogTitle>
				<DialogDescription>{t("captions.replaceSpeakerHint")}</DialogDescription>
				<form
					className={styles.replaceSpeakerForm}
					onSubmit={(event) => {
						event.preventDefault();
						void save();
					}}
				>
					<div className={styles.speakerChips} role="group" aria-label={t("captions.speakerLabel")}>
						{Array.from(labels, ([label, count]) => (
							<button
								key={label}
								type="button"
								className={styles.paneHeadBtn}
								aria-pressed={selected === label}
								disabled={saving}
								onClick={() => setSelected(label)}
							>
								{label} ({count})
							</button>
						))}
					</div>
					<label>
						{t("captions.replacementSpeaker")}
						<input
							className={styles.control}
							type="text"
							maxLength={80}
							value={replacement}
							onChange={(event) => {
								const value = event.currentTarget.value;
								setDrafts((current) => new Map(current).set(selected, value));
							}}
							disabled={saving || !labels.has(selected)}
						/>
					</label>
					<button
						type="submit"
						className={`${styles.btn} ${styles.btnPrimary}`}
						disabled={
							saving ||
							!labels.has(selected) ||
							!replacement.trim() ||
							replacement.trim() === selected
						}
					>
						{common("actions.save")}
					</button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
