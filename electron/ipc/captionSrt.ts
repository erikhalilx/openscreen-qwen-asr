import fs from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { mainT } from "../i18n";
import { showSaveDialogOver } from "../messageBox";

/** The renderer supplies text, never an output path. Only the native save dialog
 * decides the destination, including the OS's normal overwrite confirmation. */
export function registerCaptionSrtHandler() {
	ipcMain.handle("save-caption-srt", async (event, fileName: unknown, contents: unknown) => {
		if (
			typeof fileName !== "string" ||
			fileName !== path.basename(fileName) ||
			!fileName.toLowerCase().endsWith(".srt") ||
			typeof contents !== "string" ||
			!contents.trim()
		) {
			return { success: false };
		}
		try {
			const result = await showSaveDialogOver(BrowserWindow.fromWebContents(event.sender), {
				title: mainT("dialogs", "fileDialogs.saveSrt"),
				defaultPath: path.join(app.getPath("downloads"), fileName),
				filters: [{ name: "SubRip (.srt)", extensions: ["srt"] }],
				properties: ["createDirectory", "showOverwriteConfirmation"],
			});
			if (result.canceled || !result.filePath) return { success: false, canceled: true };
			// If the user explicitly changes the extension, don't silently write subtitle
			// text over an unrelated file type.
			if (!result.filePath.toLowerCase().endsWith(".srt")) return { success: false };
			await fs.writeFile(result.filePath, contents, "utf8");
			return { success: true };
		} catch {
			return { success: false };
		}
	});
}
