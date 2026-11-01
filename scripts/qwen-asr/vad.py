"""Silero v6 ONNX on CPU. Returned spans remain on the original audio clock."""


def merge_spans(spans, gap_samples=16000):
    """Keep short conversational pauses in the original waveform, without compressing time."""
    merged = []
    for left, right in spans:
        if merged and left <= merged[-1][1] + gap_samples:
            merged[-1] = (merged[-1][0], right)
        else:
            merged.append((left, right))
    return merged


def speech_spans(audio, model_path):
    import numpy as np
    import onnxruntime as ort
    options = ort.SessionOptions()
    options.inter_op_num_threads = 1
    options.intra_op_num_threads = 1
    session = ort.InferenceSession(str(model_path), sess_options=options,
                                  providers=["CPUExecutionProvider"])
    state = np.zeros((2, 1, 128), dtype=np.float32)
    context = np.zeros((1, 64), dtype=np.float32)
    spans = []
    start = None
    silence = None
    for pos in range(0, len(audio), 512):
        frame = np.zeros((1, 512), dtype=np.float32)
        block = audio[pos:pos + 512]
        frame[0, :len(block)] = block
        inputs = np.concatenate((context, frame), axis=1)
        probability, state = session.run(None, {"input": inputs, "state": state,
                                                "sr": np.array(16000, dtype=np.int64)})
        context = inputs[:, -64:]
        if float(probability.flat[0]) >= 0.5:
            if start is None:
                start = pos
            silence = None
        elif start is not None:
            if silence is None:
                silence = pos
            if pos - silence >= 4800:
                if silence - start >= 3200:
                    spans.append((max(0, start - 2560), min(len(audio), silence + 2560)))
                start = silence = None
    if start is not None:
        end = silence if silence is not None else len(audio)
        if end - start >= 3200:
            spans.append((max(0, start - 2560), min(len(audio), end + 2560)))
    return merge_spans(spans)
