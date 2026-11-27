"""Instruments and music for the Receipts videos, synthesised with numpy and scipy.

House-style: layered kick, 808-style hats, clap and snare with reverb, a sub plus filtered
bass, supersaw chord stabs and pads, a filtered pluck lead with delay, noise risers and
impacts. Everything is pure maths, so the soundtrack can be rebuilt with the cut.
"""

import numpy as np
from scipy import signal

SR = 48000
rng = np.random.default_rng(7)


def t_axis(d):
    return np.arange(int(round(d * SR))) / SR


def noise(d):
    return rng.standard_normal(int(round(d * SR)))


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, min(f, SR / 2 - 100), "low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, min(hi, SR / 2 - 100)], "band", fs=SR, output="sos"), x)


def sweep(x, f0, f1, kind="low", block=256, q_order=2):
    """A filter whose cutoff glides exponentially from f0 to f1 across x."""
    out = np.zeros_like(x)
    n = len(x)
    zi = None
    for start in range(0, n, block):
        p = start / max(1, n - 1)
        f = f0 * (f1 / f0) ** p
        if kind == "band":
            sos = signal.butter(q_order, [f * 0.7, min(f * 1.4, SR / 2 - 200)], "band", fs=SR, output="sos")
        else:
            sos = signal.butter(q_order, min(f, SR / 2 - 200), kind, fs=SR, output="sos")
        if zi is None or zi.shape[0] != sos.shape[0]:
            zi = np.zeros((sos.shape[0], 2))
        seg, zi = signal.sosfilt(sos, x[start : start + block], zi=zi)
        out[start : start + block] = seg
    return out


def env(d, a=0.005, decay=0.3, sustain=0.0, release=None):
    t = t_axis(d)
    e = np.clip(t / max(a, 1e-4), 0, 1) * (sustain + (1 - sustain) * np.exp(-t / decay))
    if release:
        e *= np.clip((d - t) / release, 0, 1)
    return e


def saw(freq, d, phase=0.0):
    t = t_axis(d)
    return 2 * ((freq * t + phase) % 1.0) - 1


def supersaw(freq, d, voices=7, detune=0.012):
    x = np.zeros(int(round(d * SR)))
    for k in range(voices):
        dt = (k - (voices - 1) / 2) / ((voices - 1) / 2) * detune
        x += saw(freq * (1 + dt), d, rng.uniform(0, 1))
    return x / voices


# ---------- drums ----------
def kick(punch=1.0):
    t = t_axis(0.55)
    f = 46 + 130 * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5)
    click = hp(noise(0.55), 2500) * np.exp(-t * 300) * 0.35
    return np.tanh((body * 1.4 + click) * punch) * 0.95


METAL = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0]) * 1.7


def hat(open_=False):
    d = 0.32 if open_ else 0.06
    t = t_axis(d)
    x = sum(np.sign(np.sin(2 * np.pi * f * t)) for f in METAL)
    x = hp(bp(x, 6500, 12000), 7000)
    return x * np.exp(-t / (0.09 if open_ else 0.014)) * 0.5


def clap():
    d = 0.4
    out = np.zeros(int(d * SR))
    for off in (0.0, 0.009, 0.019, 0.03):
        b = bp(noise(0.05), 900, 2600) * np.exp(-t_axis(0.05) * 160)
        i = int(off * SR)
        out[i : i + len(b)] += b
    tail = bp(noise(d), 900, 2400) * np.exp(-t_axis(d) * 11)
    return (out + tail * 0.5) * 0.7


def snare():
    d = 0.3
    t = t_axis(d)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
    nz = bp(noise(d), 1500, 7000) * np.exp(-t * 18)
    return (tone * 0.6 + nz) * 0.7


def crash(d=2.2):
    t = t_axis(d)
    x = sum(np.sign(np.sin(2 * np.pi * f * 1.3 * t + rng.uniform(0, 6))) for f in METAL) * 0.3 + noise(d)
    return hp(x, 4000) * np.exp(-t / 0.7) * 0.35


# ---------- tonal ----------
def sub_bass(freq, d):
    t = t_axis(d)
    x = np.sin(2 * np.pi * freq * t)
    return x * env(d, a=0.004, decay=0.25, sustain=0.6, release=0.03)


def mid_bass(freq, d, cutoff=700):
    x = lp(saw(freq * 2, d) + 0.5 * saw(freq * 2 * 1.005, d), cutoff, 4)
    return x * env(d, a=0.003, decay=0.12, sustain=0.3, release=0.03) * 0.6


def stab(freqs, d, cutoff=2600):
    x = sum(supersaw(f, d) for f in freqs) / len(freqs)
    x = lp(x, cutoff, 2)
    return x * env(d, a=0.003, decay=0.16, sustain=0.0, release=0.02)


def pad(freqs, d, cutoff=1400, attack=0.5):
    x = sum(supersaw(f, d, voices=5, detune=0.008) for f in freqs) / len(freqs)
    x = lp(x, cutoff, 2)
    return x * env(d, a=attack, decay=99, sustain=1.0, release=min(0.8, d / 2))


def pluck(freq, d):
    raw = saw(freq, d) + 0.6 * saw(freq * 1.004, d)
    bright, dark = lp(raw, 5200, 2), lp(raw, 900, 2)
    t = t_axis(d)
    return (bright * np.exp(-t / 0.05) + dark * np.exp(-t / 0.22)) * np.clip(t / 0.002, 0, 1) * 0.5


def riser(d):
    x = sweep(noise(d), 250, 9000, kind="band")
    t = t_axis(d)
    return x * (t / d) ** 2 * 0.9


def downlifter(d=1.2):
    x = sweep(noise(d), 6000, 200, kind="low")
    return x * np.exp(-t_axis(d) * 2.5) * 0.5


def impact():
    d = 2.6
    t = t_axis(d)
    boom = np.sin(2 * np.pi * (36 + 60 * np.exp(-t * 14)) * t) * np.exp(-t * 1.6)
    x = boom * 1.1 + crash(d) * 1.2 + lp(noise(d), 300) * np.exp(-t * 4) * 0.4
    k = kick(1.3)
    x[: len(k)] += k
    return np.tanh(x)


# ---------- effects for the picture ----------
def ui_click(v=1.0):
    t = t_axis(0.03)
    x = hp(noise(0.03), 3000) * np.exp(-t * 600) + np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 400) * 0.5
    return x * 0.6 * v


def key(v=1.0):
    t = t_axis(0.025)
    x = bp(noise(0.025), 2000, 9000) * np.exp(-t * 550) + np.sin(2 * np.pi * 220 * t) * np.exp(-t * 160) * 0.4
    return x * 0.55 * v


def pop():
    t = t_axis(0.09)
    f = 900 + 700 * np.exp(-t * 60)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 40) * 0.35


def whoosh(d=0.4):
    d += 0.15
    x = sweep(noise(d), 600, 5000, kind="band")
    t = t_axis(d)
    return x * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.6 * 0.6


def slam(i=0):
    """The hit under each fee amount in the cold open: kick, clap and a pitched thump."""
    k = kick(1.2)
    c = clap()
    t = t_axis(0.35)
    tone = np.sin(2 * np.pi * (110 + 12 * i) * t) * np.exp(-t * 12)
    out = np.zeros(max(len(k), len(c), len(t)))
    out[: len(k)] += k * 0.9
    out[: len(c)] += c * 0.6
    out[: len(tone)] += tone * 0.5
    return np.tanh(out * 1.2)


def ching():
    t = t_axis(1.5)
    x = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / dd) for f, a, dd in ((2093, 1.0, 0.8), (2637, 0.7, 0.6), (3136, 0.5, 0.5), (4186, 0.3, 0.35)))
    return x * np.clip(t / 0.002, 0, 1) * 0.25


def stamp(weight=1.0):
    t = t_axis(0.3)
    f = 55 + 80 * np.exp(-t * 40)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 15)
    smack = bp(noise(0.3), 200, 2200) * np.exp(-t * 55)
    return np.tanh((body + smack * 0.8) * (0.8 + 0.4 * weight)) * 0.8


# ---------- mixing helpers ----------
class Bus:
    def __init__(self, dur):
        self.n = int(dur * SR) + SR * 4
        self.L = np.zeros(self.n)
        self.R = np.zeros(self.n)

    def add(self, t, x, gain=1.0, pan=0.0):
        i = int(round(t * SR))
        if i < 0:
            x, i = x[-i:], 0
        if i >= self.n or len(x) == 0:
            return
        x = x[: self.n - i] * gain
        self.L[i : i + len(x)] += x * np.sqrt(0.5 * (1 - pan))
        self.R[i : i + len(x)] += x * np.sqrt(0.5 * (1 + pan))


def reverb_ir(d=1.8, tone=5000):
    t = t_axis(d)
    irs = []
    for _ in range(2):
        x = noise(d) * np.exp(-t / (d / 6.5))
        x = lp(x, tone, 1)
        x[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
        irs.append(x / np.sqrt(np.sum(x**2)))
    return irs


def reverb(bus, mix=0.2, d=1.8):
    irl, irr = reverb_ir(d)
    wl = signal.fftconvolve(bus.L, irl)[: bus.n]
    wr = signal.fftconvolve(bus.R, irr)[: bus.n]
    return bus.L + wl * mix, bus.R + wr * mix


def delay(bus, time, feedback=0.35, mix=0.25, taps=4):
    L, R = bus.L.copy(), bus.R.copy()
    d = int(time * SR)
    g = mix
    for k in range(1, taps + 1):
        src_l, src_r = (bus.R, bus.L) if k % 2 else (bus.L, bus.R)  # ping-pong
        L[d * k :] += src_l[: -d * k] * g
        R[d * k :] += src_r[: -d * k] * g
        g *= feedback
    return L, R


def compress(L, R, threshold=-14.0, ratio=3.0, attack=0.01, release=0.15):
    lvl = np.maximum(np.abs(L), np.abs(R))
    a, r = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR))
    # a fast envelope follower: attack and release as two one-pole smoothers over a peak hold
    env_a = signal.lfilter([1 - a], [1, -a], lvl)
    env_r = signal.lfilter([1 - r], [1, -r], lvl)
    e = np.maximum(env_a, env_r * 0.9) + 1e-9
    db = 20 * np.log10(e)
    over = np.maximum(0, db - threshold)
    gain = 10 ** (-(over * (1 - 1 / ratio)) / 20)
    return L * gain, R * gain


def master(L, R, target_peak=0.89):
    # gentle glue compression and a soft ceiling; final loudness is set to -14 LUFS at encode
    peak = max(np.max(np.abs(L)), np.max(np.abs(R))) or 1
    L, R = compress(L / peak, R / peak, threshold=-16.0, ratio=2.2, attack=0.015, release=0.2)
    peak = max(np.max(np.abs(L)), np.max(np.abs(R))) or 1
    drive = 1.08
    L, R = np.tanh(L / peak * drive) / np.tanh(drive), np.tanh(R / peak * drive) / np.tanh(drive)
    return L * target_peak, R * target_peak


# ---------- the arrangement ----------
CHORDS = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 261.63, 329.63], [196.0, 246.94, 293.66]]
ROOTS = [55.0, 43.65, 65.41, 49.0]
ARPS = [[440, 523.25, 659.25, 880], [349.23, 440, 523.25, 698.46], [392, 523.25, 659.25, 783.99], [392, 493.88, 587.33, 783.99]]


def music(dur, bpm, energy, drop, outro):
    """drop: when the full beat starts (after the cold open). outro: when it stops."""
    beat = 60 / bpm
    drums, tonal, lead = Bus(dur), Bus(dur), Bus(dur)
    K, HC, HO, CL, SN = kick(), hat(), hat(True), clap(), snare()
    kick_times = []
    n_beats = int(dur / beat) + 2
    for bi in range(n_beats):
        t = bi * beat
        if t >= outro:
            break
        bar = (bi // 4) % 4
        pre = t < drop - 1e-6
        if pre:
            # cold open: hats building, a snare roll into the drop
            steps = 2 if t < drop - 2 * beat else 4
            for s in range(steps):
                drums.add(t + s * beat / steps, HC, 0.18 + 0.25 * (t / max(drop, 1e-3)), pan=0.2)
            if t >= drop - 2 * beat:
                rolls = 4 if t < drop - beat else 8
                for s in range(rolls):
                    drums.add(t + s * beat / rolls, SN, 0.2 + 0.5 * (s / rolls), pan=-0.05)
            continue
        drums.add(t, K, 1.0)
        kick_times.append(t)
        if bi % 2 == 1:
            drums.add(t, CL, 0.5 if energy > 0.8 else 0.32, pan=0.04)
        hats = 4 if energy > 0.8 else 2
        for s in range(hats):
            ht = t + s * beat / hats
            if (hats == 4 and s == 2) or (hats == 2 and s == 1):
                drums.add(ht, HO, 0.3 if energy > 0.8 else 0.18, pan=0.25)
            else:
                drums.add(ht, HC, (0.32, 0.12, 0.2, 0.12)[s] if hats == 4 else 0.16, pan=-0.2 if s % 2 else 0.15)
        # fill at the end of every fourth bar
        if bi % 16 == 15 and energy > 0.8:
            for s in range(4):
                drums.add(t + s * beat / 4, SN, 0.25 + 0.1 * s, pan=-0.05)
        f = ROOTS[bar]
        # bass: sub on the off-eighth, a filtered octave above it
        tonal.add(t + beat / 2, sub_bass(f, beat * 0.45), 0.75)
        tonal.add(t + beat / 2, mid_bass(f, beat * 0.45, 600 + 600 * energy), 0.35)
        if bi % 4 == 0:
            if energy > 0.8:
                for off in (0.5, 1.5, 2.5, 3.5):
                    tonal.add(t + off * beat, stab(CHORDS[bar], beat * 0.5), 0.3, pan=-0.15)
            else:
                tonal.add(t, pad(CHORDS[bar], beat * 4.2, cutoff=1100, attack=0.4), 0.22, pan=-0.1)
        if energy > 0.8 and t >= drop + 8 * beat:
            for s in range(4):
                lead.add(t + s * beat / 4, pluck(ARPS[bar][(bi * 4 + s) % 4], beat * 0.45), 0.16, pan=0.3 if s % 2 else -0.3)
    # Cold open: a filtered pad swelling and a riser into the drop
    if drop > 0.5:
        d = drop + 0.1
        x = pad(CHORDS[0] + [440.0], d, cutoff=900, attack=d * 0.6)
        tonal.add(0, sweep(x, 400, 4000, kind="low"), 0.35)
        tonal.add(max(0, drop - 2.2), riser(min(2.2, drop)), 0.45)
        tonal.add(drop, impact(), 0.75)
        tonal.add(drop + 0.05, downlifter(), 0.3)
    # Sidechain pump on the tonal parts
    sc = np.ones(tonal.n)
    for kt in kick_times:
        i = int(kt * SR)
        m = int(0.24 * SR)
        curve = 1 - 0.6 * np.exp(-np.arange(m) / (0.075 * SR))
        end = min(tonal.n, i + m)
        sc[i:end] = np.minimum(sc[i:end], curve[: end - i])
    tonal.L *= sc
    tonal.R *= sc
    lead.L *= sc
    lead.R *= sc
    # Ending: an impact and a chord ringing out
    if outro < dur:
        d = dur - outro + 1.5
        tonal.add(outro, impact(), 0.7)
        tonal.add(outro, pad(CHORDS[0] + [440.0], d, cutoff=2200, attack=0.02), 0.3)
    # Space
    dl, dr = reverb(drums, 0.12, 1.2)
    tl, tr = reverb(tonal, 0.22, 2.0)
    ll, lr = delay(lead, beat * 0.75, 0.4, 0.3)
    lb = Bus(dur)
    lb.L, lb.R = ll, lr
    ll, lr = reverb(lb, 0.25, 1.8)
    L = dl + tl + ll
    R = dr + tr + lr
    return L, R
