// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReplaceSpeakerDialog } from "./ReplaceSpeakerDialog";

vi.mock("@/contexts/I18nContext", () => ({ useScopedT: () => (key: string) => key }));
vi.mock("@/lib/ai-edition/store/projectStore", () => ({ useProjectStore: {} }));

afterEach(cleanup);

it("keeps each replacement draft with its selected speaker", () => {
	render(
		<ReplaceSpeakerDialog
			cues={["A", "B"].map((speakerLabel) => ({
				id: speakerLabel,
				startMs: 0,
				endMs: 1000,
				text: "Caption",
				speakerLabel,
			}))}
		/>,
	);
	fireEvent.click(screen.getByText("captions.replaceSpeaker"));
	fireEvent.click(screen.getByRole("button", { name: "A (1)" }));
	const input = screen.getByRole<HTMLInputElement>("textbox");
	fireEvent.change(input, { target: { value: "Alice" } });
	fireEvent.click(screen.getByRole("button", { name: "B (1)" }));
	expect(input.value).toBe("");
	fireEvent.change(input, { target: { value: "Bob" } });
	fireEvent.click(screen.getByRole("button", { name: "A (1)" }));
	expect(input.value).toBe("Alice");
});
