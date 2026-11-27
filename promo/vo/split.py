"""Splits one voiceover take into the 23 lines of script.json, by the pauses between them.

    python promo/vo/split.py promo/vo/take/take.m4a

Writes promo/vo/real/<id>.wav. A take that isn't WAV is converted with ffmpeg first. Each line
is one piece of speech between pauses of a second or more; this is only right when every line
is read in order, so check the printed lengths against the script.
"""

import json
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
SR = 48000


def load(path):
    path = Path(path)
    if path.suffix.lower() != ".wav":
        ff = shutil.which("ffmpeg") or str(next(Path.home().glob("AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg*/*/bin/ffmpeg.exe")))
        wav = path.with_suffix(".converted.wav")
        subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), str(wav)], check=True)
        path = wav
    with wave.open(str(path), "rb") as w:
        sr, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    x = np.frombuffer(raw, dtype={2: np.int16, 4: np.int32}[sw]).astype(np.float64).reshape(-1, ch).mean(axis=1)
    return x / (np.max(np.abs(x)) or 1), sr


def pieces(x, sr, min_gap=1.1, floor_db=-38):
    win = int(sr * 0.02)
    env = np.sqrt(np.convolve(x * x, np.ones(win) / win, mode="same"))
    loud = 20 * np.log10(env + 1e-9) > floor_db
    out, start, quiet = [], None, 0
    for i in range(0, len(x), win):
        if loud[i]:
            if start is None:
                start = i
            quiet = 0
        elif start is not None:
            quiet += win
            if quiet >= min_gap * sr:
                out.append((start, i - quiet + win))
                start, quiet = None, 0
    if start is not None:
        out.append((start, len(x)))
    return [(a, b) for a, b in out if (b - a) / sr > 0.6]


def main(take):
    lines = json.loads((HERE / "script.json").read_text(encoding="utf-8"))
    x, sr = load(take)
    segs = pieces(x, sr)
    print(f"found {len(segs)} pieces for {len(lines)} lines")
    if len(segs) < len(lines):
        sys.exit("Fewer pieces than lines: leave longer pauses between lines, or record lines as separate files.")
    # A fluffed line is read again straight away, so walking backwards from the end and taking
    # one piece per line keeps the last reading of each. Extra pieces left at the start are
    # earlier attempts.
    chosen = list(range(len(segs) - len(lines), len(segs)))
    if len(segs) > len(lines):
        print(f"{len(segs) - len(lines)} extra piece(s) treated as retakes; check the lines below look right")
    out = HERE / "real"
    out.mkdir(exist_ok=True)
    for l, i in zip(lines, chosen):
        a, b = segs[i]
        a, b = max(0, a - int(0.12 * sr)), min(len(x), b + int(0.2 * sr))
        pcm = (x[a:b] * 0.95 * 32767).astype(np.int16)
        with wave.open(str(out / f"{l['id']}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes(pcm.tobytes())
        print(f"{l['id']}: {(b - a) / sr:.1f} s")


if __name__ == "__main__":
    main(sys.argv[1])
