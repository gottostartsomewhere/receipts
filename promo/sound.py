"""Soundtrack for the Receipts promo, synthesised from scratch with numpy (no samples).

Reads promo/out/cues.json (written by render.mjs from the composition's own timeline) and writes
promo/out/soundtrack.wav: a 120 BPM beat plus printer chatter, stamps, a cash register ching,
counter ticks, paper whooshes and the final tear, each placed on its cue.

    python promo/sound.py
"""

import json
import wave
from pathlib import Path

import numpy as np

SR = 48000
BPM = 120
BEAT = 60 / BPM
HERE = Path(__file__).resolve().parent
rng = np.random.default_rng(2026)


# ---------- basic building blocks ----------
def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def band(x, lo, hi):
    """Band-limit a signal with an FFT mask (soft edges)."""
    n = len(x)
    if n == 0:
        return x
    f = np.fft.rfftfreq(n, 1 / SR)
    X = np.fft.rfft(x)
    m = np.clip((f - lo * 0.8) / (lo * 0.4 + 1e-9), 0, 1) if lo > 0 else np.ones_like(f)
    m = m * np.clip((hi * 1.2 - f) / (hi * 0.4), 0, 1)
    return np.fft.irfft(X * m, n)


def noise(dur):
    return rng.standard_normal(int(dur * SR))


def env_exp(dur, decay, attack=0.002):
    t = t_axis(dur)
    a = np.clip(t / attack, 0, 1) if attack > 0 else 1
    return a * np.exp(-t / decay)


def norm(x, peak=1.0):
    m = np.max(np.abs(x)) or 1
    return x / m * peak


def sweep_noise(dur, f0, f1, width=0.6, block=2048):
    """Noise through a band that slides from f0 to f1 (overlap-added FFT blocks)."""
    n = int(dur * SR)
    out = np.zeros(n + block)
    win = np.hanning(block)
    hop = block // 2
    src = rng.standard_normal(n + block)
    for start in range(0, n, hop):
        p = start / max(1, n)
        fc = f0 * (f1 / f0) ** p
        seg = src[start : start + block] * win
        out[start : start + block] += band(seg, fc * (1 - width / 2), fc * (1 + width / 2))
    return out[:n]


class Track:
    def __init__(self, dur):
        self.n = int(dur * SR)
        self.L = np.zeros(self.n)
        self.R = np.zeros(self.n)

    def add(self, t, x, gain=1.0, pan=0.0):
        i = int(round(t * SR))
        if i >= self.n or len(x) == 0:
            return
        x = x[: self.n - i] * gain
        self.L[i : i + len(x)] += x * np.sqrt(0.5 * (1 - pan))
        self.R[i : i + len(x)] += x * np.sqrt(0.5 * (1 + pan))


# ---------- instruments ----------
def kick():
    t = t_axis(0.5)
    f = 48 + 110 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.5)
    click = band(noise(0.012), 1500, 6000) * np.exp(-t_axis(0.012) * 400) * 0.5
    body[: len(click)] += click
    return np.tanh(body * 1.6)


def hat(open_=False):
    d = 0.18 if open_ else 0.035
    return band(noise(d), 7000, 16000) * env_exp(d, d / 3.5, 0.0005)


def clap():
    d = 0.22
    out = np.zeros(int(d * SR))
    for k, off in enumerate((0, 0.011, 0.022)):
        b = band(noise(0.03), 900, 3500) * env_exp(0.03, 0.006, 0.0005)
        i = int(off * SR)
        out[i : i + len(b)] += b * (0.8 if k < 2 else 1)
    tail = band(noise(d), 900, 3000) * env_exp(d, 0.06)
    return out + tail * 0.6


def bass_note(freq, dur):
    t = t_axis(dur)
    x = np.sin(2 * np.pi * freq * t) + 0.45 * np.sin(2 * np.pi * 2 * freq * t) + 0.2 * np.sin(2 * np.pi * 3 * freq * t)
    e = np.clip(t / 0.004, 0, 1) * np.exp(-t / 0.16)
    return np.tanh(x * e * 1.4)


def chord(freqs, dur, attack=0.004, decay=0.35, bright=1.0):
    t = t_axis(dur)
    x = np.zeros_like(t)
    for f in freqs:
        for k, a in ((1, 1.0), (2, 0.35 * bright), (3, 0.18 * bright), (4, 0.08 * bright)):
            x += a * np.sin(2 * np.pi * f * k * t + rng.uniform(0, 6.28))
    e = np.clip(t / attack, 0, 1) * np.exp(-t / decay)
    return x * e / len(freqs)


def pad(freqs, dur, fade=1.2):
    t = t_axis(dur)
    x = np.zeros_like(t)
    for f in freqs:
        for det in (-0.6, 0.6):
            x += np.sin(2 * np.pi * (f + det) * t) + 0.3 * np.sin(2 * np.pi * 2 * (f + det) * t)
    e = np.minimum(np.clip(t / fade, 0, 1), np.clip((dur - t) / fade, 0, 1))
    return x * e / (2 * len(freqs))


# ---------- sound effects ----------
def printer(dur, r0, r1):
    """Thermal printer: a buzzing stepper whine, gated line by line, with a paper hiss."""
    t = t_axis(dur)
    rate = r0 * (r1 / r0) ** (t / max(dur, 1e-6)) if r1 != r0 else np.full_like(t, r0)
    line_phase = np.cumsum(rate) / SR
    gate = (np.mod(line_phase, 1.0) < 0.68).astype(float)
    gate = np.convolve(gate, np.ones(96) / 96, mode="same")  # soften edges
    step_f = 820 + 380 * np.clip(rate / 40, 0, 1)
    ph = 2 * np.pi * np.cumsum(step_f) / SR
    whine = np.sign(np.sin(ph)) * 0.25 + np.sin(ph * 2.01) * 0.2
    whine = band(whine, 400, 5000)
    buzz = band(noise(dur), 1800, 7000) * 0.6
    ticks = np.zeros_like(t)
    edges = np.where(np.diff(np.floor(line_phase)) > 0)[0]
    tick = band(noise(0.006), 2000, 9000) * env_exp(0.006, 0.0015, 0.0002)
    for e in edges:
        ticks[e : e + len(tick)] += tick[: len(ticks) - e]
    x = (whine + buzz) * gate + ticks * 0.9
    fade = np.minimum(np.clip(t / 0.02, 0, 1), np.clip((dur - t) / 0.03, 0, 1))
    return x * fade


def stamp(weight=1.0):
    t = t_axis(0.35)
    f = 60 + 90 * np.exp(-t * 40)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
    smack = band(noise(0.35), 200, 2500) * np.exp(-t * 60)
    return np.tanh((body * 1.2 + smack * 0.9) * (0.8 + 0.4 * weight))


def slap(i):
    t = t_axis(0.3)
    hit = band(noise(0.3), 700 + 60 * i, 4500) * np.exp(-t * 26)
    low = np.sin(2 * np.pi * (70 + 6 * i) * t) * np.exp(-t * 16)
    return np.tanh(hit * 1.1 + low * 0.9)


def key(v=1.0):
    d = 0.03
    t = t_axis(d)
    c = band(noise(d), 2500, 11000) * np.exp(-t * 500)
    ping = np.sin(2 * np.pi * 2300 * t) * np.exp(-t * 300) * 0.3
    thock = np.sin(2 * np.pi * 180 * t) * np.exp(-t * 120) * 0.4
    return (c + ping + thock) * v


def click():
    return np.concatenate([key(1.2), np.zeros(int(0.045 * SR)), key(0.8)])


def impact():
    t = t_axis(2.2)
    boom = np.sin(2 * np.pi * (38 + 40 * np.exp(-t * 18)) * t) * np.exp(-t * 2.2)
    crash = band(noise(2.2), 2500, 14000) * np.exp(-t * 2.4) * 0.35
    rumble = band(noise(2.2), 40, 300) * np.exp(-t * 3) * 0.6
    x = boom * 1.1 + crash + rumble
    k = kick()
    x[: len(k)] += k * 0.8
    return np.tanh(x * 1.2)


def ching():
    t = t_axis(1.6)
    x = np.zeros_like(t)
    for f, a, d in ((2093, 1.0, 0.9), (2637, 0.8, 0.7), (3136, 0.6, 0.6), (4186, 0.4, 0.45), (5274, 0.25, 0.3)):
        x += a * np.sin(2 * np.pi * f * t) * np.exp(-t / d)
    x *= np.clip(t / 0.002, 0, 1)
    strike = band(noise(0.02), 3000, 12000) * env_exp(0.02, 0.004, 0.0003)
    x[: len(strike)] += strike
    drawer = np.zeros_like(t)
    dd = band(noise(0.25), 80, 900) * env_exp(0.25, 0.05)
    i = int(0.16 * SR)
    drawer[i : i + len(dd)] += dd
    return x * 0.35 + drawer * 0.6


def ticks(dur, r0, r1):
    t = t_axis(dur)
    rate = r0 * (r1 / r0) ** (t / dur)
    phase = np.cumsum(rate) / SR
    edges = np.where(np.diff(np.floor(phase)) > 0)[0]
    out = np.zeros_like(t)
    tk = np.sin(2 * np.pi * 3200 * t_axis(0.012)) * env_exp(0.012, 0.0025, 0.0002)
    for n, e in enumerate(edges):
        g = 0.6 + 0.4 * (n % 2)
        out[e : e + len(tk)] += tk[: len(out) - e] * g
    return out


def riser(dur):
    t = t_axis(dur)
    nz = sweep_noise(dur, 300, 7000, width=0.9)
    tone = np.sin(2 * np.pi * np.cumsum(180 * (5 ** (t / dur))) / SR) * 0.25
    e = (t / dur) ** 2.2
    return (nz * 0.8 + tone) * e


def whoosh(dur):
    d = dur + 0.12
    t = t_axis(d)
    nz = sweep_noise(d, 900, 4500, width=1.0)
    flutter = 1 + 0.35 * np.sin(2 * np.pi * 38 * t)
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    return nz * flutter * e


def tear():
    d = 0.6
    t = t_axis(d)
    rip = sweep_noise(d, 2500, 1200, width=1.2)
    am = np.abs(band(noise(d), 20, 120))
    am = am / (am.max() or 1)
    crackle = np.zeros_like(t)
    for _ in range(140):
        i = int(rng.uniform(0, 0.5) * SR)
        b = band(noise(0.004), 1500, 9000) * env_exp(0.004, 0.001, 0.0001)
        crackle[i : i + len(b)] += b * rng.uniform(0.3, 1.0)
    e = np.clip(t / 0.03, 0, 1) * np.clip((d - t) / 0.2, 0, 1)
    return (rip * (0.4 + am) + crackle * 0.7) * e


# ---------- arrangement ----------
def main():
    data = json.loads((HERE / "out" / "cues.json").read_text(encoding="utf-8"))
    DUR = data["duration"]
    cues = data["cues"]
    music = Track(DUR + 2.5)
    sfx = Track(DUR + 2.5)

    A1, F1, C2, G1 = 55.0, 43.65, 65.41, 49.0
    prog = [A1, F1, C2, G1]
    chords = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 261.63, 329.63], [196.0, 246.94, 293.66]]
    K, HC, HO, CL = kick(), hat(), hat(True), clap()

    def bar_of(t):
        return int(t // (4 * BEAT)) % 4

    nbeats = int(DUR / BEAT)
    for b in range(nbeats):
        t = b * BEAT
        intro = t < 4
        title = 18 <= t < 19.5
        outro = t >= 45.3
        if outro:
            continue
        # kick
        if not intro and not title:
            music.add(t, K, 0.95)
        if title and b % 2 == 0:
            music.add(t, K, 0.5)
        # clap on 2 and 4 once the groove is in
        if t >= 6 and not title and b % 2 == 1:
            music.add(t, CL, 0.42, pan=0.05)
        # hats: 8ths, 16ths during the fee cards
        sub = 4 if 14 <= t < 18 else 2
        for s in range(sub):
            ht = t + s * BEAT / sub
            g = 0.16 if intro else 0.22
            if s == sub // 2 and not intro:
                music.add(ht, HO, g * 0.8, pan=0.3)
            else:
                music.add(ht, HC, g, pan=0.3 if s % 2 else -0.25)
        # bass: 8th pulses from 4 s
        if t >= 4 and not title:
            f = prog[bar_of(t)]
            for s in (0, 1):
                music.add(t + s * BEAT / 2, bass_note(f * (2 if s == 1 and b % 4 == 3 else 1), BEAT / 2 + 0.05), 0.5)

    # chord stabs on each bar from the drop, pad under the intro, title and outro
    for bar in range(int(DUR / (4 * BEAT))):
        t = bar * 4 * BEAT
        if 10 <= t < 45:
            ch = chords[bar_of(t)]
            for off in (0, 1.5 * BEAT, 2.5 * BEAT):
                music.add(t + off, chord(ch, 0.6, decay=0.18), 0.16, pan=-0.15)
    music.add(0, pad([110.0, 164.81, 220.0], 4.4, fade=1.5), 0.32)
    music.add(18, pad([130.81, 196.0, 261.63], 3.3, fade=0.6), 0.28)
    music.add(45.25, pad([110.0, 164.81, 220.0, 329.63], 3.2, fade=0.4), 0.3)

    # sound effects from the composition's cues
    for c in cues:
        t, ty = c["t"], c["type"]
        if ty == "print":
            sfx.add(t, printer(c["dur"], c["r0"], c["r1"]), 0.22, pan=0.25)
        elif ty == "stamp":
            sfx.add(t, stamp(c.get("weight", 1)), 0.75)
        elif ty == "slap":
            sfx.add(t, slap(c.get("i", 0)), 0.5)
        elif ty == "key":
            sfx.add(t, key(c.get("v", 1)), 0.4, pan=0.15)
        elif ty == "click":
            sfx.add(t, click(), 0.55)
        elif ty == "impact":
            sfx.add(t, impact(), 0.95)
        elif ty == "ching":
            sfx.add(t, ching(), 0.6, pan=-0.1)
        elif ty == "ticks":
            sfx.add(t, ticks(c["dur"], c["r0"], c["r1"]), 0.18, pan=-0.2)
        elif ty == "riser":
            sfx.add(t, riser(c["dur"]), 0.5)
        elif ty == "whoosh":
            sfx.add(t - 0.04, whoosh(c["dur"]), 0.3)
        elif ty == "tear":
            sfx.add(t, tear(), 0.85)

    # A little room: a short noise reverb on the music bus only
    ir_t = t_axis(0.9)
    ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t * 6)
    ir[0] = 0
    ir = ir / np.sqrt(np.sum(ir**2)) * 0.25

    def conv(x):
        n = len(x) + len(ir) - 1
        N = 1 << (n - 1).bit_length()
        return np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[: len(x)]

    mL = music.L + conv(music.L)
    mR = music.R + conv(music.R)
    L = mL * 0.62 + sfx.L
    R = mR * 0.62 + sfx.R
    n = int(DUR * SR)
    L, R = L[:n], R[:n]
    fade = np.clip((DUR - t_axis(DUR)[:n]) / 0.8, 0, 1)
    L *= fade
    R *= fade
    peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
    L, R = np.tanh(L / peak * 1.25) / np.tanh(1.25), np.tanh(R / peak * 1.25) / np.tanh(1.25)
    L, R = L * 0.89, R * 0.89
    pcm = (np.stack([L, R], axis=1) * 32767).astype(np.int16)
    out = HERE / "out" / "soundtrack.wav"
    with wave.open(str(out), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"wrote {out} ({DUR:.1f} s, {len(cues)} cues)")


if __name__ == "__main__":
    main()
