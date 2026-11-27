// The 3-minute demo for the judges: the real app (filmed by film.mjs, real Gemini Nano), with
// zooms, callouts and subtitles, timed to the voiceover in promo/vo (window.VO).
(() => {
  const { W, C, E, seg, lerp, el, cue, bg, cam, footage, callout, caption, textLines, sub, card, REC } = ENG;
  const M = REC.marks;
  const R = (name) => REC.rects.find((r) => r.name === name);

  // ---------- voiceover timeline ----------
  const GAP = { intro: 0.5, "fees-list": 0.35, drip: 0.6, tabs: 0.55, ground: 0.5, labels: 0.6, member: 0.6, ask: 0.6, cards: 0.45, ledger: 0.7, split2: 0.5 };
  const L = {};
  let t = 1.1;
  window.VO.forEach((v, i) => {
    L[v.id] = { t0: t, t1: t + v.dur, text: v.text, i };
    cue(t, "vo", { file: v.file, start: v.start, dur: v.dur });
    sub(t, t + v.dur, v.text);
    t += v.dur + (GAP[v.id] ?? 0.42);
  });
  const ids = window.VO.map((v) => v.id);
  const next = (id) => L[ids[L[id].i + 1]];
  // Visuals change a beat before the voice does
  const A = (id) => L[id].t0 - 0.2;
  const B = (id) => (next(id) ? next(id).t0 - 0.2 : L[id].t1 + 3.2);
  const phrase = (id, s) => L[id].t0 + ((L[id].t1 - L[id].t0) * Math.max(0, L[id].text.indexOf(s))) / L[id].text.length;
  const END = L.close.t1 + 3.4;

  // A stretch of footage, and a way to find when a moment of the recording shows in the cut.
  function shot(t0, t1, r0, r1, { maxSpeed = 99, sounds = true } = {}) {
    footage(t0, t1, r0, r1, { maxSpeed });
    const speed = Math.min(maxSpeed, (r1 - r0) / (t1 - t0));
    const cut = (r) => t0 + (r - r0) / speed;
    if (sounds && speed <= 2.6)
      for (const e of REC.events) if (e.t >= r0 && e.t <= r1) cue(cut(e.t), e.type === "key" ? "key" : e.type === "swipe" ? "whoosh" : "click", e.type === "swipe" ? { dur: 0.3 } : { v: 0.5 });
    return { cut, speed };
  }
  const RIGHT = [1400, 470];

  // =========== 1. Intro: what Receipts is ===========
  bg(0, C.ink);
  {
    const a = 0, b = B("intro");
    cam(0, "off", 0);
    cam(0.25, "side", 0.8);
    const s = shot(a, a + 2.2, M.fees - 0.4, M.fees + 1.8);
    callout(s.cut(R("fee-total").t) + 0.6, b, "fee-total", "FEES ON TOP", { pad: 6 });
    caption(0.4, b, ["RECEIPTS"], { size: 150, y: 320, kicker: "FOR CHROME", sub: ["A SPENDING CALCULATOR AND", "HIDDEN FEE FINDER. YOUR ORDERS", "ARE READ ON YOUR LAPTOP."] });
    cue(0.25, "whoosh", { dur: 0.5 });
  }

  // =========== 2. Fees nobody adds up ===========
  {
    const a = A("fees-list"), b = B("fees-list");
    const id = "fees-list";
    const WORDS = [
      ["PLATFORM", "FEES.", "Platform", C.teal, C.paper, "14.99"],
      ["PACKING", "CHARGES.", "Packing", C.mustard, C.ink, "28.00"],
      ["DELIVERY.", null, "Delivery", C.indigo, C.paper, "35.00"],
      ["HANDLING.", null, "handling", C.plum, C.paper, "9.00"],
      ["SMALL CART.", null, "small cart", C.moss, C.paper, "25.00"],
      ["EVEN RAIN.", null, "even rain", C.tomato, C.paper, "15.00"],
    ];
    const times = WORDS.map((w) => Math.max(a, phrase(id, w[2]) - 0.15));
    const tail = phrase(id, "Each one");
    WORDS.forEach((w, i) => {
      const t0 = times[i], t1 = i + 1 < WORDS.length ? times[i + 1] : tail - 0.1;
      cue(t0, "slap", { i });
      card(t0, t1, w[3], ({ box, lines }) => {
        lines(w[1] ? [w[0], w[1]] : [w[0]], { x: 136, y: 300, size: 170, at: t0, dur: 0.14, stagger: 0.04, color: w[4] });
        el("div", "kick", box, { position: "absolute", left: 144, top: 230, color: w[4], opacity: 0.75 }, `FEE ${i + 1} OF 6, ON TOP OF THE FOOD`);
        // a strip of bill with this fee printed again and again
        const strip = el("div", "sheetw bleed", box, { left: 1240, top: -40 }); // runs off top and bottom on purpose
        let rows = "";
        for (let k = 0; k < 26; k++) rows += `<div class="row"><span>+ ${w[0].replace(/[.]/g, "")} ${w[1] ? w[1].replace(".", "") : "FEE"}</span><span>${w[5]}</span></div>`;
        el("div", "", strip, { width: 560, height: 1200, background: C.paper, color: C.red, padding: "24px 40px", fontSize: 25, lineHeight: 1.65 }, rows);
      });
    });
    // "Each one is a few rupees, so nobody adds them up."
    card(tail - 0.1, b, C.ink, ({ box, lines, add }) => {
      lines(["A FEW RUPEES", "AT A TIME."], { x: 136, y: 250, size: 110, at: tail, color: C.paper });
      lines(["NOBODY ADDS", "THEM UP."], { x: 136, y: 520, size: 110, at: phrase(id, "nobody"), color: C.red });
      const amounts = ["14.99", "28.00", "35.00", "9.00", "25.00", "15.00", "14.99", "32.00", "29.00", "6.00", "14.99", "40.00"];
      const col = el("div", "sheetw", box, { left: 1300, top: 140 });
      const paper = el("div", "paper", col, { width: 420, padding: "34px 40px", fontSize: 28, lineHeight: 1.6 });
      const rows = amounts.map((x) => el("div", "row", paper, { color: C.red, opacity: 0 }, `<span>+ FEE</span><span>${x}</span>`));
      const qm = el("div", "row", paper, { borderTop: "3px dashed #b9b9b2", marginTop: 12, paddingTop: 10, fontWeight: 700, opacity: 0 }, "<span>TOTAL</span><span>?</span>");
      add((tt) => {
        rows.forEach((r, k) => (r.style.opacity = tt >= tail + k * 0.12 ? 1 : 0));
        qm.style.opacity = tt >= tail + amounts.length * 0.12 + 0.2 ? 1 : 0;
      });
      amounts.forEach((_, k) => cue(tail + k * 0.12, "key", { v: 0.5 }));
    });
  }

  // =========== 3. Drip pricing ===========
  {
    const a = A("drip"), b = B("drip");
    card(a, b, C.tomato, ({ box, lines, add }) => {
      lines(["INDIA'S CONSUMER REGULATOR CALLS IT"], { x: 144, y: 300, size: 26, at: a + 0.1, cls: "kick", color: C.paper });
      const hit = Math.min(phrase("drip", "drip") - 0.1, a + 1.0);
      lines(["DRIP", "PRICING."], { x: 130, y: 350, size: 230, at: hit, stagger: 0.08, color: C.paper });
      const st = el("div", "stamp", box, { left: 1180, top: 760, fontSize: 40, color: C.paper }, "FEES ADDED AT CHECKOUT");
      const at = hit + 0.9;
      cue(at, "stamp");
      add((tt) => {
        const p = E.out(seg(tt, at, at + 0.12));
        st.style.opacity = tt < at ? 0 : 1;
        st.style.transform = `scale(${lerp(1.7, 1, p)})`;
      });
    }, { wipe: true });
  }

  // =========== 4. A shop's order page ===========
  {
    const a = A("shop"), b = B("shop");
    bg(a, C.teal, { wipe: true });
    cam(a - 0.3, "side", 0.01);
    const s = shot(a, a + 4.9, M.shop + 0.3, M.shop + 5.2);
    const z = s.cut(R("shop-charges").t + 0.2);
    cam(z, { focus: "shop-charges", zoom: 2.0, at: [1420, 470] }, 0.8);
    callout(z + 0.85, b, "shop-charges", "FEES ON THIS ORDER", { pad: 6, below: true }); // after the zoom lands
    caption(a + 0.05, b, ["THE FEES ARE", "RIGHT THERE."], { kicker: "A SHOP'S ORDER PAGE", sub: ["DELIVERY FEE, SERVICE FEE,", "PRINTED UNDER EACH ORDER."] });
  }

  // =========== 5. Tick the shops, or any shop's page ===========
  {
    const a = A("tick"), b = B("tick");
    bg(a, C.mustard, { wipe: true });
    cam(a, "side", 0.6);
    const s = shot(a, a + 7.6, M.start, M.start + 7.6);
    const z = s.cut(R("shops").t + 0.2);
    cam(z, { focus: "shops", zoom: 1.7, at: [1420, 470] }, 0.7);
    callout(z + 0.5, s.cut(R("shops-all").t - 0.8), "shops", "YOUR SHOPS", { pad: 6, below: true });
    cam(s.cut(R("shops-all").t - 0.6), "side", 0.7);
    caption(a + 0.05, b, ["TICK THE", "SHOPS YOU USE."], { color: C.ink, kicker: "YOUR SHOPS", sub: ["AMAZON, SWIGGY, FLIPKART,", "BLINKIT, BOOKMYSHOW AND MORE."] });

    const a2 = A("any"), b2 = B("any");
    const s2 = shot(a2, b2, M.start + 8.2, M["start-end"]);
    const z2 = s2.cut(R("any-shop").t + 0.1);
    cam(Math.max(a2, z2 - 0.3), { focus: "any-shop", zoom: 2.0, at: [1420, 470] }, 0.6);
    callout(z2 + 0.3, b2, "any-shop", "OR ANY ORDER PAGE", { pad: 6 });
    caption(a2 + 0.05, b2, ["OR ANY SHOP'S", "ORDER PAGE."], { color: C.ink, kicker: "ANY OTHER SHOP", sub: ["OPEN ITS ORDER HISTORY AND", "CLICK THE RECEIPTS ICON."] });

    // Background tabs, your own sign-in: printed as a receipt
    const a3 = A("tabs"), b3 = B("tabs");
    cam(a3, "side", 0.6);
    caption(a3 + 0.05, b3, ["YOUR SIGN-IN."], { color: C.ink, kicker: "IN A BACKGROUND TAB", y: 300 });
    card(a3, b3, "transparent", ({ printed }) => {
      const ROWS = [["AMAZON.IN", "OPENED"], ["SWIGGY", "OPENED"], ["FLIPKART", "OPENED"], ["BLINKIT", "OPENED"], ["UPLOADED", "NOTHING", C.red]];
      const times = ROWS.map((_, i) => a3 + 0.5 + i * 0.45);
      times.forEach((x, i) => cue(x, i === 4 ? "stamp" : "key", { v: 0.7, weight: 0.6 }));
      printed({ x: 136, y: 420, w: 640, size: 28, rows: ROWS, times, last: 4 });
    });
  }

  // =========== 6. Gemini Nano reads the demo store, on the laptop ===========
  {
    const a = A("nano"), b = B("nano");
    bg(a, C.ink, { wipe: true });
    cam(a, "side", 0.5);
    const s0 = shot(a, a + 1.9, M.demo, M.demo + 1.9);
    callout(a + 0.3, Math.min(a + 1.4, s0.cut(M["demo-read"]) - 0.15), "nano-ready", "GEMINI NANO: READY", { pad: 6 });
    // The read itself: about four minutes, shown fast with a speed badge
    const READ = { x: 152, y: 250, w: 384, h: 460, t: R("tally").t };
    shot(a + 1.9, b, M.demo + 1.9, M.demo + 40);
    cam(a + 2.4, { focus: READ, zoom: 1.55, at: [1420, 500] }, 0.8);
    caption(a + 0.05, b, ["GEMINI NANO", "READS IT."], { kicker: "ON THIS LAPTOP", sub: ["THE MODEL BUILT INTO CHROME.", "NO SERVER, NO UPLOAD."] });

    const a2 = A("extract"), b2 = B("extract");
    shot(a2, b2, M.demo + 40, M.demo + 95);
    callout(a2 + 0.2, b2, { x: 152, y: 400, w: 384, h: 300, t: M.demo + 60 }, "ORDERS, DATES, TOTALS, FEES", { pad: 6 });
    caption(a2 + 0.05, b2, ["EVERY ORDER,", "DATE, TOTAL", "AND FEE."], { kicker: "PULLED OFF THE PAGE" });

    // Grounding: each order checked against the page
    const a3 = A("ground"), b3 = B("ground");
    shot(a3, b3, M.demo + 95, M["demo-items"]);
    cam(a3, "side", 0.6);
    caption(a3 + 0.05, b3, ["CHECKED AGAINST", "THE PAGE."], { kicker: "NOTHING MADE UP", size: 76, y: 250 });
    card(a3, b3, "transparent", ({ printed }) => {
      const ROWS = [
        ["THE TOTAL", "ON THE PAGE", "total"],
        ["AN ITEM", "ON THE PAGE", "an item"],
        ["THE DATE", "ON THE PAGE", "the date"],
        ["EACH FEE", "INSIDE ITS ORDER", "a fee only"],
        ["MADE UP", "DROPPED", "Anything Nano"],
      ];
      const times = ROWS.map((r) => phrase("ground", r[2]));
      times.forEach((x, i) => cue(x, i === 4 ? "stamp" : "key", { v: 0.8, weight: 0.6 }));
      printed({ x: 136, y: 470, w: 700, rows: ROWS.map(([k, v], i) => [k, v, i === 4 ? C.red : null]), times, last: 4 });
    });

    const a4 = A("labels"), b4 = B("labels");
    const s4 = shot(a4, b4 - 0.6, M["demo-items"], M["demo-home"] - 0.3);
    cam(a4 + 0.1, { focus: "feed-items", zoom: 1.8, at: [1400, 500] }, 0.7);
    callout(a4 + 1.5, b4, { x: 380, y: 425, w: 160, h: 300, t: R("feed-items").t }, "ON DEVICE", { pad: 4 });
    caption(a4 + 0.05, b4, ["MESSY NAMES,", "MADE READABLE."], { kicker: "LABELLED BY NANO", sub: ["EVERY LABEL STAMPED", "ON DEVICE."] });
    shot(b4 - 0.6, b4, M["demo-home"] - 0.3, M["demo-home"] + 0.3);
  }

  // =========== 7. A full year, and the fees receipt ===========
  {
    const a = A("year"), b = B("year");
    bg(a, C.tomato, { wipe: true });
    cam(a, "side", 0.5);
    shot(a, a + 2.6, M["sample-items"], M["sample-home"]);
    // stop before the page scrolls on to the tabs, so the zoom stays on the summary
    const s = shot(a + 2.6, a + 4.4, M["sample-home"], M["sample-home"] + 1.8);
    const z = s.cut(R("sample-summary").t);
    cam(z, { focus: "sample-summary", zoom: 1.9, at: [1400, 470] }, 0.7);
    callout(z + 0.5, b, "sample-summary", "A FULL SAMPLE YEAR", { pad: 6 });
    caption(a + 0.05, b, ["275 ORDERS.", "₹10,203", "IN FEES."], { kicker: "A FULL SAMPLE YEAR" });

    const a2 = A("receipt"), b2 = B("member");
    const s2 = shot(a2, b2, M.fees - 0.2, M["fees-end"]);
    // Zoom in where the page is still; pull back while it scrolls; zoom in again where it stops.
    const ft = R("fee-total").t, mt = R("month-chart").t, bt = R("membership").t;
    const z1 = s2.cut(ft);
    cam(Math.max(a2, z1 - 0.4), { focus: "fee-total", zoom: 2.1, at: [1400, 470] }, 0.6);
    callout(z1 + 0.2, s2.cut(ft + 1.2), "fee-total", "FEES ON TOP", { pad: 6 });
    cam(s2.cut(ft + 1.25), "side", 0.5);
    cam(s2.cut(mt - 0.35), { focus: "month-chart", zoom: 1.9, at: [1400, 470] }, 0.5);
    callout(s2.cut(mt) + 0.2, s2.cut(mt + 1.15), "month-chart", "BY MONTH", { pad: 6 });
    cam(s2.cut(mt + 1.2), "side", 0.5);
    const MEM = { x: 152, y: 400, w: 384, h: 300, t: bt };
    const z3 = s2.cut(bt);
    cam(s2.cut(bt - 0.35), { focus: MEM, zoom: 1.7, at: [1400, 470] }, 0.5);
    callout(z3 + 0.25, b2, MEM, "WOULD SWIGGY ONE PAY OFF?", { pad: 6 });
    caption(a2 + 0.05, A("member"), ["BY APP.", "BY KIND.", "BY MONTH."], { kicker: "THE FEES RECEIPT" });
    caption(A("member") + 0.05, b2, ["WOULD A", "MEMBERSHIP", "PAY OFF?"], { kicker: "THE BREAK-EVEN" });
  }

  // =========== 8. Ask ===========
  {
    const a = A("ask"), b = B("ask");
    bg(a, C.plum, { wipe: true });
    cam(a, "side", 0.5);
    const enter = REC.events.filter((e) => e.type === "click" && e.t > M.ask + 2)[1]?.t ?? M.ask + 4.5;
    const ans = R("answer-1").t;
    const s1 = shot(a, a + 4.6, M.ask - 0.2, enter + 0.2);
    cam(s1.cut(R("ask-input").t) + 0.1, { focus: "ask-input", zoom: 2.0, at: [1400, 470] }, 0.6);
    shot(a + 4.6, a + 5.6, enter + 0.2, ans - 0.3, { sounds: false });
    const s3 = shot(a + 5.6, b, ans - 0.3, ans - 0.3 + (b - a - 5.6));
    cam(a + 5.4, { focus: "answer-1", zoom: 1.9, at: [1400, 470] }, 0.6);
    callout(s3.cut(ans) + 0.1, b, "answer-1", "COUNTED FROM YOUR ORDERS", { pad: 6, below: true });
    caption(a + 0.05, b, ["ASK. GET AN", "EXACT ANSWER."], { kicker: "ASK YOUR RECEIPTS", sub: ["NANO READS THE QUESTION.", "THE NUMBER IS COUNTED."] });
  }

  // =========== 9. The Wrapped: the only part that uses the cloud ===========
  {
    const a = A("cloud"), b = B("cloud");
    bg(a, C.indigo, { wipe: true });
    cam(a, "side", 0.5);
    shot(a, b, M.approve, R("review").t + 0.3);
    caption(a + 0.05, b, ["THE ONLY PART", "THAT USES", "THE CLOUD."], { kicker: "YOUR WRAPPED" });

    const a2 = A("facts"), b2 = B("facts");
    const s2 = shot(a2, b2, R("review").t + 0.3, M.send - 0.8);
    const z = s2.cut(R("payload").t);
    cam(Math.max(a2, z - 0.3), { focus: "payload", zoom: 1.55, at: [1400, 480] }, 0.7);
    callout(z + 0.3, b2, "payload", "14 ROUNDED FACTS", { pad: 6 });
    caption(a2 + 0.05, b2, ["YOU SEE EVERY", "FACT FIRST."], { kicker: "BEFORE ANYTHING LEAVES", sub: ["NO ITEM LIST. NO DATES.", "NO ADDRESSES."] });

    const a3 = A("send"), b3 = B("send");
    shot(a3, a3 + 1.2, M.send - 0.8, M.send + 0.4);
    cam(a3, { focus: "send", zoom: 1.8, at: [1400, 520] }, 0.5);
    shot(a3 + 1.2, a3 + 3.6, M.send + 0.4, M.wrapped, { sounds: false });
    cam(a3 + 3.4, "side", 0.6);
    shot(a3 + 3.6, b3, M.wrapped, M.wrapped + (b3 - a3 - 3.6));
    caption(a3 + 0.05, b3, ["GEMINI WRITES", "THE JOKES."], { kicker: "IN THE CLOUD", y: 250 });
    // the route the 14 facts take
    card(a3, b3, "transparent", ({ printed }) => {
      const ROWS = [["THIS LAPTOP", "14 FACTS"], ["&darr; FIREBASE AI LOGIC", ""], ["&darr; APP CHECK", "VERIFIED"], ["&darr; GEMINI, IN THE CLOUD", ""]];
      const times = ROWS.map((_, i) => a3 + 0.4 + i * 0.5);
      times.forEach((x) => cue(x, "key", { v: 0.7 }));
      printed({ x: 136, y: 470, w: 660, rows: ROWS, times, last: 3 });
    });

    const a4 = A("cards"), b4 = B("cards");
    const sw = REC.events.filter((e) => e.type === "swipe");
    shot(a4, b4, M.wrapped + (b3 - a3 - 3.6), sw[3]?.t ?? M.wrapped + 7);
    cam(a4, { focus: "cards", zoom: 1.85, at: [1400, 530] }, 0.6);
    callout(a4 + 0.5, b4, "cards", "DRAWN ON YOUR LAPTOP", { pad: 4, below: true });
    caption(a4 + 0.05, b4, ["REAL NAMES", "NEVER LEAVE."], { kicker: "YOUR CARDS" });
  }

  // =========== 10. What left this device ===========
  {
    const a = A("ledger"), b = B("ledger");
    bg(a, C.moss, { wipe: true });
    cam(a, "side", 0.4);
    const s = shot(a, b, M.ledger - 0.3, M.end);
    const z = s.cut(R("ledger-body").t);
    cam(Math.max(a + 0.4, z - 0.2), { focus: "ledger-body", zoom: 1.55, at: [1400, 470] }, 0.7);
    callout(z + 0.4, b, "ledger-body", "WHAT LEFT THIS DEVICE", { pad: 6 });
    caption(a + 0.05, b, ["A RECEIPT FOR", "THAT TOO."], { kicker: "THE LEDGER", sub: ["EVERY CLOUD REQUEST,", "WORD FOR WORD."] });
  }

  // =========== 11. The split, on device and in the cloud ===========
  {
    const a = A("split"), b = B("split2");
    cam(a, "off", 0.5);
    card(a, b, C.ink, ({ box, add, lines }) => {
      lines(["HOW THE WORK IS SPLIT"], { x: 0, y: 120, w: W, align: "center", size: 26, cls: "kick", at: a + 0.1, color: C.paper });
      const col = (x, title, sub, rows, start, colour) => {
        const w = el("div", "sheetw", box, { left: x, top: 200 });
        const p = el("div", "paper", w, { width: 760, padding: "34px 40px 40px", fontSize: 27, lineHeight: 1.75 });
        el("div", "", p, { fontSize: 40, fontWeight: 700, letterSpacing: "0.02em" }, title);
        el("div", "", p, { fontSize: 20, color: C.grey, letterSpacing: "0.1em", marginBottom: 18, borderBottom: "3px dashed #1c1c1a", paddingBottom: 16 }, sub);
        const rs = rows.map(([k, v]) => el("div", "row", p, { opacity: 0 }, `<span>${k}</span><span style="color:${colour};font-weight:700">${v}</span>`));
        return { w, rs, start };
      };
      const left = col(150, "ON THIS LAPTOP", "GEMINI NANO, ONLY_ON_DEVICE", [
        ["READING ORDER PAGES", "NANO"], ["CHECKING EACH ORDER", "CODE"], ["LABELLING ITEMS", "NANO"], ["UNDERSTANDING QUESTIONS", "NANO"], ["OUTPUT", "CONSTRAINED, STREAMED"],
      ], [phrase("split", "reading"), phrase("split", "reading") + 0.6, phrase("split", "labelling"), phrase("split", "understanding"), phrase("split", "constrained")]);
      const right = col(1010, "IN THE CLOUD", "GEMINI VIA FIREBASE AI LOGIC", [
        ["WRITES", "THE WRAPPED"], ["FROM", "14 APPROVED FACTS"], ["PROTECTED BY", "APP CHECK"], ["IF A MODEL IS BUSY", "FALLBACK MODEL"],
      ], [phrase("split2", "only the Wrapped"), phrase("split2", "fourteen"), phrase("split2", "fourteen") + 0.9, phrase("split2", "fallback")]);
      for (const c of [left, right]) c.start.forEach((x) => cue(x, "key", { v: 0.8 }));
      add((tt) => {
        left.w.style.opacity = tt >= a + 0.2 ? 1 : 0;
        right.w.style.opacity = tt >= A("split2") ? 1 : 0;
        for (const c of [left, right]) c.rs.forEach((r, i) => (r.style.opacity = tt >= c.start[i] ? 1 : 0));
      });
    }, { wipe: true });
  }

  // =========== 12. Close ===========
  {
    const a = A("close");
    card(a, END + 1, C.ink, ({ box, add, lines }) => {
      const row = el("div", "", box, { position: "absolute", left: 0, top: 330, width: W, display: "flex", justifyContent: "center", alignItems: "center", gap: 48 });
      const icon = el("img", "", row, { width: 150, height: 150, display: "block" });
      icon.src = "../../public/icons/icon128.png";
      const word = el("div", "h1", row, { fontSize: 150, letterSpacing: "0.14em", lineHeight: 1, color: C.paper }, "RECEIPTS");
      lines(["EVERY FEE YOU PAID ON TOP, FOUND ON YOUR LAPTOP."], { x: 0, y: 560, w: W, align: "center", size: 40, at: a + 0.6, color: C.paper });
      lines(["GITHUB.COM/GOTTOSTARTSOMEWHERE/RECEIPTS"], { x: 0, y: 640, w: W, align: "center", size: 26, cls: "subt", at: a + 1.2, color: C.paper, style: { textTransform: "none", opacity: 0.75 } });
      lines(["BUILT WITH GEMINI NANO AND FIREBASE AI LOGIC"], { x: 0, y: 720, w: W, align: "center", size: 20, cls: "kick", at: a + 1.6, color: C.paper, style: { opacity: 0.55 } });
      cue(a + 0.1, "stamp");
      add((tt) => {
        const p = E.out(seg(tt, a + 0.1, a + 0.3));
        row.style.opacity = tt < a + 0.1 ? 0 : 1;
        row.style.transform = `scale(${lerp(1.15, 1, p)})`;
      });
    }, { wipe: true });
  }

  cue(END - 0.01, "end");
  window.CUT = { name: "demo", duration: END, music: { bpm: 112, energy: 0.55, duck: true } };
  ENG_READY(END);
})();
