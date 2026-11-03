# Qwen caption segmentation / 千问字幕断句

Investigated on 2026-11-03. The line-length setting now accepts 1–25 units; defaults and segmentation rules are unchanged. Chinese units are generally characters from the aligner, rather than linguistically segmented Chinese words.

2026-11-03 核对：行长设置范围扩大为 1–25，默认值和断句规则保持原样。中文通常按对齐器产生的字级单元计数，并不等于中文自然语言分词后的词数。

## Current pipeline / 当前处理链

- `scripts/qwen-asr/vad.py` detects speech and merges nearby spans before inference. This controls recognition chunks, not final subtitle lines.
- `worker.py` obtains Qwen text and aligns it; `text.py` preserves the recognized punctuation and lexical timestamps. Its phrase summaries split at a 0.4-second gap or sentence-final punctuation.
- `captionLinesForAsset` reads the timed words directly. `groupTimedCaptionWordsIntoLines` starts a new run at a gap of **0.24 seconds**, then divides it by the configured unit counts. This final step does not prioritize sentence punctuation or semantic completeness.
- The display-only one-second hold is applied afterwards and does not merge lines.

识别前的 VAD 音频分块、识别后的短语汇总和最终字幕分行是三个不同步骤。当前最终字幕直接读取字词时间戳，遇到 **0.24 秒**停顿就另起一组，再按行长拆分；最终分行没有优先使用语义或句末标点。因此，同一句话的短暂停顿可能形成两条字幕。此前增加的一秒展示延长不会合并它们；扩大行长上限也不会消除停顿边界。

## Model capability and direction / 模型能力与建议

Qwen produces transcription text, while its ForcedAligner locates supplied text in audio. Flexible sentence/paragraph alignment does not itself select semantic sentence boundaries. The official report also says ASR is trained not to follow natural-language prompt instructions; a prompt asking for semantic subtitle splitting is not a reliable solution.

Recommended next step: implement segmentation after transcription, using existing punctuation and clause boundaries first, the user's line limit next, and long silence as a fallback. Reuse the first/last word timestamps; keep transcript text, source alignment, video cuts, independent audio sources and the existing display hold intact. Stronger semantic decisions would need a separately evaluated local text model or parser. No segmentation change is included in the line-limit adjustment.

Qwen 负责输出转录文字，ForcedAligner 负责给已有文字定位；支持句子或段落级对齐，不等于会自动选择语义断句点。官方明确说明 ASR 经过训练，不遵循提示中的自然语言指令，不能依赖“请按语义断句”这样的提示词实现功能。

建议在转录完成后增加字幕分句：优先已有标点和自然分句边界，再满足用户行长限制，长静音作为兜底。时间仍取首末字词的现有时间戳，不改转录、原始对齐、视频剪切、音源独立性或一秒展示延长。若要求更强的语义判断，再单独评估本地文本模型或句法工具。本轮只扩大行长范围，未实施该方案。

Sources / 资料：[official Qwen repository](https://github.com/QwenLM/Qwen3-ASR), [official technical report](https://arxiv.org/html/2601.21337v1), [MLX implementation](https://github.com/moona3k/mlx-qwen3-asr).
