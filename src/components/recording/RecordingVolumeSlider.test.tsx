// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RecordingVolumeSlider } from "./RecordingVolumeSlider";

it("labels the source, displays percent and emits linear recording gain", () => {
	const change = vi.fn();
	const { rerender } = render(
		<RecordingVolumeSlider label="System audio" value={1} onChange={change} />,
	);
	const slider = screen.getByRole("slider", { name: "System audio" });
	fireEvent.change(slider, { target: { value: "45" } });
	expect(change).toHaveBeenCalledWith(0.45);
	rerender(<RecordingVolumeSlider label="System audio" value={0.45} disabled onChange={change} />);
	expect(slider).toBeDisabled();
	expect(slider).toHaveAttribute("aria-valuetext", "45%");
});
