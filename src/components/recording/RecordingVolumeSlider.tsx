import { type CSSProperties, useId } from "react";
import styles from "./RecordingVolumeSlider.module.css";

/** Shared pre-flight control: persisted capture gain, not the OS output volume. */
export function RecordingVolumeSlider({
	label,
	value,
	disabled,
	onChange,
	surface = "editor",
}: {
	label: string;
	value: number;
	disabled?: boolean;
	onChange: (value: number) => void;
	surface?: "hud" | "editor";
}) {
	const id = useId();
	return (
		<div className={styles.control} data-surface={surface} style={{ opacity: disabled ? 0.5 : 1 }}>
			<div className={styles.heading}>
				<label htmlFor={id}>{label}</label>
				<output htmlFor={id} style={{ fontVariantNumeric: "tabular-nums" }}>
					{Math.round(value * 100)}%
				</output>
			</div>
			<input
				className={styles.range}
				id={id}
				type="range"
				min={0}
				max={200}
				step={1}
				value={Math.round(value * 100)}
				disabled={disabled}
				aria-valuetext={`${Math.round(value * 100)}%`}
				style={{ "--recording-volume-pct": `${value * 50}%` } as CSSProperties}
				onChange={(event) => onChange(Number(event.target.value) / 100)}
			/>
		</div>
	);
}
