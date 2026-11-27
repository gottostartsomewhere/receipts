"""Soundtrack for a cut: music, the voiceover and sound effects, from promo/out/<name>-cues.json.

    python promo/mix.py promo      ->  promo/out/promo-sound.wav
    python promo/mix.py demo       ->  promo/out/demo-sound.wav

The cut says how the music goes ({"bpm", "energy", "duck", "drop", "outro"}): a cold open that
builds to the drop, the beat until the outro, then a ring-out. With "duck" the music dips
under the voiceover. Instruments live in synth.py.
"""

import json
import sys
import wave
from pathlib import Path

import numpy as np

import synth as S

SR = S.SR
HERE = Path(__file__).resolve().parent


def read_vo(path):
    with wave.open(str(path), "rb") as w:
        sr, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    x = np.frombuffer(raw, dtype={2: np.int16, 4: np.int32}[sw]).astype(np.float64)
    x = x.reshape(-1, ch).mean(axis=1) / (2 ** (8 * sw - 1))
    if sr != SR:
        n = int(len(x) * SR / sr)
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)
    # a gentle voice chain: rumble out, a little presence, even level
    x = S.hp(x, 90)
    x = x + 0.25 * S.bp(x, 2500, 5000)
    return x / (np.max(np.abs(x)) or 1)


def moving_average(x, w):
    c = np.concatenate([[0.0], np.cumsum(x)])
    idx = np.arange(len(x))
    lo, hi = np.clip(idx - w // 2, 0, len(x)), np.clip(idx + w // 2, 0, len(x))
    return (c[hi] - c[lo]) / w


def main(name):
    data = json.loads((HERE / "out" / f"{name}-cues.json").read_text(encoding="utf-8"))
    dur = data["duration"]
    spec = (data.get("cut") or {}).get("music", {"bpm": 120, "energy": 1})
    cues = data["cues"]
    mL, mR = S.music(dur, spec["bpm"], spec["energy"], spec.get("drop", 0), spec.get("outro", dur - 3))

    vo, fx = S.Bus(dur), S.Bus(dur)
    for c in cues:
        t, ty = c["t"], c["type"]
        if ty == "vo":
            x = read_vo(HERE / c["file"])
            a = int(c.get("start", 0) * SR)
            x = x[max(0, a - int(0.03 * SR)) : a + int((c["dur"] + 0.25) * SR)]
            vo.add(t - 0.03, x * 0.9)
        elif ty == "click":
            fx.add(t, S.ui_click(c.get("v", 1)), 0.5, pan=0.1)
        elif ty == "key":
            fx.add(t, S.key(c.get("v", 1)), 0.45, pan=0.15)
        elif ty == "tick2":
            fx.add(t, S.pop(), 0.35, pan=0.1)
        elif ty == "stamp":
            fx.add(t, S.stamp(c.get("weight", 1)), 0.55)
        elif ty == "slap":
            fx.add(t, S.slam(c.get("i", 0)), 0.55)
        elif ty == "whoosh":
            fx.add(t - 0.05, S.whoosh(c.get("dur", 0.38)), 0.3)
        elif ty == "impact":
            fx.add(t, S.impact(), 0.6)
        elif ty == "ching":
            fx.add(t, S.ching(), 0.45, pan=-0.1)

    n = int(dur * SR)
    mL, mR = mL[:n], mR[:n]
    voL, voR = vo.L[:n], vo.R[:n]
    if spec.get("duck"):
        act = moving_average(np.abs(voL) + np.abs(voR), int(0.25 * SR))
        act = np.clip(act / (np.max(act) * 0.22 or 1), 0, 1)
        gain = 1 - 0.7 * act
        level = 0.5
    else:
        gain, level = 1.0, 0.75
    L = mL * gain * level + voL + fx.L[:n] * 0.8
    R = mR * gain * level + voR + fx.R[:n] * 0.8
    fade = np.clip((dur - np.arange(n) / SR) / 1.0, 0, 1)
    L, R = S.master(L * fade, R * fade)
    pcm = (np.stack([L, R], axis=1) * 32767).astype(np.int16)
    out = HERE / "out" / f"{name}-sound.wav"
    with wave.open(str(out), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"wrote {out} ({dur:.1f} s)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "promo")
