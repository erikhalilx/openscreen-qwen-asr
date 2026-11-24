import fs from "node:fs/promises";
import path from "node:path";
import type { AxcutDocument } from "../../src/lib/ai-edition/schema";

const RECORDING_FILE =
	/^(recording-\d+)(?:\.(?:mp4|webm)(?:\.cursor\.json)?|\.session\.json|-webcam\.(?:mp4|webm)|-(?:system|microphone)\.m4a)$/;
const SCREEN_FILE = /^recording-\d+\.(?:mp4|webm)$/;

/** One take: the screen video and every file recorded beside it (cursor, session, camera). */
export interface RecordingSet {
	dir: string;
	stem: string;
	files: string[];
	sizeBytes: number;
}

export interface ProjectRecordings {
	owned: RecordingSet[];
	/** Titles of the other projects that use some of this project's recordings. */
	keptFor: string[];
	/**
	 * Project files that did not parse. Any of them may use these recordings, so while there
	 * are some the project owns none: its recordings are all kept.
	 */
	unreadable: number;
}

function documentMediaPaths(doc: AxcutDocument): string[] {
	return doc.assets.flatMap((asset) =>
		[asset.originalPath, asset.proxyPath, asset.waveformPath, asset.cameraTrack?.sourcePath].filter(
			(p): p is string => typeof p === "string" && p.length > 0,
		),
	);
}

function recordingKey(canonicalPath: string, recordingsDirs: ReadonlySet<string>): string | null {
	const dir = path.dirname(canonicalPath);
	const stem = RECORDING_FILE.exec(path.basename(canonicalPath))?.[1];
	return stem && recordingsDirs.has(dir) ? path.join(dir, stem) : null;
}

async function readRecordingSet(key: string): Promise<RecordingSet | null> {
	const dir = path.dirname(key);
	const stem = path.basename(key);
	let names: string[];
	try {
		names = await fs.readdir(dir);
	} catch {
		return null;
	}
	const files: string[] = [];
	let sizeBytes = 0;
	for (const name of names) {
		if (RECORDING_FILE.exec(name)?.[1] !== stem) continue;
		const filePath = path.join(dir, name);
		try {
			const stat = await fs.lstat(filePath);
			if (!stat.isFile()) return null;
			files.push(filePath);
			sizeBytes += stat.size;
		} catch {
			// Gone between the listing and the stat: nothing left to delete.
		}
	}
	return files.length > 0 ? { dir, stem, files, sizeBytes } : null;
}

/**
 * The recordings `projectId` owns: takes in one of OpenScreen's recordings folders that no
 * other project uses. A video imported from anywhere else is never the project's to delete.
 */
export async function findProjectRecordings(
	projectId: string,
	projects: { documents: readonly AxcutDocument[]; unreadable: readonly string[] },
	recordingsDirs: readonly string[],
): Promise<ProjectRecordings> {
	const { documents } = projects;
	const target = documents.find((doc) => doc.project.id === projectId);
	if (!target) return { owned: [], keptFor: [], unreadable: 0 };

	const canonicalDirs = new Set<string>();
	for (const dir of recordingsDirs) {
		const stat = await fs.lstat(dir).catch(() => null);
		if (stat?.isDirectory()) canonicalDirs.add(await fs.realpath(dir));
	}
	const keys = new Set<string>();
	for (const video of documentMediaPaths(target)) {
		if (!SCREEN_FILE.test(path.basename(video))) continue;
		const stat = await fs.lstat(video).catch(() => null);
		if (!stat?.isFile()) continue;
		const canonical = await fs.realpath(video);
		if (!recordingsDirs.some((dir) => path.resolve(dir) === path.dirname(path.resolve(video))))
			continue;
		const key = recordingKey(canonical, canonicalDirs);
		if (key) keys.add(key);
	}
	if (keys.size > 0 && projects.unreadable.length > 0) {
		return { owned: [], keptFor: [], unreadable: projects.unreadable.length };
	}
	const keptFor = new Set<string>();
	for (const doc of documents) {
		if (doc.project.id === projectId) continue;
		for (const mediaPath of documentMediaPaths(doc)) {
			const canonical = await fs.realpath(mediaPath).catch(() => null);
			if (!canonical) continue;
			const key = recordingKey(canonical, canonicalDirs);
			if (key && keys.has(key)) {
				keys.delete(key);
				keptFor.add(doc.project.title);
			}
		}
	}

	const owned: RecordingSet[] = [];
	for (const key of keys) {
		const set = await readRecordingSet(key);
		if (set) owned.push(set);
	}
	return { owned, keptFor: [...keptFor], unreadable: 0 };
}

/** Stops on the first refusal. Files already moved remain recoverable in the Trash. */
export async function removeRecordingSets(
	sets: readonly RecordingSet[],
	trashItem: (filePath: string) => Promise<void>,
): Promise<void> {
	let moved = 0;
	for (const set of sets) {
		// Move the screen file last so a retry still has the primary file to identify the take.
		for (const filePath of [...set.files].sort(
			(a, b) =>
				Number(SCREEN_FILE.test(path.basename(a))) - Number(SCREEN_FILE.test(path.basename(b))),
		)) {
			try {
				if ((await fs.realpath(filePath)) !== filePath || !(await fs.lstat(filePath)).isFile()) {
					throw new Error("A recording file changed during deletion.");
				}
				await trashItem(filePath);
				moved++;
			} catch {
				throw new Error(
					`Could not move the complete take to the Trash. Files already moved: ${moved}.`,
				);
			}
		}
	}
}
