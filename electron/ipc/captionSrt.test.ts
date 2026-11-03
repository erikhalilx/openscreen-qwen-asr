import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCaptionSrtHandler } from "./captionSrt";

const mocks = vi.hoisted(() => ({ handle: vi.fn(), getPath: vi.fn(), save: vi.fn(), parent: {} }));
vi.mock("electron", () => ({
	app: { getPath: mocks.getPath },
	ipcMain: { handle: mocks.handle },
	BrowserWindow: { fromWebContents: () => mocks.parent },
}));
vi.mock("../messageBox", () => ({ showSaveDialogOver: mocks.save }));

let directory: string;
let save: (
	event: IpcMainInvokeEvent,
	name: unknown,
	text: unknown,
) => Promise<{ success: boolean; canceled?: boolean }>;
const event = { sender: {} } as IpcMainInvokeEvent;
beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "openscreen-srt-"));
	vi.clearAllMocks();
	mocks.getPath.mockReturnValue(directory);
	registerCaptionSrtHandler();
	save = mocks.handle.mock.calls[0][1];
});
afterEach(async () => fs.rm(directory, { recursive: true, force: true }));

describe("native SRT save", () => {
	it("writes UTF-8 only to the dialog-selected destination with overwrite confirmation", async () => {
		const destination = path.join(directory, "字幕-system.srt");
		const contents = "1\r\n00:00:01,000 --> 00:00:02,000\r\n系统字幕。\r\n\r\n";
		mocks.save.mockResolvedValue({ filePath: destination, canceled: false });
		expect(await save(event, "suggested-system.srt", contents)).toEqual({ success: true });
		expect(await fs.readFile(destination, "utf8")).toBe(contents);
		expect(mocks.save).toHaveBeenCalledWith(
			mocks.parent,
			expect.objectContaining({
				filters: [{ name: "SubRip (.srt)", extensions: ["srt"] }],
				properties: ["createDirectory", "showOverwriteConfirmation"],
			}),
		);
	});
	it("cancels without creating a file", async () => {
		mocks.save.mockResolvedValue({ canceled: true });
		expect(await save(event, "captions.srt", "字幕")).toEqual({ success: false, canceled: true });
		expect(await fs.readdir(directory)).toEqual([]);
	});
	it.each([
		"../captions.srt",
		"/tmp/captions.srt",
		"captions.mp4",
		null,
	])("rejects an invalid suggested filename %s before opening the dialog", async (name) => {
		expect(await save(event, name, "字幕")).toEqual({ success: false });
		expect(mocks.save).not.toHaveBeenCalled();
	});
	it("does not overwrite a non-SRT destination or write empty/invalid content", async () => {
		const destination = path.join(directory, "video.mp4");
		await fs.writeFile(destination, "video");
		mocks.save.mockResolvedValue({ canceled: false, filePath: destination });
		expect(await save(event, "captions.srt", "字幕")).toEqual({ success: false });
		expect(await fs.readFile(destination, "utf8")).toBe("video");
		mocks.save.mockClear();
		for (const text of ["", null, 1])
			expect(await save(event, "captions.srt", text)).toEqual({ success: false });
		expect(mocks.save).not.toHaveBeenCalled();
	});
	it("reports a write failure and permits retry", async () => {
		mocks.save.mockResolvedValue({
			filePath: path.join(directory, "missing", "captions.srt"),
			canceled: false,
		});
		expect(await save(event, "captions.srt", "字幕")).toEqual({ success: false });
		mocks.save.mockResolvedValue({
			filePath: path.join(directory, "captions.srt"),
			canceled: false,
		});
		expect(await save(event, "captions.srt", "字幕")).toEqual({ success: true });
	});
});
