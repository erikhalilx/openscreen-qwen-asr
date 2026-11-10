from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from decode import Candidate, Decoder, IncompleteChunk, SAMPLE_RATE, recover_chunk


class RecoveryTests(unittest.TestCase):
    def test_normal_and_empty_windows_need_only_one_decode(self):
        for text in ("你好", ""):
            with self.subTest(text=text):
                audio = [0.0]
                decode = Mock(return_value=Candidate(text, "Chinese"))
                self.assertEqual(recover_chunk(audio, 4, decode), [(audio, 4, decode.return_value)])
                decode.assert_called_once_with(audio, False)

    def test_repetition_gets_one_relaxed_attempt_on_the_same_window(self):
        audio = [0.0] * SAMPLE_RATE
        complete = Candidate("重复之后的话", "Chinese")
        decode = Mock(side_effect=[Candidate("重复", "Chinese", "repetition"), complete])
        self.assertEqual(recover_chunk(audio, 3, decode), [(audio, 3, complete)])
        self.assertEqual([call.args for call in decode.call_args_list], [(audio, False), (audio, True)])

    def test_split_uses_only_the_children_and_keeps_source_offsets(self):
        def decode(part, relaxed):
            self.assertFalse(relaxed)
            if len(part) > 3 * SAMPLE_RATE:
                return Candidate("discarded", "English", "length")
            return Candidate("left" if part[-1] == 0 else "right", "English")

        audio = [0.0] * (3 * SAMPLE_RATE) + [0.1] * (3 * SAMPLE_RATE)
        # A quiet valley at the boundary makes the split deterministic.
        audio[3 * SAMPLE_RATE:3 * SAMPLE_RATE + 800] = [0.0] * 800
        recovered = recover_chunk(audio, 23, decode)
        self.assertEqual([(len(part), start) for part, start, _ in recovered],
                         [(3 * SAMPLE_RATE, 23), (3 * SAMPLE_RATE, 26)])
        self.assertEqual([value.text for _, _, value in recovered], ["left", "right"])

    def test_recovery_bounds_decoding_to_two_levels(self):
        def decode(part, relaxed):
            if len(part) > 3.5 * SAMPLE_RATE or not relaxed:
                return Candidate("repeat", "English", "repetition")
            return Candidate("complete", "English")

        audio = [0.0] * (12 * SAMPLE_RATE)
        calls = Mock(side_effect=decode)
        self.assertEqual(len(recover_chunk(audio, 0, calls)), 4)
        self.assertEqual(calls.call_count, 14)

    def test_exhaustion_and_empty_recovery_raise_with_source_range(self):
        for candidate in (Candidate("repeat", "English", "repetition"), Candidate("", "English")):
            decode = Mock(side_effect=[Candidate("repeat", "English", "repetition"), candidate])
            with self.assertRaisesRegex(IncompleteChunk, r"12\.000–13\.000s"):
                recover_chunk([0.0] * SAMPLE_RATE, 12, decode)

        def decode(part, relaxed):
            return Candidate("partial", "English", "length") if len(part) > 48000 else Candidate("", "English")

        with self.assertRaisesRegex(IncompleteChunk, "empty split recovery"):
            recover_chunk([0.0] * (6 * SAMPLE_RATE), 12, decode)


class DecoderTests(unittest.TestCase):
    def setUp(self):
        self.adapter = Decoder.__new__(Decoder)
        self.generation = SimpleNamespace(finish_reason="eos", generated_tokens=3,
                                          tokens=[1, 2, 3], max_new_tokens=128)
        self.adapter.generate = Mock(return_value=self.generation)
        self.adapter.detect_repetition = Mock(return_value=False)
        self.adapter.cleanup = lambda text: text
        self.adapter.generator = SimpleNamespace(
            GenerationResult=SimpleNamespace, _detect_repetition=self.adapter.detect_repetition,
        )
        self.adapter.tokenizer = SimpleNamespace(_detect_and_fix_repetitions=self.adapter.cleanup)
        self.adapter.pipeline = SimpleNamespace(generate=self.adapter.generate)
        self.adapter.tokenizer.parse_asr_output = Mock(side_effect=lambda text, user_language:
            (user_language, self.adapter.tokenizer._detect_and_fix_repetitions(text)))
        self.session = SimpleNamespace(
            transcribe=Mock(side_effect=self.transcribe),
            tokenizer=SimpleNamespace(decode=Mock(return_value="real words")),
        )

    def transcribe(self, audio, **options):
        self.adapter.pipeline.generate()
        return SimpleNamespace(text="real words", language="English", truncated=False,
                               finish_reason="eos")

    def test_decoder_keeps_language_prompt_and_audits_cleanup_even_at_eos(self):
        audio = [0.0]
        result = self.adapter.decode(self.session, audio, "English", "A project term", False)
        self.assertIsNone(result.rejection)
        self.session.transcribe.assert_called_once_with(
            (audio, SAMPLE_RATE), language="English", context="A project term", return_timestamps=False,
        )
        self.session.tokenizer.decode.return_value = "more real words"
        result = self.adapter.decode(self.session, audio, "English", "", True)
        self.assertEqual(result.rejection, "decoder cleanup removed text")
        self.assertIs(self.adapter.tokenizer._detect_and_fix_repetitions, self.adapter.cleanup)

    def test_relaxed_guard_still_stops_identical_tokens_and_hooks_restore_after_failure(self):
        self.assertTrue(self.adapter.relaxed_repetition([1] * 20))
        self.assertFalse(self.adapter.relaxed_repetition([1, 2] * 10))
        self.adapter.detect_repetition.assert_called_once_with([1, 2] * 10, threshold=60)
        self.session.transcribe.side_effect = RuntimeError("GPU failed")
        with self.assertRaisesRegex(RuntimeError, "GPU failed"):
            self.adapter.decode(self.session, [0.0], None, "", True)
        self.assertIs(self.adapter.pipeline.generate, self.adapter.generate)
        self.assertIs(self.adapter.generator._detect_repetition, self.adapter.detect_repetition)
