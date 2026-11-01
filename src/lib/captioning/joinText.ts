const CJK_EDGE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const CLOSING_PUNCTUATION = /^[,.;:!?%。，、；：！？…）)\]}>》」』】〕]/u;
const TRAILING_CLOSING_PUNCTUATION = /[,.;:!?%。，、；：！？…）)\]}>》」』】〕]+$/u;
const OPENING_PUNCTUATION = /[([<{《「『【〔（]$/u;

// The CJK-compaction rule is deliberately LANGUAGE-AGNOSTIC: two adjacent Han /
// Hiragana / Katakana characters never carry a space between them in any script
// that uses them. Gating it on the `language` tag would corrupt transcripts whose
// stored tag is "auto" (a real persisted value — see transcribe.ts's language
// fallback) or "yue": the join would inject ASCII spaces between Chinese runs.
export function joinTranscriptText(texts: string[]): string {
	const tokens = texts.map((text) => text.trim()).filter((text) => text.length > 0);
	return tokens.reduce((joined, token) => {
		if (joined.length === 0) return token;
		if (CLOSING_PUNCTUATION.test(token) || OPENING_PUNCTUATION.test(joined)) {
			return joined + token;
		}
		const leftContentEdge = [...joined.replace(TRAILING_CLOSING_PUNCTUATION, "")].at(-1) ?? "";
		// Spread reads the edges by CODE POINT: `.at(-1)` / `[0]` would return half a
		// surrogate pair, so a non-BMP Han edge (e.g. U+20000) would miss CJK_EDGE
		// and receive an ASCII space.
		if (CJK_EDGE.test(leftContentEdge) && CJK_EDGE.test([...token][0] ?? "")) {
			return joined + token;
		}
		return `${joined} ${token}`;
	}, "");
}
