"""Audit and recover decoder output from the pinned MLX runtime."""
from dataclasses import dataclass
from hashlib import sha256
from importlib import import_module
from importlib.metadata import version
from pathlib import Path
import unicodedata


SAMPLE_RATE = 16_000
SOURCE_HASHES = {
    "generate": "b317a31ed9312f469c2883eaf1810c61b9a08d47332450d21afd24853909d016",
    "transcribe": "5468f0c1dcf9bb4c5055f4a88c964e4872a18d572cd80f8740b4dbb88bb93162",
    "tokenizer": "68ff4e357a7142fc47343f488fef392b796eb5017fe7b07742959effc9fd31fa",
}


class IncompleteChunk(ValueError):
    def __init__(self, offset, duration, reason):
        super().__init__(
            f"Qwen could not complete transcription at {offset:.3f}–{offset + duration:.3f}s ({reason})"
        )


@dataclass(frozen=True)
class Candidate:
    text: str
    language: str
    rejection: str | None = None


def lexical_text(text):
    return "".join(c.casefold() for c in text if unicodedata.category(c)[0] in ("L", "N"))


class Decoder:
    """Only the isolated, single-job worker uses these process-local hooks."""

    def __init__(self):
        for name, expected in (("mlx-qwen3-asr", "0.4.4"), ("mlx", "0.32.2")):
            if version(name) != expected:
                raise RuntimeError(f"Qwen recovery requires {name} {expected}")
        modules = {}
        for name, expected in SOURCE_HASHES.items():
            module = import_module(f"mlx_qwen3_asr.{name}")
            if sha256(Path(module.__file__).read_bytes()).hexdigest() != expected:
                raise RuntimeError(f"Qwen recovery encountered an unreviewed {name} module")
            modules[name] = module
        self.generator = modules["generate"]
        self.pipeline = modules["transcribe"]
        self.tokenizer = modules["tokenizer"]
        self.generate = self.generator.generate_with_info
        self.detect_repetition = self.generator._detect_repetition
        self.cleanup = self.tokenizer._detect_and_fix_repetitions
        if (self.pipeline.generate is not self.generate
                or self.pipeline.parse_asr_output is not self.tokenizer.parse_asr_output
                or self.generate.__globals__.get("_detect_repetition") is not self.detect_repetition):
            raise RuntimeError("Qwen recovery found incompatible decoder bindings")

    def relaxed_repetition(self, tokens):
        if len(tokens) >= 20 and len(set(tokens[-20:])) == 1:
            return True
        return self.detect_repetition(tokens, threshold=60)

    def decode(self, session, audio, language, prompt, relaxed):
        generations = []

        def capture(*args, **kwargs):
            generation = self.generate(*args, **kwargs)
            generations.append(generation)
            return generation

        try:
            self.pipeline.generate = capture
            if relaxed:
                self.generator._detect_repetition = self.relaxed_repetition
            # Both attempts use the pinned library's duration-based token budget.
            result = session.transcribe((audio, SAMPLE_RATE), language=language,
                                        context=prompt, return_timestamps=False)
            if len(generations) != 1 or not isinstance(generations[0], self.generator.GenerationResult):
                raise RuntimeError("Qwen recovery expected one decoder window with native metadata")
            generation = generations[0]
            reason = generation.finish_reason
            if (reason not in ("eos", "repetition", "length")
                    or result.finish_reason != reason or result.truncated != (reason == "length")
                    or generation.generated_tokens != len(generation.tokens)
                    or (len(generation.tokens) >= generation.max_new_tokens) != (reason == "length")):
                raise RuntimeError("Qwen recovery found inconsistent decoder metadata")
            if reason != "eos":
                return Candidate(result.text, result.language, reason)

            # Preserve the parser's language and special-token handling, but audit its repeat cleanup.
            raw = session.tokenizer.decode(generation.tokens)
            self.tokenizer._detect_and_fix_repetitions = lambda text: text
            _, body = self.tokenizer.parse_asr_output(raw, user_language=language)
            if lexical_text(body) != lexical_text(result.text):
                return Candidate(result.text, result.language, "decoder cleanup removed text")
            if self.relaxed_repetition(generation.tokens):
                return Candidate(result.text, result.language, "repeated decoder tail")
            return Candidate(result.text, result.language)
        finally:
            self.pipeline.generate = self.generate
            self.generator._detect_repetition = self.detect_repetition
            self.tokenizer._detect_and_fix_repetitions = self.cleanup


def quiet_split(audio):
    """Choose a quiet point near the middle, with at least 2.5s on each side."""
    length = len(audio)
    low = max(40000, (35 * length + 99) // 100)
    high = min(length - 40000, 65 * length // 100)
    if low > high:
        return None

    def cost(pos):
        energy = sum(float(sample) ** 2 for sample in audio[pos - 800:pos + 800])
        return energy, abs(2 * pos - length)

    return min([*range(low, high, 1600), high], key=cost)


def recover_chunk(audio, offset, decode):
    """Try one relaxed decode after repetition, then at most two levels of splits."""
    def recover(part, start, depth):
        candidate = decode(part, False)
        reason = candidate.rejection
        if reason == "repetition":
            candidate = decode(part, True)
            reason = candidate.rejection
            if reason is None and not candidate.text.strip():
                reason = "empty retry"
        if reason is None:
            return [(part, start, candidate)]
        split = quiet_split(part) if depth < 2 else None
        if split is None:
            raise IncompleteChunk(start, len(part) / SAMPLE_RATE, reason)
        recovered = (recover(part[:split], start, depth + 1)
                     + recover(part[split:], start + split / SAMPLE_RATE, depth + 1))
        if not any(value.text.strip() for _, _, value in recovered):
            raise IncompleteChunk(start, len(part) / SAMPLE_RATE, "empty split recovery")
        return recovered

    return recover(audio, offset, 0)
