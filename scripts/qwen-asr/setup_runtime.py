"""Install an isolated runtime and verified public models outside the application bundle."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
MANIFEST = ROOT / "models/manifest.json"


def sha256(file):
    digest = hashlib.sha256()
    with Path(file).open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_files(directory, spec, external=False):
    """External models are read-only; unrelated files and optional model cards are ignored."""
    directory = Path(directory)
    for name, info in spec["files"].items():
        if external and not info["required"]:
            continue
        file = directory / name
        if not file.is_file() or file.stat().st_size != info["bytes"] or sha256(file) != info["sha256"]:
            raise ValueError(f"Model verification failed: {spec['repo']} / {name}")
    return directory.resolve()


def download_model(directory, spec):
    from huggingface_hub import hf_hub_download
    directory.mkdir(parents=True, exist_ok=True)
    for name, info in spec["files"].items():
        file = directory / name
        if file.is_file() and file.stat().st_size == info["bytes"] and sha256(file) == info["sha256"]:
            continue
        if spec["repo"].startswith("Qwen/"):
            hf_hub_download(spec["repo"], name, revision=spec["revision"],
                            local_dir=directory, token=False, force_download=file.exists())
        else:
            temporary = file.with_suffix(".partial")
            try:
                with urlopen(info["url"], timeout=60) as response, temporary.open("wb") as output:
                    shutil.copyfileobj(response, output)
                if sha256(temporary) != info["sha256"]:
                    raise ValueError("VAD download checksum mismatch")
                temporary.replace(file)
            finally:
                temporary.unlink(missing_ok=True)
    return verify_files(directory, spec)


def write_config(file, values):
    """Publish a private config only after every dependency has passed verification."""
    file.parent.mkdir(parents=True, exist_ok=True)
    temporary = file.with_suffix(".partial")
    with temporary.open("w", encoding="utf-8") as stream:
        os.chmod(temporary, 0o600)
        json.dump(values, stream, indent=2)
        stream.write("\n")
    temporary.replace(file)


def collect_licenses(output):
    import importlib.metadata as metadata
    sections = []
    for line in (HERE / "requirements.lock.txt").read_text().splitlines():
        if "==" not in line or line.startswith("#"):
            continue
        name, version = line.split("==", 1)
        distribution = metadata.distribution(name)
        if distribution.version != version:
            raise ValueError(f"Unexpected dependency version: {name}")
        texts = []
        for file in distribution.files or []:
            if any(token in file.name.lower() for token in ("license", "notice", "copying")):
                source = distribution.locate_file(file)
                if source.is_file():
                    texts.append(source.read_text(errors="replace"))
        declared = (distribution.metadata.get("License-Expression")
                    or distribution.metadata.get("License") or "See package metadata")
        sections.append(f"{name} {version}\nLicense: {declared}\n" + "\n".join(texts))
    output.write_text("\n\n".join(sections), encoding="utf-8")


def prepare(args):
    manifest = json.loads(MANIFEST.read_text())
    runtime = args.data_dir / "runtime"
    models = runtime / "models"
    asr = (verify_files(args.model_path, manifest["models"]["asr"], external=True)
           if args.model_path else download_model(models / "Qwen3-ASR-0.6B", manifest["models"]["asr"]))
    aligner = download_model(models / "Qwen3-ForcedAligner-0.6B", manifest["models"]["aligner"])
    vad = download_model(models / "silero-vad", manifest["models"]["vad"])
    licenses = ROOT / "third-party-licenses"
    for directory in (models / "Qwen3-ASR-0.6B", aligner):
        if directory.is_dir():
            shutil.copyfile(licenses / "Apache-2.0.txt", directory / "LICENSE")
    shutil.copyfile(licenses / "Silero-VAD-LICENSE.txt", vad / "LICENSE")
    collect_licenses(runtime / "PYTHON-THIRD-PARTY-LICENSES.txt")
    values = {"python": str(Path(sys.executable).absolute()), "model": str(asr),
              "aligner": str(aligner), "vad": str(vad / "silero_vad.onnx")}
    # A network-free import/inference check catches incompatible runtime wheels before config changes.
    if args.smoke_audio:
        request = {"version": 1, "wavPath": str(args.smoke_audio.resolve()),
                   "language": "zh", **{k: values[k] for k in ("model", "aligner", "vad")}}
        env = {**os.environ, "HF_HUB_OFFLINE": "1", "HF_HUB_DISABLE_TELEMETRY": "1"}
        subprocess.run([sys.executable, "-I", str(HERE / "worker.py")],
                       input=json.dumps(request), text=True, env=env, check=True)
    write_config(args.data_dir / "qwen.local.json", values)
    print("Qwen runtime and models verified. Device-local configuration saved outside the app.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path,
                        default=Path.home() / "Library/Application Support/OpenScreen-Qwen")
    parser.add_argument("--model-path", type=Path, default=os.environ.get("OPENSCREEN_QWEN_MODEL"),
                        help="Reuse this official ASR checkpoint read-only instead of downloading it")
    parser.add_argument("--smoke-audio", type=Path, help="Optional 16 kHz mono PCM16 WAV for offline verification")
    parser.add_argument("--prepare-models", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    args.data_dir = args.data_dir.expanduser().resolve()
    if args.model_path:
        args.model_path = args.model_path.expanduser().resolve()
    if args.prepare_models:
        prepare(args)
        return
    if platform.system() != "Darwin" or platform.machine() != "arm64" or int(platform.mac_ver()[0].split(".")[0]) < 26:
        parser.error("This pinned MLX runtime requires Apple Silicon and macOS 26 or later.")
    args.data_dir.mkdir(parents=True, exist_ok=True)
    with (args.data_dir / ".setup.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.error("Another Qwen setup is already running for this data directory.")
        if args.model_path:
            verify_files(args.model_path, json.loads(MANIFEST.read_text())["models"]["asr"], external=True)
        runtime = args.data_dir / "runtime"
        python = runtime / "venv/bin/python"
        if not python.exists():
            subprocess.run(["uv", "venv", "--python", "3.12", str(runtime / "venv")], check=True)
        subprocess.run(["uv", "pip", "sync", "--python", str(python),
                        str(HERE / "requirements.lock.txt")], check=True)
        # The subprocess imports only this new environment, with no shell/parent Python paths.
        command = [str(python), "-I", str(Path(__file__).resolve()), "--prepare-models",
                   "--data-dir", str(args.data_dir)]
        if args.model_path:
            command += ["--model-path", str(args.model_path)]
        if args.smoke_audio:
            command += ["--smoke-audio", str(args.smoke_audio)]
        env = dict(os.environ)
        for key in ("PYTHONPATH", "PYTHONHOME", "HF_HUB_OFFLINE"):
            env.pop(key, None)
        env["HF_HUB_DISABLE_TELEMETRY"] = "1"
        subprocess.run(command, env=env, check=True)


if __name__ == "__main__":
    main()
