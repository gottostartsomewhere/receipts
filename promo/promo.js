// Receipts promo, 48 s at 1920x1080. Deterministic: window.renderFrame(t) draws the frame at t
// seconds, so render.mjs can capture any frame in any order. window.CUES is the list of sound
// cues that sound.py turns into the soundtrack, so picture and sound share one timeline.
// Art direction: a thermal receipt printer feeds the real Receipts screens out as paper over
// flat colour fields. Nothing rotates; shadows are hard and flat.
(() => {
  const W = 1920, H = 1080, WIPE = 0.38, SLOT = 112;
  let DUR = 48;
  const PENDING = [];
  const C = {
    ink: "#1c1c1a", paper: "#fcfcfa", red: "#b8322a", bright: "#e0533f", grey: "#55554f",
    tomato: "#c8452f", teal: "#2f6f6a", mustard: "#e0a526", indigo: "#3b3a8f", plum: "#7a3b5c", moss: "#4f6b3a",
  };
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, x) => a + (b - a) * x;
  const E = {
    out: (x) => 1 - Math.pow(1 - x, 3),
    in: (x) => x * x * x,
    inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    expo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  };
  const money = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const stage = document.getElementById("stage");
  const CUES = [];
  const cue = (t, type, o = {}) => CUES.push({ t: Math.round(t * 1000) / 1000, type, ...o });
  const IMGS = [];
  const UNITLESS = new Set(["opacity", "zIndex", "fontWeight", "lineHeight", "flexGrow"]);
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

  // ---------- scenes and the paper wipe between them ----------
  const scenes = [];
  function addScene(start, bg, fg, { wipe = true, ink = false } = {}) {
    const wrap = el("div", "scene", stage, { zIndex: scenes.length + 1 });
    const inner = el("div", "inner" + (ink ? " on-ink" : ""), wrap, { background: bg, color: fg });
    const teeth = el("div", "teeth", stage, { background: bg, zIndex: scenes.length + 1, display: "none" });
    const s = { start, wipe, wrap, inner, teeth, ups: [] };
    if (wipe) cue(start - WIPE, "whoosh", { dur: WIPE });
    scenes.push(s);
    return s;
  }

  // ---------- building blocks ----------
  function textLines(parent, texts, o) {
    const box = el("div", o.cls || "h1", parent, {
      position: "absolute", left: o.x, top: o.y, fontSize: o.size, width: o.w ?? "auto", textAlign: o.align || "left", ...(o.style || {}),
    });
    const spans = texts.map((tx) => el("span", "", el("span", "line", box), null, tx));
    const st = o.stagger ?? 0.08, dur = o.dur ?? 0.34;
    return (t) => {
      spans.forEach((sp, i) => {
        const a = o.at + i * st;
        let y = (1 - E.out(seg(t, a, a + dur))) * 112;
        if (o.out != null) {
          const b = o.out + i * 0.04;
          y -= E.in(seg(t, b, b + 0.24)) * 112;
        }
        sp.style.transform = `translate3d(0,${y.toFixed(2)}%,0)`;
      });
    };
  }

  function makePrinter(parent, { x, w, name = "RECEIPTS", led = C.bright, slot = SLOT }) {
    const root = el("div", "asm", parent);
    const body = el("div", "pbody", root, { left: x - 60, width: w + 120, top: -40, height: slot + 52 });
    el("span", "nm", body, null, name);
    const ledEl = el("span", "led", body, { background: led });
    const sheet = el("div", "sheet", root, { left: x, top: slot });
    const paper = el("div", "paper", sheet, { width: w, height: 0 });
    const content = el("div", "pcontent", paper);
    el("div", "slot", root, { left: x - 18, width: w + 36, top: slot - 9, height: 18 });
    return {
      root, paper, content, sheet, ledEl, x, w,
      len(L) {
        L = Math.max(0, Math.floor(L / 4) * 4); // the stepper motor feeds in small steps
        paper.style.height = L + "px";
        sheet.style.visibility = L > 2 ? "visible" : "hidden";
      },
      cam(y, dx = 0) {
        root.style.transform = `translate3d(${dx.toFixed(1)}px,${(-y).toFixed(1)}px,0)`;
      },
    };
  }

  // Slices of the captured app screens (shots are 880px wide, 2x) stacked into one receipt.
  function slices(content, w, parts, top = 22) {
    const s = w / 880;
    const wrap = el("div", "", content, { position: "relative", paddingTop: top });
    const at = [];
    let y = top;
    for (const p of parts) {
      const h = Math.round((p.y1 - p.y0) * s);
      const d = el("div", "slice", wrap, { height: h });
      img(d, p.src, { width: w, top: -Math.round(p.y0 * s) });
      at.push(y);
      y += h;
    }
    return { s, at, end: y };
  }

  function makeStub(parent, { label, value, note, x, y, w = 360, at }) {
    const wr = el("div", "stubw", parent, { left: x, top: y, opacity: 0 });
    el("div", "stub", wr, { width: w }, `<small>${label}</small><strong>${value}</strong><div class="rule"></div><em>${note}</em>`);
    cue(at, "stamp", { weight: 1 });
    return (t) => {
      const p = E.out(seg(t, at, at + 0.15));
      wr.style.opacity = t < at ? 0 : 1;
      wr.style.transform = `translate3d(0,${((1 - p) * -70).toFixed(1)}px,0) scale(${lerp(1.2, 1, p).toFixed(4)})`;
    };
  }

  function slam(node, at, from = 1.7, kind = "stamp") {
    cue(at, kind, { weight: kind === "stamp" ? 0.7 : 1 });
    node.style.opacity = 0;
    return (t) => {
      const p = E.out(seg(t, at, at + 0.11));
      node.style.opacity = t < at ? 0 : Math.min(1, p * 2.5);
      node.style.transform = `scale(${lerp(from, 1, p).toFixed(4)})`;
    };
  }

  // A baked "ON DEVICE" stamp in a screenshot: hidden under paper until it slams down.
  function deviceStamp(parent, s, rect, offY, at) {
    const [x0, y0, x1, y1] = rect;
    const box = { left: x0 * s - 2, top: offY + y0 * s - 2, width: (x1 - x0) * s + 4, height: (y1 - y0) * s + 4 };
    const cover = el("div", "cover", parent, box);
    const st = el("div", "mini-stamp", parent, { ...box, fontSize: 14 }, "ON DEVICE");
    const sl = slam(st, at, 2.1);
    return (t) => {
      sl(t);
      const landed = t >= at + 0.11;
      cover.style.display = landed ? "none" : "";
      st.style.display = landed ? "none" : "";
    };
  }

  function lineRule(p0, p1) {
    // paper length over time for a printer feeding a fixed length
    return (t) => lerp(p0.L, p1.L, E.inOut(seg(t, p0.t, p1.t)));
  }

  // =====================================================================================
  // A. 0-10 s. The printer prints a year of orders; the camera follows the paper down;
  //    the fees counter races up.
  // =====================================================================================
  let HEAD = 330;
  {
    const s = addScene(0, C.ink, C.paper, { wipe: false, ink: true });
    const pr = makePrinter(s.inner, { x: 640, w: 640, led: C.bright });
    const rc = el("div", "rc", pr.content);
    const r = rng(11);
    const pick = (xs) => xs[Math.floor(r() * xs.length)];
    const SHOPS = [
      { name: "SWIGGY", w: 0.55, items: ["MUTTON CHUKKA", "CHICKEN BIRYANI", "PAROTTA X2", "GHEE ROAST DOSA", "CHICKEN 65", "MINI TIFFIN", "WHOPPER MEAL", "FARMHOUSE PIZZA"], price: [180, 640],
        fees: (a) => [["PLATFORM FEE", 14.99], r() < 0.6 && ["PACKING CHARGES", 10 + Math.round(r() * 30)], r() < 0.35 && ["DELIVERY FEE", 25 + Math.round(r() * 20)], r() < 0.2 && ["LATE NIGHT FEE", 15 + Math.round(r() * 10)]] },
      { name: "BLINKIT", w: 0.25, items: ["MILK, EGGS, ONION", "MAGGI X12", "ATTA 5KG", "AMUL BUTTER", "COCA-COLA 750ML", "BREAD, TOMATO"], price: [40, 320],
        fees: (a) => [["HANDLING FEE", 2 + Math.round(r() * 9)], a < 150 && ["SMALL CART FEE", 20 + Math.round(r() * 15)], a < 200 && ["DELIVERY FEE", 25 + Math.round(r() * 5)], r() < 0.1 && ["RAIN FEE", 15 + Math.round(r() * 15)]] },
      { name: "BOOKMYSHOW", w: 0.08, items: ["2 TICKETS", "3 TICKETS"], price: [380, 900], fees: (a) => [["CONVENIENCE FEE", 60 + Math.round(r() * 40)]] },
      { name: "AMAZON", w: 0.12, items: ["WIRELESS MOUSE", "RUNNING SHOES", "NOTEBOOKS X6", "LED BULBS X4", "FACE SERUM"], price: [299, 3499], fees: () => [] },
    ];
    const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV"];
    let rows = "";
    // About as many orders as the paper gets through by 10 s, so the dates run JAN to NOV.
    const N = 50, SEEN = 43;
    for (let i = 0; i < N; i++) {
      let k = r(), shop = SHOPS[0];
      for (const sh of SHOPS) { if ((k -= sh.w) <= 0) { shop = sh; break; } }
      const amt = shop.price[0] + r() * (shop.price[1] - shop.price[0]);
      const doy = Math.min(329, Math.floor((i / SEEN) * 330 + r() * 5));
      const date = new Date(Date.UTC(2026, 0, 1 + doy));
      const day = String(date.getUTCDate()).padStart(2, "0");
      rows += `<p class="ln order"><span>${day} ${MONTHS[Math.min(10, date.getUTCMonth())]}  ${shop.name}</span><b>${amt.toFixed(2)}</b></p>`;
      rows += `<p class="ln" style="color:${C.grey}"><span>  ${pick(shop.items)}</span></p>`;
      for (const f of shop.fees(amt).filter(Boolean)) rows += `<p class="ln fee"><span>  + ${f[0]}</span><span>${f[1].toFixed(2)}</span></p>`;
    }
    rc.innerHTML = `<h2>RECEIPTS</h2><p class="sub">YOUR YEAR, ITEMISED</p><div class="dash"></div>
      <p class="kv"><span>STORE</span><span>THIS LAPTOP</span></p><p class="kv"><span>CASHIER</span><span>GEMINI NANO</span></p>
      <p class="kv"><span>DATE</span><span>27 NOV 2026</span></p><div class="dash" id="head-end"></div>
      <p class="ln colh"><span>DATE    SHOP</span><span>₹</span></p>${rows}`;

    const v0 = 95, k = 0.52, T0 = 3.5;
    const paperLen = (t) => {
      if (t < T0) return lerp(0, HEAD, E.inOut(seg(t, 0.45, 3.35)));
      return HEAD + (v0 / k) * (Math.exp(k * (t - T0)) - 1);
    };
    cue(0.45, "print", { dur: 2.9, r0: 7, r1: 7 });
    cue(T0, "print", { dur: 10 - T0, r0: 2.8, r1: 80 });

    // Left: captions and the fees counter
    const caps = [["EVERY ORDER.", 4.0], ["EVERY FEE.", 5.5], ["ON TOP.", 7.0], ["ADDED UP.", 8.5]];
    caps.forEach(([tx, at], i) => s.ups.push(textLines(s.inner, [tx], { x: 140, y: 250, size: 116, at, out: i < 3 ? caps[i + 1][1] - 0.12 : null })));
    s.ups.push(textLines(s.inner, ["FEES ON TOP, SO FAR"], { x: 144, y: 560, size: 24, at: 4.2, cls: "kick", style: { opacity: 0.7 } }));
    const counter = el("div", "h1", s.inner, { position: "absolute", left: 136, top: 600, fontSize: 176, color: C.bright, opacity: 0 });
    cue(4.3, "ticks", { dur: 5.65, r0: 5, r1: 34 });
    cue(8.0, "riser", { dur: 2.0 });
    s.ups.push((t) => {
      const L = paperLen(t);
      pr.len(L);
      const dx = lerp(0, 520, E.inOut(seg(t, 3.35, 4.15)));
      pr.cam(Math.max(0, SLOT + L - 960), dx);
      const p = Math.pow(seg(t, 4.3, 9.96), 1.7);
      counter.style.opacity = t < 4.3 ? 0 : 1;
      counter.textContent = money(10203 * p);
    });
  }

  // =====================================================================================
  // B. 10-14 s. The number.
  // =====================================================================================
  {
    const s = addScene(10, C.tomato, C.paper, { wipe: false });
    cue(10, "impact");
    cue(10.28, "ching");
    s.ups.push(textLines(s.inner, ["MY 2026 IN FEES"], { x: 146, y: 214, size: 28, at: 10.0, cls: "kick", dur: 0.2 }));
    const num = el("div", "h1", s.inner, { position: "absolute", left: 128, top: 250, fontSize: 300, transformOrigin: "0 60%" }, "₹10,203");
    s.ups.push((t) => {
      const p = E.out(seg(t, 10, 10.16));
      num.style.transform = `scale(${lerp(1.22, 1, p).toFixed(4)})`;
    });
    s.ups.push(textLines(s.inner, ["ON TOP OF WHAT", "I ACTUALLY BOUGHT."], { x: 142, y: 600, size: 84, at: 10.55 }));
    const stamp = el("div", "stamp", s.inner, { left: 146, top: 846, fontSize: 40, color: C.paper }, "NEVER ADDED UP");
    s.ups.push(slam(stamp, 11.85));
    s.ups.push(makeStub(s.inner, { label: "ORDERS WITH A FEE", value: "236", note: "OUT OF 275", x: 1420, y: 470, at: 12.6 }));
  }

  // =====================================================================================
  // C. 14-18 s. Every kind of fee, one per half beat.
  // =====================================================================================
  {
    const FEES = [
      [["PLATFORM", "FEE"], "PAID 175 TIMES.", "₹2,625", C.teal, C.paper],
      [["PACKING", "CHARGES"], "PAID 122 TIMES.", "₹2,909", C.mustard, C.ink],
      [["DELIVERY", "FEE"], "PAID 82 TIMES.", "₹2,711", C.indigo, C.paper],
      [["LATE NIGHT", "FEE"], "PAID 32 TIMES.", "₹627", C.plum, C.paper],
      [["HANDLING", "FEE"], "PAID 52 TIMES.", "₹321", C.moss, C.paper],
      [["CONVENIENCE", "FEE"], "PAID 9 TIMES.", "₹482", C.tomato, C.paper],
      [["SMALL CART", "FEE"], "PAID 9 TIMES.", "₹259", C.ink, C.paper],
      [["RAIN", "FEE"], "PAID 5 TIMES.", "₹96", C.teal, C.paper],
    ];
    const LINE_AMOUNTS = {
      PLATFORM: ["14.99"], PACKING: ["18.00", "25.00", "32.00", "12.00", "40.00"], DELIVERY: ["29.00", "35.00", "25.00", "42.00"],
      "LATE NIGHT": ["15.00", "22.00", "25.00"], HANDLING: ["4.00", "6.00", "9.00", "11.00", "2.00"], CONVENIENCE: ["70.80", "53.10", "84.96"],
      "SMALL CART": ["20.00", "35.00", "28.00"], RAIN: ["15.00", "25.00", "30.00"],
    };
    const fr = rng(3);
    FEES.forEach(([word, times, amt, bg, fg], i) => {
      const at = 14 + i * 0.5;
      const s = addScene(at, bg, fg, { wipe: false });
      cue(at, "slap", { i });
      // Right: a strip of receipt with this fee printed over and over.
      const strip = el("div", "sheet", s.inner, { left: 1200, top: -60, filter: "drop-shadow(16px 0 0 rgba(0,0,0,.22))" });
      const label = `+ ${word.join(" ")}`;
      const amts = LINE_AMOUNTS[word[0]];
      let lines = "";
      for (let n = 0; n < 30; n++) lines += `<p class="ln fee"><span>${label}</span><span>${amts[Math.floor(fr() * amts.length)]}</span></p>`;
      const paper = el("div", "rc", strip, { width: 600, height: 1300, background: C.paper, padding: "20px 44px", fontSize: 26, lineHeight: 1.62 }, lines);
      s.ups.push((t) => (paper.style.transform = `translate3d(0,${(-seg(t, at, at + 0.5) * 84).toFixed(1)}px,0)`));
      el("div", "kick", s.inner, { position: "absolute", left: 146, top: 150, fontSize: 24, opacity: 0.75 }, `EVERY KIND OF FEE   ${i + 1}/8`);
      // Size the word to the space left of the strip (monospace: 0.6em per letter).
      const longest = Math.max(...word.map((w) => w.length));
      const size = Math.min(196, Math.floor(980 / (longest * 0.6)));
      s.ups.push(textLines(s.inner, word, { x: 136, y: 250 + (196 - size) * 0.6, size, at, dur: 0.12, stagger: 0.03 }));
      s.ups.push(textLines(s.inner, [`${times} <b style="font-weight:700">${amt}</b>`], { x: 146, y: 760, size: 56, at: at + 0.08, dur: 0.14, cls: "subt" }));
    });
  }

  // =====================================================================================
  // D. 18-21 s. Title.
  // =====================================================================================
  {
    const s = addScene(18, C.paper, C.ink);
    const row = el("div", "", s.inner, { position: "absolute", left: 0, top: 300, width: W, display: "flex", justifyContent: "center", alignItems: "center", gap: 56 });
    const icon = img(row, "../public/icons/icon128.png", { width: 176, height: 176, display: "block", opacity: 0 });
    const word = el("div", "h1", row, { fontSize: 176, letterSpacing: "0.14em", lineHeight: 1 });
    const letters = [..."RECEIPTS"].map((ch, i) => el("span", "", word, { opacity: 0 }, ch));
    letters.forEach((_, i) => cue(18.12 + i * 0.09, "key", { v: 1.3 }));
    s.ups.push(slam(icon, 18.05, 1.5, "stamp"));
    s.ups.push((t) => letters.forEach((l, i) => (l.style.opacity = t >= 18.12 + i * 0.09 ? 1 : 0)));
    s.ups.push(textLines(s.inner, ["FINDS EVERY FEE YOU PAID ON TOP."], { x: 0, y: 580, w: W, align: "center", size: 60, at: 19.0 }));
    s.ups.push(textLines(s.inner, ["A CHROME EXTENSION. YOUR ORDERS ARE READ ON YOUR LAPTOP BY GEMINI NANO."], { x: 0, y: 690, w: W, align: "center", size: 26, at: 19.5, cls: "subt", style: { color: C.grey } }));
  }

  // =====================================================================================
  // LIVE. The real app, used: shops ticked, Nano reading, the fees receipt, Ask, approving
  // what leaves, the Wrapped, the ledger. Footage from footage.mjs, inside a browser window.
  // =====================================================================================
  const F = window.FOOTAGE;
  const TL = 21;
  const TJ = TL + F.duration;
  {
    const STEPS = [
      { key: "tick", bg: C.teal, h: ["TICK THE SHOPS", "YOU USE."], sub: ["AMAZON, SWIGGY, FLIPKART, BLINKIT,", "BOOKMYSHOW, OR ANY ORDER PAGE."] },
      { key: "read", bg: C.ink, h: ["GEMINI NANO", "READS THEM."], sub: ["ON YOUR LAPTOP, WITH YOUR OWN", "SIGN-IN. NOTHING IS UPLOADED."] },
      { key: "fees", bg: C.tomato, h: ["EVERY FEE,", "FOUND."], sub: ["BY APP, BY KIND, BY MONTH. AND", "WHETHER A MEMBERSHIP PAYS OFF."] },
      { key: "ask", bg: C.plum, h: ["ASK. GET AN", "EXACT ANSWER."], sub: ["NANO READS THE QUESTION. THE", "NUMBER IS COUNTED FROM YOUR ORDERS."] },
      { key: "approve", bg: C.mustard, fg: C.ink, h: ["YOU APPROVE", "WHAT LEAVES."], sub: ["14 ROUNDED FACTS. NO ITEM LIST,", "NO DATES, NO ADDRESSES."] },
      { key: "wrapped", bg: C.indigo, h: ["YOUR YEAR,", "WRAPPED."], sub: ["GEMINI WRITES THE JOKES. CARDS WITH", "REAL NAMES ARE DRAWN ON YOUR LAPTOP."] },
      { key: "ledger", bg: C.moss, h: ["A RECEIPT FOR", "THAT TOO."], sub: ["EVERY REQUEST THAT LEFT THIS", "DEVICE, WORD FOR WORD."] },
    ].map((st, i, all) => ({ ...st, i, t: TL + (i === 0 ? 0 : F.steps[st.key]) }));
    STEPS.forEach((st, i) => (st.end = i + 1 < STEPS.length ? STEPS[i + 1].t : TJ));

    const s = addScene(TL, STEPS[0].bg, C.paper);
    // Left: step number, headline and one line of what it means
    STEPS.forEach((st, i) => {
      const at = i === 0 ? TL + 0.15 : st.t + 0.04;
      const out = i + 1 < STEPS.length ? st.end - 0.2 : null;
      const color = st.fg || C.paper;
      s.ups.push(textLines(s.inner, [`${String(i + 1).padStart(2, "0")} / 07`], { x: 144, y: 300, size: 24, at, out, cls: "kick", dur: 0.25, style: { color, opacity: 0.75 } }));
      s.ups.push(textLines(s.inner, st.h, { x: 136, y: 346, size: 86, at, out, stagger: 0.07, style: { color } }));
      s.ups.push(textLines(s.inner, st.sub, { x: 142, y: 560, size: 27, at: at + 0.25, out, cls: "subt", stagger: 0.05, style: { color, opacity: 0.88 } }));
      if (i > 0) cue(st.t, "slap", { i: i + 2 });
    });
    s.ups.push((t) => {
      let cur = STEPS[0];
      for (const st of STEPS) if (t >= st.t) cur = st;
      s.inner.style.background = cur.bg;
    });

    // Right: a browser window with the footage in it
    const WW = F.width, WH = F.height + 84;
    const WX = W - 110 - WW, WY = Math.round((H - WH) / 2);
    const win = el("div", "win", s.inner, { left: WX, top: WY, width: WW, height: WH });
    win.innerHTML = `<div class="win-tabs"><div class="win-tab"><img src="../public/icons/icon32.png" alt=""><span>Receipts</span><b>&times;</b></div><div class="win-ctl"><i></i><i></i><i></i></div></div>
      <div class="win-bar"><span class="win-nav"><i></i><i></i><i></i></span><div class="win-omni">chrome-extension://receipts/app.html</div><img class="win-ext" src="../public/icons/icon32.png" alt=""></div>`;
    const view = img(win, "footage/frames/00001.jpg", { display: "block", width: WW, height: F.height });
    let shown = 1;
    s.ups.push((t) => {
      const p = E.out(seg(t, TL - 0.2, TL + 0.45));
      win.style.transform = `translate3d(0,${((1 - p) * 1000).toFixed(1)}px,0)`;
      const k = Math.max(1, Math.min(F.frames, Math.floor((t - TL) * F.fps) + 1));
      if (k !== shown) {
        shown = k;
        view.src = `footage/frames/${String(k).padStart(5, "0")}.jpg`;
        PENDING.push(view.decode().catch(() => {}));
      }
    });

    // Sounds of the app being used
    for (const e of F.events) {
      const t = TL + e.t;
      if (e.type === "click") cue(t, "click");
      else if (e.type === "key") cue(t, "key", { v: 0.55 });
      else if (e.type === "swipe") cue(t, "whoosh", { dur: 0.3 });
      else if (e.type === "feed") cue(TL + e.from, "print", { dur: e.to - e.from, r0: 3.5, r1: 3.5 });
    }
  }

  // =====================================================================================
  // END. The last receipt tears off; end card.
  // =====================================================================================
  DUR = TJ + 4.2;
  {
    const s = addScene(TJ, C.ink, C.paper, { ink: true });
    const pr = makePrinter(s.inner, { x: 610, w: 700, led: C.bright });
    const r = rng(5);
    let bars = "";
    for (let i = 0; i < 70; i++) bars += `<i style="width:${1 + Math.floor(r() * 4)}px;margin-right:${2 + Math.floor(r() * 4)}px"></i>`;
    el("div", "rc", pr.content, null, `<p class="sub" style="letter-spacing:.24em;padding-top:6px">TOTAL FEES FOUND</p>
      <h2 style="letter-spacing:0;padding:0;font-size:64px;margin-top:8px">₹10,203</h2><div class="dash"></div>
      <p class="sub" style="letter-spacing:.08em">THANK YOU FOR NOT UPLOADING YOUR LIFE</p>
      <div class="bars" style="justify-content:center;margin:24px 0 10px">${bars}</div><p class="sub" style="font-size:18px;padding-bottom:30px">RECEIPTS FOR CHROME</p>`);
    const T = (x) => TJ + x;
    cue(T(0.1), "print", { dur: 0.9, r0: 12, r1: 12 });
    cue(T(1.3), "tear");
    s.ups.push((t) => {
      pr.len(lerp(0, 452, E.inOut(seg(t, T(0.1), T(1.0)))));
      const fall = E.in(seg(t, T(1.32), T(1.95)));
      pr.sheet.style.transform = `translate3d(0,${(fall * 1150).toFixed(1)}px,0)`;
      // Once torn off, the piece has a torn edge at the top as well.
      const torn = t >= T(1.32) ? "var(--zz-both)" : "";
      pr.paper.style.webkitMask = torn;
      pr.paper.style.mask = torn;
    });
    const row = el("div", "", s.inner, { position: "absolute", left: 0, top: 390, width: W, display: "flex", justifyContent: "center", alignItems: "center", gap: 48 });
    const icon = img(row, "../public/icons/icon128.png", { width: 150, height: 150, display: "block" });
    const word = el("div", "h1", row, { fontSize: 150, letterSpacing: "0.14em", lineHeight: 1 });
    const letters = [..."RECEIPTS"].map((ch) => el("span", "", word, { opacity: 0 }, ch));
    letters.forEach((_, i) => cue(T(1.75) + i * 0.07, "key", { v: 1.1 }));
    s.ups.push(slam(icon, T(1.65), 1.5, "stamp"));
    s.ups.push((t) => letters.forEach((l, i) => (l.style.opacity = t >= T(1.75) + i * 0.07 ? 1 : 0)));
    s.ups.push(textLines(s.inner, ["SPENDING CALCULATOR &amp; HIDDEN FEE FINDER"], { x: 0, y: 610, w: W, align: "center", size: 52, at: T(2.35) }));
    s.ups.push(textLines(s.inner, ["FOR CHROME. READ ON YOUR LAPTOP BY GEMINI NANO."], { x: 0, y: 700, w: W, align: "center", size: 28, at: T(2.7), cls: "subt", style: { opacity: 0.75 } }));
    s.ups.push(textLines(s.inner, ["BUILT WITH GEMINI NANO AND FIREBASE AI LOGIC"], { x: 0, y: 960, w: W, align: "center", size: 20, at: T(3.05), cls: "kick", style: { opacity: 0.5 } }));
  }
  cue(DUR - 0.01, "end");

  // ---------- frame renderer ----------
  async function renderFrame(t) {
    drawFrame(t);
    // Footage frames load as the clock moves; never capture one half decoded.
    if (PENDING.length) await Promise.all(PENDING.splice(0));
  }

  function drawFrame(t) {
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i], next = scenes[i + 1];
      const from = s.start - (s.wipe ? WIPE : 0);
      const vis = t >= from && (!next || t < next.start);
      s.wrap.style.display = vis ? "" : "none";
      s.teeth.style.display = "none";
      if (!vis) continue;
      const p = s.wipe ? E.inOut(seg(t, from, s.start)) : 1;
      const h = Math.round(H * p);
      s.wrap.style.height = h + "px";
      if (p < 1) {
        s.teeth.style.display = "";
        s.teeth.style.top = h - 1 + "px";
      }
      for (const u of s.ups) u(t);
    }
  }

  window.CUES = CUES;
  window.DURATION = DUR;
  window.READY = (async () => {
    await document.fonts.ready;
    await Promise.all(IMGS.map((i) => i.decode().catch(() => console.warn("image failed", i.src))));
    const he = document.getElementById("head-end");
    HEAD = he.offsetTop + 40;
    window.renderFrame = renderFrame;
    const q = new URLSearchParams(location.search);
    await renderFrame(Number(q.get("t") || 0));
    return true;
  })();
})();
