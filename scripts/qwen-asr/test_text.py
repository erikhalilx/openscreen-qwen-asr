import unittest
from text import restore_words


class WordRestorationTests(unittest.TestCase):
    def test_preserves_chinese_punctuation_and_source_offset(self):
        result = restore_words('“你好，世界！”', [
            {'text': '你', 'start': 0.1, 'end': 0.3}, {'text': '好', 'start': 0.3, 'end': 0.5},
            {'text': '世', 'start': 0.8, 'end': 1.0}, {'text': '界', 'start': 1.0, 'end': 1.3},
        ], 35.0, 2.0)
        self.assertEqual([w['word'] for w in result], ['“你', '好，', '世', '界！”'])
        self.assertEqual(result[2]['startSec'], 35.8)

    def test_preserves_actual_english_words_and_punctuation(self):
        result = restore_words('Hello, OpenScreen!', [
            {'text':'Hello', 'start':0.2, 'end':0.5},
            {'text':'OpenScreen', 'start':0.8, 'end':1.5},
        ], 0, 2)
        self.assertEqual([w['word'] for w in result], ['Hello,', 'OpenScreen!'])

    def test_rejects_missing_words_instead_of_fabricating_alignment(self):
        with self.assertRaisesRegex(ValueError, 'missing'):
            restore_words('你好', [{'text':'你','start':0,'end':0.5}], 0, 1)

    def test_rejects_nan_inverted_and_outside_audio(self):
        for start, end in [(float('nan'), 1), (0.5, 0.3), (0, 2)]:
            with self.subTest(start=start, end=end), self.assertRaises(ValueError):
                restore_words('好', [{'text':'好','start':start,'end':end}], 0, 1)

    def test_keeps_repeated_chinese_characters(self):
        result = restore_words('哈哈哈。', [
            {'text':'哈','start':0.1,'end':0.2}, {'text':'哈','start':0.2,'end':0.3},
            {'text':'哈','start':0.3,'end':0.4},
        ], 0, 1)
        self.assertEqual(''.join(w['word'] for w in result), '哈哈哈。')


if __name__ == '__main__':
    unittest.main()
