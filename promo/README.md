# Promo and demo videos

Two cuts of the real app, made from code so they can be re-made after any change.

- `out/receipts-promo.mp4`: about 42 seconds, music only, for the store listing and sharing.
- `out/receipts-demo.mp4`: about 2:40, voiceover and subtitles, for the hackathon.

## Pipeline

1. **Screens for the store images**: `node marketing/capture.mjs` (built app served at :4173).
2. **Footage**: `node promo/film.mjs` films the app being used, with real Gemini Nano, into `promo/footage/` (about 9 minutes; Nano really reads the demo store and labels a full sample year).
3. **Voiceover**: `promo/vo/script.json` holds the lines. `promo/vo/tts.ps1` makes a placeholder voice; `promo/vo/split.py <take>` cuts a real recording into lines (see `vo/RECORD.md`); `python promo/vo/timing.py` times whichever exists.
4. **Frames**: `node promo/render.mjs frames 5 --page cuts/promo.html --out promo` (and `cuts/demo.html --out demo`). The cuts are deterministic HTML (`cuts/engine.js` plus `promo.cut.js` / `demo.cut.js`): zooms, callouts, captions and subtitles over the footage.
5. **Check the overlays** before rendering: `node promo/render.mjs check --page cuts/demo.html --out demo` reports, every 0.1 s, any caption, subtitle or printed list touching the browser window, another text block or the frame edge, and any callout covered by text or running off the frame. Then `python promo/check_align.py demo` compares the pixels under every callout and zoom with the frame its position was measured on: "MOVED" means the page shifted under it, "content" means the app updated in place (typing, a list filling, cards swiping).
6. **Sound**: `python promo/mix.py promo` (and `demo`) synthesises the music and effects from the cut's own cue list and mixes in the voiceover.
7. **Encode**: ffmpeg, frames plus sound to H.264/AAC.

## Gemini Nano in the filming browser

`film.mjs` runs Chrome from `promo/.chrome-nano/`, a throwaway profile (git-ignored) holding:

- a copy of the on-device model from `%LOCALAPPDATA%\Google\Chrome\User Data\OptGuideOnDeviceModel\<version>`,
- the `optimization_guide` section of that folder's `Local State` (which model is installed, the GPU's performance class),
- the variations seed files (`Variations`, `VariationsSeedV2`, `VariationsSafeSeedV2`).

Chrome is launched without Playwright's default switches (they disable field trials and component updates, which turns Nano off). `node promo/nano-check.mjs` checks that it works.
