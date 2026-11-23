"""Versioned, local transcription and speaker attribution for Apple Silicon apps."""

import argparse
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile

# Kept alongside the installed runtime, or live in the source tree during development.

HERE = Path(__file__).resolve().parent
QWEN = (HERE / "qwen-asr") if (HERE / "qwen-asr").is_dir() else HERE.parent / "qwen-asr"
sys.path.insert(0, str(QWEN))
from text import phrases_from_words


def attribute(words, turns):
    """Assign a word only if one speaker clearly covers its original time span."""
    turns = sorted(turns, key=lambda turn: (turn["startSec"], turn["endSec"], turn["speakerId"]))
    names = {}
    for turn in turns:
        start, end = turn["startSec"], turn["endSec"]
        if not math.isfinite(start) or not math.isfinite(end) or not 0 <= start < end:
            raise ValueError("Invalid speaker turn")
        raw = turn["speakerId"]
        turn["speakerId"] = names.setdefault(raw, f"speaker-{len(names) + 1}")

    active = []
    cursor = 0
    previous = 0
    attributed = []
    for word in words:
        start, end = word["startSec"], word["endSec"]
        if not math.isfinite(start) or not math.isfinite(end) or not 0 <= previous <= start <= end:
            raise ValueError("Invalid aligned word timestamps")
        previous = start
        active = [turn for turn in active if turn["endSec"] > start]
        while cursor < len(turns) and turns[cursor]["startSec"] <= end:
            if turns[cursor]["endSec"] > start:
                active.append(turns[cursor])
            cursor += 1
        overlaps = {}
        for turn in active:
            overlap = min(end, turn["endSec"]) - max(start, turn["startSec"])
            if overlap > 0:
                speaker = turn["speakerId"]
                overlaps[speaker] = overlaps.get(speaker, 0) + overlap
        ranked = sorted(overlaps.items(), key=lambda pair: -pair[1])
        speaker = None
        if start == end:
            at_point = {turn["speakerId"] for turn in active
                        if turn["startSec"] <= start < turn["endSec"]}
            if len(at_point) == 1:
                speaker = next(iter(at_point))
        elif ranked:
            best, duration = ranked[0]
            second = ranked[1][1] if len(ranked) > 1 else 0
            if duration >= (end - start) * 0.5 and duration - second >= (end - start) * 0.2:
                speaker = best
        attributed.append({**word, "speakerId": speaker})

    return {
        "version": 1,
        "engine": "fluidaudio-community-1",
        "speakers": [{"id": value} for value in names.values()],
        "speakerTurns": turns,
        "wordSegments": attributed,
        "speakerSegments": phrases_from_words(attributed),
    }


def assign_file(wav, words, speakers=None):
    if not words:
        return attribute([], [])
    command = [str(HERE / "LocalDiarizer"), str(wav)]
    if speakers is not None:
        command.append(str(speakers))
    result = subprocess.run(command, stdout=subprocess.PIPE, text=True, check=True)
    return attribute(words, json.loads(result.stdout.splitlines()[-1]))


def transcribe(media, config, language, speakers):
    values = json.loads(config.read_text())
    with tempfile.TemporaryDirectory(prefix="local-transcription-") as tmp:
        wav = Path(tmp) / "audio.wav"
        subprocess.run(
            ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(media),
             "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(wav)],
            check=True,
        )
        request = {"version": 1, "wavPath": str(wav), "language": language,
                   **{key: values[key] for key in ("model", "aligner", "vad")}}
        result = subprocess.run(
            [values["python"], "-I", str(QWEN / "worker.py")],
            input=json.dumps(request), stdout=subprocess.PIPE, text=True, check=True,
        )
        recognized = next(event["result"] for event in map(json.loads, result.stdout.splitlines())
                          if event["type"] == "result")
        return {**recognized, **assign_file(wav, recognized["wordSegments"], speakers)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    enroll = sub.add_parser("attribute", help="Read aligned word JSON from stdin and attribute it")
    enroll.add_argument("wav", type=Path)
    complete = sub.add_parser("transcribe", help="Transcribe media and attribute words locally")
    complete.add_argument("media", type=Path)
    complete.add_argument("--language", default="auto")
    complete.add_argument("--config", type=Path, default=HERE / "qwen.local.json")
    for command in (enroll, complete):
        command.add_argument("--speakers", type=int, help="Known number of speakers for this file")
    args = parser.parse_args()
    if args.speakers is not None and args.speakers < 1:
        parser.error("--speakers must be a positive integer")
    if args.command == "attribute":
        request = json.load(sys.stdin)
        if request.get("version") != 1:
            raise ValueError("Unsupported attribution protocol version")
        result = assign_file(args.wav, request["wordSegments"], args.speakers)
    else:
        result = transcribe(args.media, args.config.expanduser(), args.language, args.speakers)
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
