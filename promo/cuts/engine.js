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
  // pinned to the frame, not the window, so a zoom can't push it out of view
  const badge = el("div", "speed", stage, { display: "none", zIndex: 5 }); // under full-frame cards

  const rectOf = (r) => (typeof r === "string" ? REC.rects.find((x) => x.name === r) : r);
  const LAYOUTS = {
    side: { X: 950, Y: 43, S: 1 },
    center: { X: (W - FW) / 2, Y: 43, S: 1 },
    off: { X: 950, Y: H + 80, S: 1 },
    offcenter: { X: (W - FW) / 2, Y: H + 80, S: 1 },
  };
  // The frame is split: text lives in a column on the left (x < TEXT_RIGHT), the window lives
  // to the right of it. A zoom may grow the window, but never into the text column; when the
  // focused part wouldn't fit, the zoom is reduced instead.
  const TEXT_RIGHT = 880;
  function resolve(target) {
    if (typeof target === "string") return LAYOUTS[target];
    const r = rectOf(target.focus);
    if (!r) throw new Error("no rect " + JSON.stringify(target.focus));
    const free = !!target.zone; // a cut with no text beside the window may use the whole frame
    const [zx0, zx1] = target.zone ?? [TEXT_RIGHT + 20, W - 60]; // room for a callout's pop
    const pad = 14;
    let Z = Math.min(target.zoom ?? 1.8, (zx1 - zx0) / (r.w + pad * 2), (H - 80) / (r.h + pad * 2));
    const px = target.at?.[0] ?? (zx0 + zx1) / 2;
    const py = target.at?.[1] ?? 520;
    let X = px - Z * (r.x + r.w / 2);
    if (!free && X < TEXT_RIGHT) {
      X = TEXT_RIGHT; // the window's left edge stays out of the text column...
      const right = X + Z * (r.x + r.w + pad);
      if (right > zx1) Z = (zx1 - X) / (r.x + r.w + pad); // ...and the focused part still fits
    }
    const S = Z / K;
    return { X, Y: py - S * CHROME - Z * (r.y + r.h / 2), S };
  }
  const CAM = [{ t: -1, dur: 0, to: LAYOUTS.off }];
  function cam(t, target, dur = 0.7) {
    CAM.push({ t, dur, to: resolve(target), focus: typeof target === "string" ? null : rectOf(target.focus) });
    CAM.sort((a, b) => a.t - b.t);
  }
  let camS = 1, camX = 0, camMoving = false;
  UPS.push((t) => {
    let i = 0;
    for (let k = 0; k < CAM.length; k++) if (t >= CAM[k].t) i = k;
    const k = CAM[i], from = i > 0 ? CAM[i - 1].to : k.to;
    const p = k.dur > 0 ? E.inOut(seg(t, k.t, k.t + k.dur)) : 1;
    const X = lerp(from.X, k.to.X, p), Y = lerp(from.Y, k.to.Y, p), S = lerp(from.S, k.to.S, p);
    camS = S;
    camX = X;
    camMoving = k.dur > 0 && t < k.t + k.dur && (from.X !== k.to.X || from.Y !== k.to.Y || from.S !== k.to.S);
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
    // shown only while the window is clear of the text column, where the badge sits
    const fast = speed >= 1.6 && camX >= TEXT_RIGHT - 1;
    visible(badge, fast);
    if (fast) badge.textContent = `${Math.round(speed)}X SPEED`;
  });

  // ---------- callouts ----------
  const CALLOUTS = [];
  function callout(t0, t1, rect, label, { pad = 8, below = false } = {}) {
    const r = rectOf(rect);
    if (!r) throw new Error("no rect " + rect);
    const box = el("div", "callout", overlay, { left: (r.x - pad) * K, top: (r.y - pad) * K, width: (r.w + pad * 2) * K, height: (r.h + pad * 2) * K, display: "none" });
    const tag = label ? el("div", "callout-tag" + (below ? " below" : ""), box, null, label) : null;
    CALLOUTS.push({ t0, t1, r, label: label || "", box, tag });
    cue(t0 + 0.05, "tick2");
    UPS.push((t) => {
      // a callout only shows once the camera has settled on what it points at
      const on = t >= t0 && t < t1 && !camMoving;
      visible(box, on);
      if (!on) return;
      const p = E.out(seg(t, t0, t0 + 0.25));
      const q = E.in(seg(t, t1 - 0.18, t1));
      box.style.opacity = (Math.min(1, p * 1.6) * (1 - q)).toFixed(3);
      box.style.borderWidth = (4 / camS).toFixed(3) + "px";
      box.style.transform = `scale(${lerp(1.04, 1, p).toFixed(4)})`;
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
  // Text in the left column is sized so its longest line fits before the window's area.
  // Monospace: every character is 0.6em wide, plus any letter spacing.
  const TEXT_W = TEXT_RIGHT - 136 - 44;
  const plain = (s) => s.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "&");
  const fit = (lines, size, perChar = 0.6, width = TEXT_W) => Math.min(size, Math.floor(width / (Math.max(...lines.map((l) => plain(l).length)) * perChar)));
  function caption(t0, t1, lines, o = {}) {
    const x = o.x ?? 136, y = o.y ?? 330, color = o.color ?? C.paper;
    const size = o.w ? o.size ?? 86 : fit(lines, o.size ?? 86);
    if (o.kicker) {
      // the kicker is a small paper label above the headline
      const chip = el("div", "chip", capLayer, { left: x + 6, top: y - 62, fontSize: fit([o.kicker], 22, 0.78, TEXT_W - 40), display: "none" }, o.kicker);
      UPS.push((t) => {
        const on = t >= t0 && t < t1;
        visible(chip, on);
        if (!on) return;
        const p = E.out(seg(t, t0, t0 + 0.25)), q = E.in(seg(t, t1 - 0.25, t1 - 0.05));
        chip.style.opacity = (p * (1 - q)).toFixed(3);
        chip.style.transform = `translate3d(${((1 - p) * -30).toFixed(1)}px,0,0)`;
      });
    }
    UPS.push(textLines(capLayer, lines, { x, y, size, at: t0 + 0.04, out: t1 - 0.25, color, w: o.w, align: o.align }));
    if (o.sub) UPS.push(textLines(capLayer, o.sub, { x: x + 6, y: y + lines.length * size * 1.04 + 34, size: fit(o.sub, o.subSize ?? 27), at: t0 + 0.25, out: t1 - 0.25, cls: "subt", stagger: 0.05, color, style: { opacity: 0.88 } }));
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
      if ((cur + " " + w).trim().length > 80 && cur) {
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

  // ---------- cold open: fees slam in on the beat, a rush of them, then the year's total ----------
  const rupees = (n) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  function coldOpen({ slams, rush, total, totalValue }) {
    let run = 0;
    slams.forEach((s, i) => {
      run += s.value;
      const sofar = run;
      const t1 = i + 1 < slams.length ? slams[i + 1].t : rush.t0;
      cue(s.t, "slap", { i });
      card(s.t, t1, s.bg, ({ box, add, lines }) => {
        const chip = el("div", "chip", box, { left: 144, top: 250, color: C.ink }, `${s.shop}&nbsp;&nbsp;${s.label}`);
        const amt = "+" + rupees(s.value);
        const size = Math.min(300, Math.floor((TEXT_RIGHT + 300) / (amt.length * 0.6)));
        lines([amt], { x: 128, y: 330, size, at: s.t, dur: 0.1, color: s.fg });
        const so = el("div", "kick", box, { position: "absolute", left: 144, top: 880, color: s.fg, fontSize: 26 }, `ON TOP SO FAR&nbsp;&nbsp;${rupees(Math.round(sofar * 100) / 100)}`);
        add((tt) => {
          const p = E.out(seg(tt, s.t, s.t + 0.12));
          chip.style.transform = `translate3d(0,${((1 - p) * -24).toFixed(1)}px,0)`;
          chip.style.opacity = p;
          so.style.opacity = tt >= s.t + 0.05 ? 0.8 : 0;
        });
      });
    });
    // the rush: fee lines printing faster than you can read, the running total spinning up
    card(rush.t0, rush.t1, C.ink, ({ box, add }) => {
      const strip = el("div", "sheetw bleed", box, { left: 1180, top: -30 });
      const paper = el("div", "", strip, { width: 600, height: 1160, background: C.paper, padding: "20px 40px", fontSize: 25, lineHeight: 1.6, overflow: "hidden" });
      const POOL = [["SWIGGY PLATFORM FEE", "14.99"], ["PACKING CHARGES", "28.00"], ["DELIVERY FEE", "35.00"], ["HANDLING FEE", "9.00"], ["SMALL CART FEE", "25.00"], ["CONVENIENCE FEE", "70.80"], ["LATE NIGHT FEE", "22.00"], ["RAIN FEE", "15.00"], ["PLATFORM FEE", "14.99"], ["PACKING CHARGES", "32.00"]];
      const N = 26;
      const rows = Array.from({ length: N }, (_, k) => el("div", "row", paper, { color: C.red, opacity: 0 }, `<span>+ ${POOL[k % POOL.length][0]}</span><span>${POOL[k % POOL.length][1]}</span>`));
      const num = el("div", "h1", box, { position: "absolute", left: 128, top: 330, fontSize: 250, color: C.paper });
      el("div", "chip", box, { left: 144, top: 250, color: C.ink }, "ADDING IT UP");
      const from = run, d = rush.t1 - rush.t0;
      rows.forEach((_, k) => cue(rush.t0 + (k / N) * d * 0.95, "key", { v: 0.35 }));
      add((tt) => {
        const p = seg(tt, rush.t0, rush.t1);
        rows.forEach((r, k) => (r.style.opacity = p * 0.95 >= k / N ? 1 : 0));
        num.textContent = rupees(Math.round(from + (totalValue - from) * Math.pow(p, 2.2)));
      });
    });
    // the drop: the year's total
    card(total.t0, total.t1, C.ink, ({ box, add, lines }) => {
      el("div", "chip", box, { left: 144, top: 250, color: C.ink }, "ONE YEAR OF FEES, ON TOP");
      const big = el("div", "h1", box, { position: "absolute", left: 128, top: 330, fontSize: 300, color: C.paper, transformOrigin: "0 60%" }, rupees(totalValue));
      lines(["NOBODY ADDS THEM UP."], { x: 140, y: 680, size: 72, at: total.t0 + (total.t1 - total.t0) * 0.25, color: C.red });
      lines(["RECEIPTS DOES."], { x: 140, y: 770, size: 72, at: total.t0 + (total.t1 - total.t0) * 0.55, color: C.paper });
      add((tt) => {
        const p = E.out(seg(tt, total.t0, total.t0 + 0.16));
        big.style.transform = `scale(${lerp(1.25, 1, p).toFixed(4)})`;
      });
    });
  }

  // ---------- render ----------
  async function renderFrame(t) {
    for (const u of UPS) u(t);
    if (PENDING.length) await Promise.all(PENDING.splice(0));
  }

  // ---------- overlay check: what is on screen at t, in frame pixels ----------
  const shown = (node) => {
    for (let n = node; n && n !== stage; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false;
    }
    return true;
  };
  const box = (r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  async function check(t) {
    await renderFrame(t);
    const out = { t, texts: [], callouts: [], window: null, cover: false, rec: recTimeAt(t).r, frame: shownFile };
    // a full-frame card hides the window
    for (const c of cardLayer.children) if (shown(c) && c.style.background && !/transparent/.test(c.style.background) && !c.style.clipPath) out.cover = true;
    if (!out.cover && shown(winGroup)) out.window = box(win.getBoundingClientRect());
    if (!out.cover && shown(badge)) {
      out.badge = box(badge.getBoundingClientRect());
      out.texts.push({ kind: "badge", ...out.badge, text: badge.textContent });
    }
    // text that is actually showing: the part of each line inside its clipping line box
    const lineBoxes = (root) => {
      const parts = [];
      for (const ln of root.querySelectorAll(".line")) {
        const sp = ln.firstElementChild;
        if (!sp || !shown(ln)) continue;
        const a = ln.getBoundingClientRect(), b = sp.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(sp);
        const tr = range.getBoundingClientRect();
        const x0 = Math.max(a.left, tr.left), x1 = Math.min(a.right, tr.right), y0 = Math.max(a.top, b.top), y1 = Math.min(a.bottom, b.bottom);
        if (x1 - x0 > 2 && y1 - y0 > 4) parts.push({ x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0), text: sp.textContent.slice(0, 40) });
      }
      return parts;
    };
    if (!out.cover) for (const p of lineBoxes(capLayer)) out.texts.push({ kind: "caption", ...p });
    const chips = (root, kind) => {
      for (const ch of root.querySelectorAll(".chip")) if (shown(ch)) out.texts.push({ kind, ...box(ch.getBoundingClientRect()), text: ch.textContent.slice(0, 40) });
    };
    if (!out.cover) chips(capLayer, "kicker");
    for (const c of cardLayer.children) if (shown(c)) chips(c, "chip");
    for (const c of cardLayer.children) if (shown(c)) {
      for (const p of lineBoxes(c)) out.texts.push({ kind: "card", ...p });
      for (const s of c.querySelectorAll(".sheetw")) if (shown(s)) out.texts.push({ kind: "list", bleed: s.classList.contains("bleed"), ...box(s.getBoundingClientRect()), text: s.textContent.slice(0, 40) });
    }
    if (shown(subBox)) out.texts.push({ kind: "subtitle", ...box(subText.getBoundingClientRect()), text: subText.textContent.slice(0, 40) });
    if (!out.cover)
      for (const c of CALLOUTS) {
        if (!shown(c.box)) continue;
        out.callouts.push({
          label: c.label, box: box(c.box.getBoundingClientRect()), tag: c.tag ? box(c.tag.getBoundingClientRect()) : null,
          rect: { x: c.r.x, y: c.r.y, w: c.r.w, h: c.r.h }, refT: c.r.t, refFrame: c.r.t != null ? frameAt(c.r.t) : null,
        });
      }
    let k = 0;
    for (let i = 0; i < CAM.length; i++) if (t >= CAM[i].t) k = i;
    const f = CAM[k].focus;
    if (f && t >= CAM[k].t + CAM[k].dur && f.t != null) out.focus = { rect: { x: f.x, y: f.y, w: f.w, h: f.h }, name: f.name, refFrame: frameAt(f.t) };
    return out;
  }
  window.ENG_CHECK = check;

  window.ENG = { W, H, K, CHROME, C, E, clamp, seg, lerp, el, img, cue, CUES, UPS, bg, cam, footage, callout, caption, textLines, sub, card, coldOpen, rectOf, REC };
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
