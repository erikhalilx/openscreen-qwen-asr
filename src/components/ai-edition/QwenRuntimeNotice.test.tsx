// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { QwenRuntimeNotice } from "./QwenRuntimeNotice";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it("lets a user with missing components save the installer", async () => {
	const saveQwenInstaller = vi.fn(async () => true);
	vi.stubGlobal("electronAPI", {
		stt: { qwenRuntimeSetup: async () => ({ kind: "missing" }), saveQwenInstaller },
	});
	render(
		<I18nProvider>
			<QwenRuntimeNotice />
		</I18nProvider>,
	);
	const button = await screen.findByRole("button", { name: "Save installer script" });
	expect(screen.getByText(/Double-click the saved/)).toBeTruthy();
	expect(screen.getByText(/Quit OpenScreen Qwen with Cmd\+Q/)).toBeTruthy();
	expect(saveQwenInstaller).not.toHaveBeenCalled();
	fireEvent.click(button);
	await waitFor(() => expect(saveQwenInstaller).toHaveBeenCalledOnce());
});

it("does not prompt a user with a ready runtime", async () => {
	const qwenRuntimeSetup = vi.fn(async () => ({ kind: "ready" }));
	vi.stubGlobal("electronAPI", { stt: { qwenRuntimeSetup } });
	const { container } = render(
		<I18nProvider>
			<QwenRuntimeNotice />
		</I18nProvider>,
	);
	await waitFor(() => expect(qwenRuntimeSetup).toHaveBeenCalledOnce());
	expect(container.textContent).toBe("");
});
