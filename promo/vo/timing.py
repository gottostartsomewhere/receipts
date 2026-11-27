"""Writes promo/vo/timing.js (window.VO) from the voiceover files.

For each line in script.json it uses promo/vo/real/<id>.wav when that exists (a real recording,
one file per line, any sample rate) and the placeholder promo/vo/tts/<id>.wav otherwise.
Leading and trailing silence is ignored when timing the line.

    python promo/vo/timing.py
"""

import json
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent


def read(path):
    with wave.open(str(path), "rb") as w:
        sr, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    x = np.frombuffer(raw, dtype={1: np.uint8, 2: np.int16, 4: np.int32}[sw]).astype(np.float64)
    if sw == 1:
        x = x - 128
    x = x.reshape(-1, ch).mean(axis=1)
    return x / (np.max(np.abs(x)) or 1), sr


def trimmed(x, sr, floor=0.02):
    env = np.convolve(np.abs(x), np.ones(int(sr * 0.01)) / int(sr * 0.01), mode="same")
    on = np.where(env > floor)[0]
    if len(on) == 0:
        return 0.0, len(x) / sr
    return on[0] / sr, (on[-1] + 1) / sr


lines = json.loads((HERE / "script.json").read_text(encoding="utf-8"))
out = []
for l in lines:
    real = HERE / "real" / f"{l['id']}.wav"
    path = real if real.exists() else HERE / "tts" / f"{l['id']}.wav"
    x, sr = read(path)
    a, b = trimmed(x, sr)
    out.append({"id": l["id"], "text": l["text"], "file": str(path.relative_to(HERE.parent)).replace("\\", "/"), "start": round(a, 3), "dur": round(b - a, 3), "real": real.exists()})
(HERE / "timing.js").write_text("window.VO = " + json.dumps(out) + ";\n", encoding="utf-8")
print(f"{len(out)} lines, {sum(o['dur'] for o in out):.1f} s of speech, {sum(o['real'] for o in out)} real recordings")
