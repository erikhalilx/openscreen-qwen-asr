import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useScopedT } from "@/contexts/I18nContext";
import type { QwenRuntimeSetup } from "../../../electron/stt/transcriptionContract";
import styles from "./NewEditorShell.module.css";

export function QwenRuntimeNotice() {
	const t = useScopedT("settings");
	const [setup, setSetup] = useState<QwenRuntimeSetup | { kind: "unavailable" }>();
	useEffect(() => {
		let active = true;
		void window.electronAPI?.stt?.qwenRuntimeSetup?.().then(
			(result) => {
				if (active) setSetup(result);
			},
			() => {
				if (active) setSetup({ kind: "unavailable" });
			},
		);
		return () => {
			active = false;
		};
	}, []);

	if (!setup || setup.kind === "ready") return null;
	if (setup.kind !== "missing") {
		return (
			<div className={styles.qwenRuntimeNotice} role="status">
				<p className={styles.hint}>{t(`qwenRuntime.${setup.kind}`)}</p>
			</div>
		);
	}
	const save = async () => {
		try {
			const saveInstaller = window.electronAPI?.stt?.saveQwenInstaller;
			if (!saveInstaller) throw new Error("Installer unavailable");
			if (await saveInstaller()) toast.success(t("qwenRuntime.saved"));
		} catch {
			toast.error(t("qwenRuntime.saveFailed"));
		}
	};
	return (
		<section className={styles.qwenRuntimeNotice} aria-label={t("qwenRuntime.title")}>
			<strong>{t("qwenRuntime.title")}</strong>
			<p className={styles.hint}>{t("qwenRuntime.requirements")}</p>
			<button type="button" className={styles.paneButton} onClick={() => void save()}>
				<Download size={14} aria-hidden="true" />
				{t("qwenRuntime.save")}
			</button>
			<ol className={styles.hint}>
				<li>{t("qwenRuntime.run")}</li>
				<li>{t("qwenRuntime.restart")}</li>
			</ol>
		</section>
	);
}
