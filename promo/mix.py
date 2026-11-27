"""Soundtrack for a cut: music, the voiceover and sound effects, from promo/out/<name>-cues.json.

    python promo/mix.py promo      ->  promo/out/promo-sound.wav
    python promo/mix.py demo       ->  promo/out/demo-sound.wav

The music is synthesised here (house-style, sidechained, in A minor). The cut says how fast and
how busy it is ({"bpm", "energy", "duck", "outro"}); with "duck" the music drops under the
voiceover. Sound effects reuse the instruments in sound.py.
"""

import json
import sys
import wave
from pathlib import Path

import numpy as np

import sound as S

SR = S.SR
HERE = Path(__file__).resolve().parent
rng = np.random.default_rng(128)


def t_axis(d):
    return np.arange(int(d * SR)) / SR


def saw(freq, d, harmonics=14):
    t = t_axis(d)
    x = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        if freq * k > 12000:
            break
        x += np.sin(2 * np.pi * freq * k * t + 0.3 * k) / k
    return x * 0.6


def pluck(freq, d, decay=0.18, bright=1.0):
    t = t_axis(d)
    x = saw(freq, d, harmonics=int(4 + 8 * bright))
    return x * np.exp(-t / decay) * np.clip(t / 0.003, 0, 1)


def read_vo(path):
    with wave.open(str(path), "rb") as w:
        sr, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    x = np.frombuffer(raw, dtype={2: np.int16, 4: np.int32}[sw]).astype(np.float64)
    x = x.reshape(-1, ch).mean(axis=1) / (2 ** (8 * sw - 1))
    if sr != SR:
        n = int(len(x) * SR / sr)
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)
    return x


def music(dur, bpm, energy, outro, quiet):
    """quiet: list of (t0, t1) where the beat drops out (cards with no footage, the end)."""
    beat = 60 / bpm
    m = S.Track(dur + 3)
    A1, F1, C2, G1 = 55.0, 43.65, 65.41, 49.0
    roots = [A1, F1, C2, G1]
    chords = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 261.63, 329.63], [196.0, 246.94, 293.66]]
    arps = [[440, 523.25, 659.25, 880], [349.23, 440, 523.25, 698.46], [392, 523.25, 659.25, 784], [392, 493.88, 587.33, 783.99]]
    K, HC, HO, CL = S.kick(), S.hat(), S.hat(True), S.clap()
    nbeats = int(dur / beat) + 1
    sidechain = np.ones(m.n)
    kick_times = []

    def in_quiet(t):
        return any(a <= t < b for a, b in quiet)

    for bi in range(nbeats):
        t = bi * beat
        if t >= outro:
            break
        bar = (bi // 4) % 4
        intro = t < 4 * beat * (1 if energy > 0.8 else 0)
        q = in_quiet(t)
        if not intro and not q:
            m.add(t, K, 0.95)
            kick_times.append(t)
        if not intro and not q and bi % 2 == 1:
            m.add(t, CL, 0.38 * energy + 0.1, pan=0.05)
        for s in range(4 if energy > 0.8 else 2):
            ht = t + s * beat / (4 if energy > 0.8 else 2)
            vel = (0.2, 0.08, 0.14, 0.08)[s] if energy > 0.8 else (0.14, 0.1)[s]
            if (energy > 0.8 and s == 2) or (energy <= 0.8 and s == 1):
                m.add(ht, HO, vel * 1.2, pan=0.3)
            else:
                m.add(ht, HC, vel, pan=-0.25 if s % 2 else 0.2)
        if not intro:
            # syncopated bass: on the off-eighths, an octave jump at the end of the bar
            f = roots[bar]
            for s, mult in ((0.5, 1), (1.5 if bi % 2 else 1.0, 1), (1.75, 2 if bi % 4 == 3 else 1)):
                if s >= 1.0 and energy <= 0.8:
                    continue
                m.add(t + s * beat / 2, S.bass_note(f * mult, beat * 0.4), 0.42 + 0.12 * energy)
        if bi % 4 == 0 and not q:
            # chord stabs on the offbeats of the bar
            for off in (0.5, 1.5, 2.5, 3.5) if energy > 0.8 else (0.0,):
                d = beat * (0.45 if energy > 0.8 else 3.6)
                x = sum(saw(f, d, 10) for f in chords[bar]) / 3
                env = np.exp(-t_axis(d) / (0.16 if energy > 0.8 else 1.2)) * np.clip(t_axis(d) / 0.004, 0, 1)
                m.add(t + off * beat, x * env, 0.16 if energy > 0.8 else 0.11, pan=-0.2)
        if energy > 0.8 and not intro and not q and t >= 8 * beat:
            # a sixteenth-note arpeggio over the chord
            for s in range(4):
                f = arps[bar][(bi * 4 + s) % 4]
                m.add(t + s * beat / 4, pluck(f, beat * 0.3, decay=0.09), 0.07, pan=0.35 if s % 2 else -0.35)
        if intro:
            # filtered build: chord swells and a rising noise into the drop
            if bi == 0:
                d = 4 * beat
                x = sum(saw(f, d, 6) for f in chords[0]) / 3
                m.add(0, x * np.linspace(0, 1, len(x)) ** 2, 0.12)
                m.add(0, S.riser(d) * 0.5, 0.35)

    # pump the music under the kick
    for kt in kick_times:
        i = int(kt * SR)
        n = int(0.22 * SR)
        seg = 1 - 0.55 * np.exp(-np.arange(n) / (0.07 * SR))
        sidechain[i : i + n] = np.minimum(sidechain[i : i + n], seg[: max(0, min(n, m.n - i))])
    m.L *= sidechain
    m.R *= sidechain
    # ring out at the end
    d = dur - outro + 0.6
    if d > 0:
        x = sum(saw(f, d, 8) for f in chords[0] + [440.0]) / 4
        m.add(outro, x * np.exp(-t_axis(d) / 1.4), 0.16)
        m.add(outro, S.impact() * 0.5, 0.5)
    return m


def main(name):
    data = json.loads((HERE / "out" / f"{name}-cues.json").read_text(encoding="utf-8"))
    dur = data["duration"]
    cut = data.get("cut") or {}
    spec = cut.get("music", {"bpm": 120, "energy": 1, "duck": False})
    cues = data["cues"]
    outro = spec.get("outro", dur - 3)
    quiet = []
    mus = music(dur, spec["bpm"], spec["energy"], outro, quiet)

    vo = S.Track(dur + 3)
    fx = S.Track(dur + 3)
    for c in cues:
        t, ty = c["t"], c["type"]
        if ty == "vo":
            x = read_vo(HERE / c["file"])
            a = int(c.get("start", 0) * SR)
            x = x[max(0, a - int(0.03 * SR)) : a + int((c["dur"] + 0.25) * SR)]
            vo.add(t - 0.03, x / (np.max(np.abs(x)) or 1) * 0.9, 1.0)
        elif ty == "click":
            fx.add(t, S.click(), 0.5)
        elif ty == "key":
            fx.add(t, S.key(c.get("v", 1)), 0.4, pan=0.15)
        elif ty == "tick2":
            tk = np.sin(2 * np.pi * 2600 * t_axis(0.05)) * np.exp(-t_axis(0.05) * 70)
            fx.add(t, tk, 0.18, pan=0.1)
        elif ty == "stamp":
            fx.add(t, S.stamp(c.get("weight", 1)), 0.6)
        elif ty == "slap":
            fx.add(t, S.slap(c.get("i", 0)), 0.5)
        elif ty == "whoosh":
            fx.add(t - 0.03, S.whoosh(c.get("dur", 0.38)), 0.28)
        elif ty == "impact":
            fx.add(t, S.impact(), 0.8)
        elif ty == "ching":
            fx.add(t, S.ching(), 0.5)

    n = int(dur * SR)
    voL, voR = vo.L[:n], vo.R[:n]
    gain = np.ones(n)
    if spec.get("duck"):
        act = np.abs(voL) + np.abs(voR)
        w = int(0.25 * SR)
        act = np.convolve(act, np.ones(w) / w, mode="same")
        act = np.clip(act / (np.max(act) * 0.25 or 1), 0, 1)
        gain = 1 - 0.68 * act
        music_level = 0.5
    else:
        music_level = 0.7
    L = mus.L[:n] * gain * music_level + voL * 1.0 + fx.L[:n]
    R = mus.R[:n] * gain * music_level + voR * 1.0 + fx.R[:n]
    fade = np.clip((dur - t_axis(dur)[:n]) / 0.9, 0, 1)
    L, R = L * fade, R * fade
    peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
    L = np.tanh(L / peak * 1.3) / np.tanh(1.3) * 0.89
    R = np.tanh(R / peak * 1.3) / np.tanh(1.3) * 0.89
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
