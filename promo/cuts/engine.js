// Editing engine shared by the promo and the 3-minute demo. Deterministic: window.renderFrame(t)
// draws time t. The footage is the real app filmed by film.mjs (window.REC); a cut file
// describes the edit with the calls below, and the engine draws it.
//
//   bg(t, colour, {wipe})                    background colour from t (a paper wipe if asked)
//   cam(t, target, dur)                      move the browser window: "side", "center", "off",
//                                            or { focus: rectName | rect, zoom, at: [x, y] }
//   footage(t0, t1, r0, r1)                  play recording time r0..r1 over cut time t0..t1
//   callout(t0, t1, rect, label)             red box round part of the footage, follows zooms
//   caption(t0, t1, lines, opts)             kinetic headline
//   sub(t0, t1, text)                        subtitle on a receipt strip
//   card(t0, t1, colour, build)              full-frame typography over everything
//   cue(t, type, opts)                       a sound cue for sound.py
(() => {
  const W = 1920, H = 1080, CHROME = 84, K = 1.25;
  const C = {
    ink: "#1c1c1a", paper: "#fcfcfa", red: "#c8452f", grey: "#55554f",
    tomato: "#c8452f", teal: "#2f6f6a", mustard: "#e0a526", indigo: "#3b3a8f", plum: "#7a3b5c", moss: "#4f6b3a",
  };
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, x) => a + (b - a) * x;
  const E = {
    out: (x) => 1 - Math.pow(1 - x, 3),
    in: (x) => x * x * x,
    inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    back: (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2),
  };
  const REC = window.REC;
  const stage = document.getElementById("stage");
  const CUES = [], PENDING = [], IMGS = [], UPS = [];
  const cue = (t, type, o = {}) => CUES.push({ t: Math.round(t * 1000) / 1000, type, ...o });
  const UNITLESS = new Set(["opacity", "zIndex", "fontWeight", "lineHeight"]);
  function el(tag, cls, parent, style, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (style) for (const [k, v] of Object.entries(style)) e.style[k] = typeof v === "number" && !UNITLESS.has(k) ? v + "px" : v;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function img(parent, src, style) {
    const i = el("img", "", parent, style);
    i.src = src;
    IMGS.push(i);
    return i;
  }
  const visible = (node, on) => (node.style.display = on ? "" : "none");

  // ---------- layers ----------
  const bgLayer = el("div", "layer", stage, { background: C.ink, zIndex: 0 });
  const wipeLayer = el("div", "layer", stage, { zIndex: 1, height: 0, display: "none" });
  const teeth = el("div", "teeth", stage, { zIndex: 1, display: "none" });
  const capLayer = el("div", "layer", stage, { zIndex: 3, background: "transparent" });
  const winGroup = el("div", "wgroup", stage, { zIndex: 2 });
  const cardLayer = el("div", "layer", stage, { zIndex: 6, background: "transparent", pointerEvents: "none" });
  const subLayer = el("div", "layer", stage, { zIndex: 8, background: "transparent" });

  // ---------- background ----------
  const BG = [{ t: -1, colour: C.ink, wipe: false }];
  function bg(t, colour, { wipe = false, dur = 0.38 } = {}) {
    BG.push({ t, colour, wipe, dur });
    BG.sort((a, b) => a.t - b.t);
    if (wipe) cue(t - dur, "whoosh", { dur });
  }
  UPS.push((t) => {
    let cur = BG[0], prev = BG[0];
    for (const b of BG) if (t >= b.t - (b.wipe ? b.dur : 0)) { prev = cur; cur = b; }
    if (cur.wipe && t < cur.t) {
      const p = E.inOut(seg(t, cur.t - cur.dur, cur.t));
      bgLayer.style.background = prev.colour;
      visible(wipeLayer, true);
      visible(teeth, true);
      wipeLayer.style.background = cur.colour;
      teeth.style.background = cur.colour;
      const h = Math.round(H * p);
      wipeLayer.style.height = h + "px";
      teeth.style.top = h - 1 + "px";
    } else {
      bgLayer.style.background = cur.colour;
      visible(wipeLayer, false);
      visible(teeth, false);
    }
  });

  // ---------- the browser window with the footage ----------
  const FW = Math.round(REC.w * K), FH = Math.round(REC.h * K);
  const win = el("div", "win", winGroup, { width: FW, height: FH + CHROME });
  win.innerHTML = `<div class="win-tabs"><div class="win-tab"><img src="../../public/icons/icon32.png" alt=""><span>Receipts</span><b>&times;</b></div><div class="win-ctl"><i></i><i></i><i></i></div></div>
    <div class="win-bar"><span class="win-nav"><i></i><i></i><i></i></span><div class="win-omni">chrome-extension://receipts/app.html</div><img class="win-ext" src="../../public/icons/icon32.png" alt=""></div>`;
  const view = img(win, `../footage/raw/${REC.frames[0][1]}`, { display: "block", width: FW, height: FH });
  const overlay = el("div", "", win, { position: "absolute", left: 0, top: CHROME, width: FW, height: FH, overflow: "visible" });
  const badge = el("div", "speed", winGroup, { display: "none" });

  const rectOf = (r) => (typeof r === "string" ? REC.rects.find((x) => x.name === r) : r);
  const LAYOUTS = {
    side: { X: 950, Y: 43, S: 1 },
    center: { X: (W - FW) / 2, Y: 43, S: 1 },
    off: { X: 950, Y: H + 80, S: 1 },
    offcenter: { X: (W - FW) / 2, Y: H + 80, S: 1 },
  };
  function resolve(target) {
    if (typeof target === "string") return LAYOUTS[target];
    const r = rectOf(target.focus);
    if (!r) throw new Error("no rect " + JSON.stringify(target.focus));
    const box = target.box ?? [1240, 600];
    const Z = target.zoom ?? clamp(Math.min(box[0] / r.w, box[1] / r.h), K, 2.3);
    const S = Z / K;
    const [px, py] = target.at ?? [W / 2, 470];
    const cx = (r.x + r.w / 2) * K, cy = CHROME + (r.y + r.h / 2) * K;
    return { X: px - S * cx, Y: py - S * cy, S };
  }
  const CAM = [{ t: -1, dur: 0, to: LAYOUTS.off }];
  function cam(t, target, dur = 0.7) {
    CAM.push({ t, dur, to: resolve(target) });
    CAM.sort((a, b) => a.t - b.t);
  }
  let camS = 1;
  UPS.push((t) => {
    let i = 0;
    for (let k = 0; k < CAM.length; k++) if (t >= CAM[k].t) i = k;
    const k = CAM[i], from = i > 0 ? CAM[i - 1].to : k.to;
    const p = k.dur > 0 ? E.inOut(seg(t, k.t, k.t + k.dur)) : 1;
    const X = lerp(from.X, k.to.X, p), Y = lerp(from.Y, k.to.Y, p), S = lerp(from.S, k.to.S, p);
    camS = S;
    winGroup.style.transform = `translate3d(${X.toFixed(2)}px,${Y.toFixed(2)}px,0) scale(${S.toFixed(5)})`;
    // keep borders and labels a constant size on screen while zooming
    overlay.style.setProperty("--inv", (1 / S).toFixed(5));
  });

  const SEGS = [];
  function footage(t0, t1, r0, r1, { maxSpeed = 99 } = {}) {
    if (typeof r0 === "string") r0 = REC.marks[r0];
    if (typeof r1 === "string") r1 = REC.marks[r1];
    const speed = Math.min(maxSpeed, (r1 - r0) / (t1 - t0));
    SEGS.push({ t0, t1, r0, r1, speed });
  }
  const recTimeAt = (t) => {
    let s = null;
    for (const x of SEGS) if (t >= x.t0 && t < x.t1) s = x;
    if (!s) {
      // hold the last frame of the most recent segment
      for (const x of SEGS) if (t >= x.t1 && (!s || x.t1 > s.t1)) s = x;
      if (!s) return { r: SEGS.length ? SEGS[0].r0 : 0, speed: 1 };
      return { r: Math.min(s.r1, s.r0 + (s.t1 - s.t0) * s.speed), speed: 1 };
    }
    return { r: Math.min(s.r1, s.r0 + (t - s.t0) * s.speed), speed: s.speed };
  };
  const frameAt = (r) => {
    let lo = 0, hi = REC.frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (REC.frames[mid][0] <= r) lo = mid;
      else hi = mid - 1;
    }
    return REC.frames[lo][1];
  };
  let shownFile = REC.frames[0][1];
  UPS.push((t) => {
    const { r, speed } = recTimeAt(t);
    const f = frameAt(r);
    if (f !== shownFile) {
      shownFile = f;
      view.src = `../footage/raw/${f}`;
      PENDING.push(view.decode().catch(() => {}));
    }
    const fast = speed >= 1.6;
    visible(badge, fast);
    if (fast) badge.textContent = `${Math.round(speed)}X SPEED`;
  });

  // ---------- callouts ----------
  function callout(t0, t1, rect, label, { pad = 8, below = false } = {}) {
    const r = rectOf(rect);
    if (!r) throw new Error("no rect " + rect);
    const box = el("div", "callout", overlay, { left: (r.x - pad) * K, top: (r.y - pad) * K, width: (r.w + pad * 2) * K, height: (r.h + pad * 2) * K, display: "none" });
    const tag = label ? el("div", "callout-tag" + (below ? " below" : ""), box, null, label) : null;
    cue(t0 + 0.05, "tick2");
    UPS.push((t) => {
      const on = t >= t0 && t < t1;
      visible(box, on);
      if (!on) return;
      const p = E.out(seg(t, t0, t0 + 0.25));
      const q = E.in(seg(t, t1 - 0.18, t1));
      box.style.opacity = (Math.min(1, p * 1.6) * (1 - q)).toFixed(3);
      box.style.borderWidth = (4 / camS).toFixed(3) + "px";
      box.style.transform = `scale(${lerp(1.08, 1, p).toFixed(4)})`;
      if (tag) tag.style.transform = `scale(${(1 / camS).toFixed(4)})`;
    });
  }

  // ---------- type ----------
  function textLines(parent, texts, o) {
    const box = el("div", o.cls || "h1", parent, {
      position: "absolute", left: o.x, top: o.y, fontSize: o.size, width: o.w ?? "auto", textAlign: o.align || "left", color: o.color, ...(o.style || {}),
    });
    const spans = texts.map((tx) => el("span", "", el("span", "line", box), null, tx));
    const st = o.stagger ?? 0.07, dur = o.dur ?? 0.32;
    return (t) => {
      const on = t >= o.at - 0.01 && (o.out == null || t < o.out + 0.5);
      visible(box, on);
      if (!on) return;
      spans.forEach((sp, i) => {
        const a = o.at + i * st;
        let y = (1 - E.out(seg(t, a, a + dur))) * 112;
        if (o.out != null) {
          const b = o.out + i * 0.035;
          y -= E.in(seg(t, b, b + 0.22)) * 112;
        }
        sp.style.transform = `translate3d(0,${y.toFixed(2)}%,0)`;
      });
    };
  }
  function caption(t0, t1, lines, o = {}) {
    const x = o.x ?? 136, y = o.y ?? 330, size = o.size ?? 86, color = o.color ?? C.paper;
    if (o.kicker) UPS.push(textLines(capLayer, [o.kicker], { x: x + 8, y: y - 52, size: 24, at: t0, out: t1 - 0.25, cls: "kick", color, style: { opacity: 0.75 } }));
    UPS.push(textLines(capLayer, lines, { x, y, size, at: t0 + 0.04, out: t1 - 0.25, color, w: o.w, align: o.align }));
    if (o.sub) UPS.push(textLines(capLayer, o.sub, { x: x + 6, y: y + lines.length * size * 1.04 + 34, size: o.subSize ?? 27, at: t0 + 0.25, out: t1 - 0.25, cls: "subt", stagger: 0.05, color, style: { opacity: 0.88 } }));
  }

  // Subtitles: the voiceover, on a strip of receipt paper, split into readable pieces.
  const subBox = el("div", "subw", subLayer, { display: "none" });
  const subText = el("div", "sub", subBox);
  const SUBS = [];
  function sub(t0, t1, text) {
    const words = text.toUpperCase().split(" ");
    const chunks = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > 84 && cur) {
        chunks.push(cur.trim());
        cur = w;
      } else cur += " " + w;
    }
    if (cur.trim()) chunks.push(cur.trim());
    const total = chunks.reduce((n, c) => n + c.length, 0);
    let a = t0;
    for (const c of chunks) {
      const b = a + ((t1 - t0) * c.length) / total;
      SUBS.push({ t0: a, t1: b, text: c });
      a = b;
    }
  }
  UPS.push((t) => {
    const s = SUBS.find((x) => t >= x.t0 && t < x.t1 + 0.12);
    visible(subBox, !!s);
    if (s && subText.textContent !== s.text) subText.textContent = s.text;
  });

  // A list printed line by line on a strip of paper: rows [[left, right, colour?]], times [t].
  function printed(parent, { x, y, w, size = 27, rows, times, last = null }) {
    const wrap = el("div", "sheetw", parent, { left: x, top: y, opacity: 0 });
    const p = el("div", "paper", wrap, { width: w, padding: "28px 36px", fontSize: size, lineHeight: 1.85 });
    const els = rows.map(([k, v, colour], i) =>
      el("div", "row", p, { opacity: 0, color: colour || C.ink, fontWeight: i === last ? 700 : 400 }, `<span>${k}</span><span>${v ?? ""}</span>`),
    );
    return (t) => {
      wrap.style.opacity = t >= times[0] - 0.12 ? 1 : 0;
      els.forEach((r, i) => (r.style.opacity = t >= times[i] ? 1 : 0));
    };
  }

  // Full-frame typography cards
  function card(t0, t1, colour, build, { wipe = false } = {}) {
    const box = el("div", "layer", cardLayer, { background: colour, display: "none" });
    const ups = [];
    build({ box, at: t0, end: t1, add: (u) => ups.push(u), lines: (texts, o) => ups.push(textLines(box, texts, o)), printed: (o) => ups.push(printed(box, o)) });
    if (wipe) cue(t0 - 0.36, "whoosh", { dur: 0.36 });
    UPS.push((t) => {
      const from = wipe ? t0 - 0.36 : t0;
      const on = t >= from && t < t1;
      visible(box, on);
      if (!on) return;
      if (wipe) {
        const p = E.inOut(seg(t, t0 - 0.36, t0));
        box.style.clipPath = p < 1 ? `inset(0 0 ${((1 - p) * 100).toFixed(2)}% 0)` : "";
      }
      for (const u of ups) u(t);
    });
    return box;
  }

  // ---------- render ----------
  async function renderFrame(t) {
    for (const u of UPS) u(t);
    if (PENDING.length) await Promise.all(PENDING.splice(0));
  }

  window.ENG = { W, H, K, CHROME, C, E, clamp, seg, lerp, el, img, cue, CUES, UPS, bg, cam, footage, callout, caption, textLines, sub, card, rectOf, REC };
  window.ENG_READY = async (duration) => {
    window.CUES = CUES;
    window.DURATION = duration;
    await document.fonts.ready;
    await Promise.all(IMGS.map((i) => i.decode().catch(() => console.warn("image failed", i.src))));
    window.renderFrame = renderFrame;
    const q = new URLSearchParams(location.search);
    await renderFrame(Number(q.get("t") || 0));
    window.READY_DONE = true;
  };
})();
