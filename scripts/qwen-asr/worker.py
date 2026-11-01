"""One job per process; stdin/stdout are a versioned NDJSON protocol, no network."""
import contextlib
import json
import os
from pathlib import Path
import sys
import time
import traceback
import wave

sys.path.insert(0, str(Path(__file__).resolve().parent))
from text import LANGUAGES, phrases_from_words, restore_words

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"


def emit(kind, **values):
    print(json.dumps({"version": 1, "type": kind, **values}, ensure_ascii=False), flush=True)


def run(request):
    import numpy as np
    import mlx.core as mx
    from mlx_qwen3_asr import Session
    from mlx_qwen3_asr.chunking import split_audio_into_chunks
    from mlx_qwen3_asr.forced_aligner import ForcedAligner
    from vad import speech_spans

    if request.get("version") != 1:
        raise ValueError("Unsupported Qwen worker protocol")
    language = request.get("language")
    if language and language != "auto" and language not in LANGUAGES:
        raise ValueError(f"Qwen word alignment does not support language: {language}")
    for field in ("model", "aligner"):
        directory = Path(request[field])
        if not (directory / "config.json").is_file() or not list(directory.glob("*.safetensors")):
            raise ValueError(f"Missing local Qwen {field}: {directory}")
    with wave.open(request["wavPath"], "rb") as wav:
        if (wav.getnchannels(), wav.getframerate(), wav.getsampwidth()) != (1, 16000, 2):
            raise ValueError("Expected 16 kHz mono PCM16 WAV")
        audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32) / 32768
    duration = len(audio) / 16000
    started = time.perf_counter()
    emit("progress", phase="model", completedSec=0, totalSec=duration)
    # Budget is a per-process allocation ceiling, not a reservation against other apps.
    mx.set_memory_limit(int(request.get("memoryLimitBytes", 6 * 1024**3)))
    mx.set_cache_limit(256 * 1024**2)
    spans = speech_spans(audio, request["vad"])
    words = []
    detected = language if language in LANGUAGES else None
    if spans:
        session = Session(request["model"])
        aligner = ForcedAligner(request["aligner"])
        emit("ready")
        for left, right in spans:
            for chunk, chunk_offset in split_audio_into_chunks(audio[left:right]):
                offset = left / 16000 + chunk_offset
                result = session.transcribe((chunk, 16000), language=LANGUAGES.get(detected),
                                            context=request.get("prompt") or "",
                                            return_timestamps=False)
                if result.truncated or result.finish_reason == "length":
                    raise ValueError(f"Qwen truncated the transcript at {offset:.2f}s")
                code = next((k for k, v in LANGUAGES.items() if v.lower() == result.language.lower()), None)
                if result.text.strip() and code is None:
                    raise ValueError(f"Qwen word alignment does not support detected language: {result.language}")
                if result.text.strip():
                    detected = detected or code
                    aligned = aligner.align(chunk, result.text, result.language)
                    segments = [{"text": w.text, "start": w.start_time, "end": w.end_time} for w in aligned]
                    words.extend(restore_words(result.text, segments, offset, len(chunk) / 16000))
                elapsed = time.perf_counter() - started
                emit("progress", phase="transcribe", completedSec=offset + len(chunk) / 16000,
                     totalSec=duration, backend="qwen-mlx", rtf=elapsed / max(offset + len(chunk) / 16000, 0.001))
                mx.clear_cache()
    elapsed = time.perf_counter() - started
    emit("result", result={"segments": phrases_from_words(words), "wordSegments": words,
                           "detectedLanguage": detected or "auto", "backend": "qwen-mlx",
                           "timing": {"elapsedSec": elapsed, "audioSec": duration,
                                      "rtf": elapsed / duration if duration else 0}})


if __name__ == "__main__":
    try:
        request = json.loads(sys.stdin.readline())
        # Third-party progress and diagnostic prints never enter the protocol channel.
        protocol_stdout = sys.stdout
        original_emit = emit
        def emit(kind, **values):
            with contextlib.redirect_stdout(protocol_stdout):
                original_emit(kind, **values)
        with contextlib.redirect_stdout(sys.stderr):
            run(request)
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        emit("error", message=str(exc))
        sys.exit(1)
