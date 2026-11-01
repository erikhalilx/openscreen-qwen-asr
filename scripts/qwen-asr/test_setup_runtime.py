import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("setup_runtime", Path(__file__).with_name("setup_runtime.py"))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class SetupTests(unittest.TestCase):
    def test_external_checkpoint_is_verified_without_any_writes(self):
        with tempfile.TemporaryDirectory() as root:
            file = Path(root) / "model.safetensors"
            file.write_bytes(b"test checkpoint")
            before = file.stat()
            model = {"repo": "test/model", "files": {file.name: {
                "required": True, "bytes": before.st_size, "sha256": setup.sha256(file)}}}
            self.assertEqual(setup.verify_files(root, model, external=True), Path(root).resolve())
            self.assertEqual(before.st_mtime_ns, file.stat().st_mtime_ns)
            self.assertEqual([file], list(Path(root).iterdir()))
            file.write_bytes(b"wrong checkpoint")
            with self.assertRaises(ValueError):
                setup.verify_files(root, model, external=True)

    def test_private_configuration_is_atomic_and_restricts_permissions(self):
        with tempfile.TemporaryDirectory() as root:
            file = Path(root) / "qwen.local.json"
            setup.write_config(file, {"model": "example"})
            self.assertEqual(json.loads(file.read_text()), {"model": "example"})
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            self.assertFalse(file.with_suffix(".partial").exists())

    def test_short_pauses_keep_source_time_and_long_silence_stays_separate(self):
        import vad
        self.assertEqual(vad.merge_spans([(0, 1000), (8000, 12000), (50000, 60000)]),
                         [(0, 12000), (50000, 60000)])

    def test_manifest_pins_weights_and_public_downloads(self):
        manifest = json.loads(setup.MANIFEST.read_text())
        for model in manifest["models"].values():
            self.assertEqual(len(model["revision"]), 40)
            for item in model["files"].values():
                self.assertEqual(len(item["sha256"]), 64)
                self.assertGreater(item["bytes"], 0)
                self.assertTrue(item["url"].startswith("https://"))
                self.assertIn(model["revision"], item["url"])


if __name__ == "__main__":
    unittest.main()
