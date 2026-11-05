import { expect, it } from "vitest";
import { cameraLayoutJoins } from "./camera-layout-joins";

it("marks both ends of each shared boundary, independent of layout properties and input order", () => {
	const joined = cameraLayoutJoins([
		{ id: "c", start: 4, end: 6 },
		{ id: "a", start: 0, end: 2 },
		{ id: "b", start: 2, end: 4 },
	]);
	expect(joined.get("a")).toEqual({ start: false, end: true });
	expect(joined.get("b")).toEqual({ start: true, end: true });
	expect(joined.get("c")).toEqual({ start: true, end: false });
});
it("does not mark gaps, overlaps or an isolated segment", () => {
	const joined = cameraLayoutJoins([
		{ id: "a", start: 0, end: 2 },
		{ id: "b", start: 2.001, end: 4 },
		{ id: "c", start: 3.9, end: 6 },
	]);
	for (const value of joined.values()) expect(value).toEqual({ start: false, end: false });
});
it("updates join state as live drag boundaries cross the persisted millisecond", () => {
	const a = { id: "a", start: 0, end: 2 };
	expect(cameraLayoutJoins([a, { id: "b", start: 2.0003, end: 4 }]).get("a")?.end).toBe(true);
	expect(cameraLayoutJoins([a, { id: "b", start: 2.001, end: 4 }]).get("a")?.end).toBe(false);
});
