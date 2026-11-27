// Receipts promo, 48 s at 1920x1080. Deterministic: window.renderFrame(t) draws the frame at t
// seconds, so render.mjs can capture any frame in any order. window.CUES is the list of sound
// cues that sound.py turns into the soundtrack, so picture and sound share one timeline.
// Art direction: a thermal receipt printer feeds the real Receipts screens out as paper over
// flat colour fields. Nothing rotates; shadows are hard and flat.
(() => {
  const W = 1920, H = 1080, DUR = 48, WIPE = 0.38, SLOT = 112;
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
      s.ups.push(textLines(s.inner, word, { x: 136, y: 250, size: 196, at, dur: 0.12, stagger: 0.03 }));
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

  // Shared layout for the product scenes: copy on the left, printer on the right.
  const PX = 1160, PW = 620;

  // =====================================================================================
  // E. 21-26 s. Gemini Nano reads on the laptop.
  // =====================================================================================
  {
    const s = addScene(21, C.teal, C.paper);
    s.ups.push(textLines(s.inner, ["GEMINI NANO, BUILT INTO CHROME"], { x: 144, y: 236, size: 24, at: 21.05, cls: "kick", style: { opacity: 0.8 } }));
    s.ups.push(textLines(s.inner, ["READ ON YOUR", "LAPTOP.", "NOT UPLOADED."], { x: 136, y: 286, size: 108, at: 21.15, stagger: 0.1 }));
    s.ups.push(textLines(s.inner, ["RECEIPTS OPENS YOUR ORDER", "PAGES WITH YOUR OWN SIGN-IN.", "GEMINI NANO READS THEM", "ON YOUR DEVICE."], { x: 142, y: 670, size: 27, at: 22.3, cls: "subt", stagger: 0.05, style: { opacity: 0.88 } }));
    const pr = makePrinter(s.inner, { x: PX, w: PW, led: C.teal });
    const sl = slices(pr.content, PW, [{ src: "../marketing/shots/reading.png", y0: 400, y1: 1560 }]);
    const ky = (y) => sl.at[0] + (y - 400) * sl.s; // paper y for an image y
    const STAMPS = [[415, 805, 559, 838], [371, 909, 515, 942], [487, 1013, 631, 1046], [357, 1117, 501, 1150], [415, 1221, 559, 1254], [415, 1325, 559, 1358]];
    const keys = [{ t: 21.3, L: 0 }, { t: 22.2, L: ky(748) }];
    cue(21.3, "print", { dur: 0.9, r0: 10, r1: 10 });
    STAMPS.forEach((rect, i) => {
      const t0 = 22.55 + i * 0.34;
      keys.push({ t: t0, L: ky(752 + 104 * i) }, { t: t0 + 0.14, L: ky(856 + 104 * i) });
      cue(t0, "print", { dur: 0.14, r0: 30, r1: 30 });
      s.ups.push(deviceStamp(pr.content, sl.s, rect, sl.at[0] - 400 * sl.s, t0 + 0.2));
    });
    keys.push({ t: 24.75, L: ky(1380) }, { t: 25.0, L: sl.end + 26 });
    cue(24.75, "print", { dur: 0.25, r0: 20, r1: 20 });
    s.ups.push((t) => {
      let L = 0;
      for (let i = 0; i < keys.length - 1; i++) if (t >= keys[i].t) L = lerp(keys[i].L, keys[i + 1].L, E.inOut(seg(t, keys[i].t, keys[i + 1].t)));
      if (t >= keys[keys.length - 1].t) L = keys[keys.length - 1].L;
      pr.len(L);
    });
    s.ups.push(makeStub(s.inner, { label: "ORDERS UPLOADED", value: "0", note: "275 READ ON THIS LAPTOP", x: 816, y: 716, at: 25.15 }));
  }

  // =====================================================================================
  // F. 26-31 s. The fees receipt.
  // =====================================================================================
  {
    const s = addScene(26, C.tomato, C.paper);
    s.ups.push(textLines(s.inner, ["THE FEES RECEIPT"], { x: 144, y: 236, size: 24, at: 26.05, cls: "kick", out: 29.3, style: { opacity: 0.8 } }));
    s.ups.push(textLines(s.inner, ["EVERY FEE.", "BY APP, BY KIND,", "BY MONTH."], { x: 136, y: 286, size: 100, at: 26.15, stagger: 0.1, out: 29.3 }));
    s.ups.push(textLines(s.inner, ["PLATFORM, DELIVERY, PACKING,", "HANDLING, CONVENIENCE. EACH ONE", "PRINTED ON YOUR OWN ORDERS."], { x: 142, y: 640, size: 27, at: 27.0, cls: "subt", stagger: 0.05, out: 29.3, style: { opacity: 0.88 } }));
    s.ups.push(textLines(s.inner, ["MEMBERSHIPS"], { x: 144, y: 236, size: 24, at: 29.6, cls: "kick", style: { opacity: 0.8 } }));
    s.ups.push(textLines(s.inner, ["WOULD SWIGGY", "ONE HAVE PAID", "FOR ITSELF?"], { x: 136, y: 286, size: 100, at: 29.65, stagger: 0.1 }));
    const pr = makePrinter(s.inner, { x: PX, w: PW, led: C.tomato });
    const sl = slices(pr.content, PW, [
      { src: "../marketing/shots/fees.png", y0: 118, y1: 1330 },
      { src: "../marketing/shots/fees-member.png", y0: 20, y1: 1120 },
    ]);
    const full = sl.end + 30;
    cue(26.25, "print", { dur: 1.3, r0: 11, r1: 11 });
    cue(27.6, "print", { dur: 2.7, r0: 9, r1: 9 });
    s.ups.push((t) => {
      const L = t < 27.6 ? lerp(0, 960, E.inOut(seg(t, 26.25, 27.55))) : lerp(960, full, E.inOut(seg(t, 27.6, 30.3)));
      pr.len(L);
      pr.cam(Math.max(0, SLOT + L - 1040));
    });
    s.ups.push(makeStub(s.inner, { label: "SWIGGY ONE", value: "₹2,660", note: "WORTH IT UNDER THIS A YEAR", x: 816, y: 700, at: 30.3 }));
  }

  // =====================================================================================
  // G. 31-36 s. Ask your receipts.
  // =====================================================================================
  {
    const s = addScene(31, C.plum, C.paper);
    s.ups.push(textLines(s.inner, ["ASK YOUR RECEIPTS"], { x: 144, y: 236, size: 24, at: 31.05, cls: "kick", style: { opacity: 0.8 } }));
    s.ups.push(textLines(s.inner, ["ASK ANYTHING.", "GET AN EXACT", "ANSWER."], { x: 136, y: 286, size: 108, at: 31.15, stagger: 0.1 }));
    s.ups.push(textLines(s.inner, ["GEMINI NANO READS THE", "QUESTION ON YOUR LAPTOP. THE", "NUMBER IS COUNTED FROM YOUR", "ORDERS, SO IT IS EXACT."], { x: 142, y: 670, size: 27, at: 32.0, cls: "subt", stagger: 0.05, style: { opacity: 0.88 } }));
    const pr = makePrinter(s.inner, { x: PX, w: PW, led: C.plum });
    const sl = slices(pr.content, PW, [
      { src: "../marketing/shots/ask.png", y0: 0, y1: 550 },
      { src: "../marketing/shots/ask.png", y0: 700, y1: 872 },
    ]);
    const S = sl.s, top = sl.at[0];
    // Typing into the real input: cover the placeholder, type the question.
    el("div", "cover", pr.content, { left: 54 * S, top: top + 222 * S, width: 648 * S, height: 56 * S });
    const typed = el("div", "", pr.content, { position: "absolute", left: 60 * S, top: top + 237 * S, fontSize: 19.6, lineHeight: 1, color: C.ink, zIndex: 5, whiteSpace: "pre" });
    const Q = "HOW MUCH DID I SPEND ON BIRYANI?";
    const T_TYPE = 32.25, PER = 0.042;
    for (let i = 0; i < Q.length; i++) if (Q[i] !== " ") cue(T_TYPE + i * PER, "key", { v: 0.6 });
    const press = el("div", "", pr.content, { position: "absolute", left: 710 * S, top: top + 218 * S, width: 113 * S, height: 67 * S, background: C.paper, zIndex: 5, opacity: 0 });
    cue(33.75, "click");
    s.ups.push(deviceStamp(pr.content, S, [175, 819, 319, 851], sl.at[1] - 700 * S, 34.55));
    cue(31.2, "print", { dur: 0.75, r0: 11, r1: 11 });
    cue(33.95, "print", { dur: 0.45, r0: 14, r1: 14 });
    s.ups.push((t) => {
      const n = Math.max(0, Math.min(Q.length, Math.floor((t - T_TYPE) / PER) + 1));
      const caret = t > 31.9 && t < 33.9 && Math.floor(t * 3) % 2 === 0;
      typed.textContent = (t >= T_TYPE ? Q.slice(0, n) : "") + (caret ? "_" : " ");
      press.style.opacity = t >= 33.75 && t < 33.87 ? 0.45 : 0;
      const L = t < 33.95 ? lerp(0, sl.at[1], E.inOut(seg(t, 31.2, 31.95))) : lerp(sl.at[1], sl.end + 30, E.inOut(seg(t, 33.95, 34.4)));
      pr.len(L);
    });
    s.ups.push(makeStub(s.inner, { label: "SPENT ON BIRYANI", value: "₹26,550", note: "ACROSS 50 ORDERS", x: 816, y: 700, at: 35.0 }));
  }

  // =====================================================================================
  // H. 36-40 s. The 14 facts: all that leaves.
  // =====================================================================================
  {
    const s = addScene(36, C.mustard, C.ink);
    s.ups.push(textLines(s.inner, ["PRIVATE BY DESIGN"], { x: 144, y: 236, size: 24, at: 36.05, cls: "kick", style: { opacity: 0.8 } }));
    s.ups.push(textLines(s.inner, ["14 ROUNDED", "FACTS. THAT IS", "ALL THAT LEAVES."], { x: 136, y: 286, size: 100, at: 36.15, stagger: 0.1 }));
    s.ups.push(textLines(s.inner, ["NO ITEM LIST. NO DATES.", "NO ADDRESSES. NO EXACT AMOUNTS.", "YOU SEE THE LIST AND SAY", "YES BEFORE ANYTHING IS SENT."], { x: 142, y: 640, size: 27, at: 37.0, cls: "subt", stagger: 0.05, style: { opacity: 0.88 } }));
    const pr = makePrinter(s.inner, { x: PX, w: PW, led: C.mustard });
    const sl = slices(pr.content, PW, [{ src: "../marketing/shots/home.png", y0: 1000, y1: 2178 }]);
    const S = sl.s, top = sl.at[0];
    const press = el("div", "", pr.content, { position: "absolute", left: 56 * S, top: top + (2072 - 1000) * S, width: 768 * S, height: 97 * S, background: C.paper, zIndex: 5, opacity: 0 });
    cue(38.3, "click");
    const stamp = el("div", "stamp", pr.content, { left: 0, top: top + 430, fontSize: 34, color: C.red, background: C.paper, textAlign: "center", lineHeight: 1.25 }, "SENT: 14 FACTS<br>NOTHING ELSE");
    stamp.style.left = (PW - 400) / 2 + "px";
    stamp.style.width = "400px";
    s.ups.push(slam(stamp, 38.65, 1.8));
    cue(36.2, "print", { dur: 1.8, r0: 12, r1: 12 });
    s.ups.push((t) => {
      press.style.opacity = t >= 38.3 && t < 38.42 ? 0.45 : 0;
      pr.len(lerp(0, sl.end + 30, E.inOut(seg(t, 36.2, 38.0))));
    });
  }

  // =====================================================================================
  // I. 40-44 s. Wrapped: story cards print side by side.
  // =====================================================================================
  {
    const s = addScene(40, C.indigo, C.paper);
    const CARDS = ["card-6.png", "card-2.png", "card-7.png", "card-12.png"];
    const w = 360, gap = 24, x0 = (W - (CARDS.length * w + (CARDS.length - 1) * gap)) / 2;
    const total = CARDS.length * w + (CARDS.length - 1) * gap;
    const root = el("div", "asm", s.inner);
    const body = el("div", "pbody", root, { left: x0 - 60, width: total + 120, top: -40, height: SLOT + 52 });
    el("span", "nm", body, null, "RECEIPTS WRAPPED");
    el("span", "led", body, { background: C.indigo });
    const scale = w / 856, h = Math.round(1530 * scale);
    const papers = CARDS.map((src, i) => {
      const sheet = el("div", "sheet", root, { left: x0 + i * (w + gap), top: SLOT });
      const paper = el("div", "paper", sheet, { width: w, height: 0 });
      img(paper, `../marketing/shots/${src}`, { display: "block", width: 1080 * scale, marginLeft: -112 * scale, marginTop: -200 * scale });
      el("div", "slot", root, { left: x0 + i * (w + gap) - 14, width: w + 28, top: SLOT - 9, height: 18 });
      const t0 = 40.15 + i * 0.5;
      cue(t0, "print", { dur: 0.42, r0: 26, r1: 26 });
      return { paper, sheet, t0 };
    });
    s.ups.push((t) => papers.forEach(({ paper, sheet, t0 }) => {
      const L = Math.floor(lerp(0, h - 4, E.inOut(seg(t, t0, t0 + 0.42))) / 4) * 4;
      paper.style.height = L + "px";
      sheet.style.visibility = L > 2 ? "visible" : "hidden";
    }));
    s.ups.push(textLines(s.inner, ["YOUR WRAPPED"], { x: x0 + 4, y: 812, size: 24, at: 42.25, cls: "kick", style: { opacity: 0.8 } }));
    s.ups.push(textLines(s.inner, ["YOUR YEAR, AS STORY CARDS."], { x: x0 - 4, y: 850, size: 76, at: 42.35 }));
    s.ups.push(textLines(s.inner, ["GEMINI WRITES THE JOKES FROM 14 ROUNDED TOTALS. CARDS WITH REAL NAMES ARE DRAWN ON YOUR LAPTOP."], { x: x0, y: 958, size: 24, at: 42.8, cls: "subt", style: { opacity: 0.85 } }));
  }

  // =====================================================================================
  // J. 44-48 s. The last receipt tears off; end card.
  // =====================================================================================
  {
    const s = addScene(44, C.ink, C.paper, { ink: true });
    const pr = makePrinter(s.inner, { x: 610, w: 700, led: C.bright });
    const r = rng(5);
    let bars = "";
    for (let i = 0; i < 70; i++) bars += `<i style="width:${1 + Math.floor(r() * 4)}px;margin-right:${2 + Math.floor(r() * 4)}px"></i>`;
    el("div", "rc", pr.content, null, `<p class="sub" style="letter-spacing:.24em;padding-top:6px">TOTAL FEES FOUND</p>
      <h2 style="letter-spacing:0;padding:0;font-size:64px;margin-top:8px">₹10,203</h2><div class="dash"></div>
      <p class="sub" style="letter-spacing:.08em">THANK YOU FOR NOT UPLOADING YOUR LIFE</p>
      <div class="bars" style="justify-content:center;margin:24px 0 10px">${bars}</div><p class="sub" style="font-size:18px;padding-bottom:30px">RECEIPTS FOR CHROME</p>`);
    cue(44.1, "print", { dur: 0.9, r0: 12, r1: 12 });
    cue(45.3, "tear");
    s.ups.push((t) => {
      pr.len(lerp(0, 452, E.inOut(seg(t, 44.1, 45.0))));
      const fall = E.in(seg(t, 45.32, 45.95));
      pr.sheet.style.transform = `translate3d(0,${(fall * 1150).toFixed(1)}px,0)`;
      // Once torn off, the piece has a torn edge at the top as well.
      const torn = t >= 45.32 ? "var(--zz-both)" : "";
      pr.paper.style.webkitMask = torn;
      pr.paper.style.mask = torn;
    });
    const row = el("div", "", s.inner, { position: "absolute", left: 0, top: 390, width: W, display: "flex", justifyContent: "center", alignItems: "center", gap: 48 });
    const icon = img(row, "../public/icons/icon128.png", { width: 150, height: 150, display: "block" });
    const word = el("div", "h1", row, { fontSize: 150, letterSpacing: "0.14em", lineHeight: 1 });
    const letters = [..."RECEIPTS"].map((ch) => el("span", "", word, { opacity: 0 }, ch));
    letters.forEach((_, i) => cue(45.75 + i * 0.07, "key", { v: 1.1 }));
    s.ups.push(slam(icon, 45.65, 1.5, "stamp"));
    s.ups.push((t) => letters.forEach((l, i) => (l.style.opacity = t >= 45.75 + i * 0.07 ? 1 : 0)));
    s.ups.push(textLines(s.inner, ["SPENDING CALCULATOR &amp; HIDDEN FEE FINDER"], { x: 0, y: 610, w: W, align: "center", size: 52, at: 46.35 }));
    s.ups.push(textLines(s.inner, ["FOR CHROME. READ ON YOUR LAPTOP BY GEMINI NANO."], { x: 0, y: 700, w: W, align: "center", size: 28, at: 46.7, cls: "subt", style: { opacity: 0.75 } }));
    s.ups.push(textLines(s.inner, ["BUILT WITH GEMINI NANO AND FIREBASE AI LOGIC"], { x: 0, y: 960, w: W, align: "center", size: 20, at: 47.05, cls: "kick", style: { opacity: 0.5 } }));
  }
  cue(DUR - 0.01, "end");

  // ---------- frame renderer ----------
  function renderFrame(t) {
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
    renderFrame(Number(q.get("t") || 0));
    return true;
  })();
})();
