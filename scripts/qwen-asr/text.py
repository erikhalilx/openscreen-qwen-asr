"""Preserve ASR punctuation while using the aligner's real lexical timings."""
import math
import unicodedata


LANGUAGES = {
    "zh": "Chinese", "en": "English", "yue": "Cantonese", "fr": "French",
    "de": "German", "it": "Italian", "ja": "Japanese", "ko": "Korean",
    "pt": "Portuguese", "ru": "Russian", "es": "Spanish",
}


def lexical_chars(text):
    return [(i, c) for i, c in enumerate(text)
            if c == "'" or unicodedata.category(c).startswith(("L", "N"))]


def restore_words(text, segments, offset, duration):
    """Attach original punctuation without inventing or evenly spreading timestamps."""
    chars = lexical_chars(text)
    cursor = 0
    words = []
    previous = 0.0
    for seg in segments:
        count = len(lexical_chars(seg["text"]))
        selected = chars[cursor:cursor + count]
        if not selected or "".join(c for _, c in selected).casefold() != seg["text"].casefold():
            raise ValueError("Qwen alignment does not cover the original transcript")
        start, end = float(seg["start"]), float(seg["end"])
        if not all(map(math.isfinite, (start, end))) or start < -0.05 or end > duration + 0.1:
            raise ValueError("Qwen alignment is outside the audio")
        start, end = max(0.0, start), min(duration, end)
        if end < start or start < previous:
            raise ValueError("Qwen alignment has inverted or unordered timestamps")
        left = 0 if cursor == 0 else selected[0][0]
        cursor += count
        right = chars[cursor][0] if cursor < len(chars) else len(text)
        words.append({"word": text[left:right].strip(), "startSec": start + offset,
                      "endSec": end + offset})
        previous = start
    if cursor != len(chars):
        raise ValueError("Qwen alignment is missing transcript words")
    return words


def phrases_from_words(words):
    phrases, current = [], []
    for word in words:
        if current and word["startSec"] - current[-1]["endSec"] >= 0.4:
            phrases.append(current)
            current = []
        current.append(word)
        if word["word"].endswith(tuple("。！？.!?")):
            phrases.append(current)
            current = []
    if current:
        phrases.append(current)
    def is_cjk(char):
        return bool(char) and (0x3400 <= ord(char) <= 0x9FFF or 0x3040 <= ord(char) <= 0x30FF
                               or 0x20000 <= ord(char) <= 0x3134F)
    def join(items):
        out = ""
        closing = ",.;:!?%。，、；：！？…）)]}>》」』】〕”’"
        opening = "([{<《「『【〔（“‘"
        for item in items:
            token = item["word"]
            edge = out.rstrip(closing)
            compact = (out and (token[0] in closing or out[-1] in opening
                       or (edge and is_cjk(edge[-1]) and is_cjk(token[0]))))
            out += ("" if not out or compact else " ") + token
        return out
    return [{"text": join(p), "startSec": p[0]["startSec"], "endSec": p[-1]["endSec"]}
            for p in phrases]
