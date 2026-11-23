import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useScopedT } from "@/contexts/I18nContext";
import type { SttSpeakerSettings } from "../../../electron/stt/transcriptionContract";
import styles from "./NewEditorShell.module.css";

export function SpeakerDefaultsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useScopedT("settings");
	const [settings, setSettings] = useState<SttSpeakerSettings>();
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!open) return;
		let current = true;
		void window.electronAPI?.stt?.speakerSettings?.().then(
			(value) => {
				if (current) setSettings(value);
			},
			() => {
				if (current) setSettings(undefined);
			},
		);
		return () => {
			current = false;
		};
	}, [open]);

	const save = async (enabled: boolean) => {
		const action = window.electronAPI?.stt?.setSpeakerDefault;
		if (!action || saving) return;
		setSaving(true);
		try {
			setSettings(await action(enabled));
		} catch {
			toast.error(t("captions.speakerSettingsFailed"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogTitle>{t("captions.transcriptionDefaults")}</DialogTitle>
				<DialogDescription>{t("captions.transcriptionDefaultsHint")}</DialogDescription>
				<label className={styles.speakerDefaultRow}>
					<input
						type="checkbox"
						checked={settings?.enabled ?? true}
						disabled={!settings || saving}
						onChange={(event) => void save(event.currentTarget.checked)}
					/>
					{t("captions.speakerDefault")}
				</label>
				{settings?.available === false && <p>{t("captions.speakerRuntimeMissing")}</p>}
			</DialogContent>
		</Dialog>
	);
}
