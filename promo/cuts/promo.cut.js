// The promo: about 44 seconds of the real app at 128 BPM, cut on the beat, no voice.
// Cold open: the fees slam in one by one, rush, and the year's total lands on the drop.
(() => {
  const { W, C, E, seg, lerp, el, cue, bg, cam, footage, callout, caption, card, coldOpen, REC } = ENG;
  const M = REC.marks;
  const R = (name) => REC.rects.find((r) => r.name === name);
  const BEAT = 60 / 128;
  const b = (n) => n * BEAT; // time of beat n

  function shot(t0, t1, r0, r1, { sounds = true } = {}) {
    footage(t0, t1, r0, r1);
    const speed = (r1 - r0) / (t1 - t0);
    const cut = (r) => t0 + (r - r0) / speed;
    if (sounds && speed <= 2.6)
      for (const e of REC.events) if (e.t >= r0 && e.t <= r1 && e.type !== "key") cue(cut(e.t), e.type === "swipe" ? "whoosh" : "click", e.type === "swipe" ? { dur: 0.25 } : {});
    return { cut, speed };
  }

  // 0. Cold open (bars 1-3): fee after fee, then the total on the drop at beat 8
  coldOpen({
    slams: [
      { t: b(0), value: 14.99, shop: "SWIGGY", label: "PLATFORM FEE", bg: C.teal, fg: C.paper },
      { t: b(1), value: 28, shop: "SWIGGY", label: "PACKING CHARGES", bg: C.mustard, fg: C.ink },
      { t: b(2), value: 35, shop: "SWIGGY", label: "DELIVERY FEE", bg: C.indigo, fg: C.paper },
      { t: b(3), value: 9, shop: "BLINKIT", label: "HANDLING FEE", bg: C.plum, fg: C.paper },
      { t: b(4), value: 25, shop: "BLINKIT", label: "SMALL CART FEE", bg: C.moss, fg: C.paper },
      { t: b(4.5), value: 70.8, shop: "BOOKMYSHOW", label: "CONVENIENCE FEE", bg: C.tomato, fg: C.paper },
      { t: b(5), value: 22, shop: "SWIGGY", label: "LATE NIGHT FEE", bg: C.teal, fg: C.paper },
      { t: b(5.5), value: 15, shop: "BLINKIT", label: "RAIN FEE", bg: C.mustard, fg: C.ink },
    ],
    rush: { t0: b(6), t1: b(8) },
    total: { t0: b(8), t1: b(12) },
    totalValue: 10203,
  });

  // 1. Found in the app (bars 4-5)
  bg(b(12), C.tomato);
  cam(b(12) - 0.01, { focus: "fee-total", zoom: 2.5, at: [W / 2, 470], zone: [0, W] }, 0);
  shot(b(12), b(16), M.fees + 0.6, M.fees + 1.2, { sounds: false });
  callout(b(12) + 0.15, b(16) - 0.1, "fee-total", "FOUND IN MY ORDERS", { pad: 6, below: true });
  cue(b(12) + 0.1, "ching");
  cam(b(16), "side", 0.5);
  shot(b(16), b(20), M.fees + 1.2, M["fees-end"] - 1.5);
  caption(b(16) + 0.5, b(20), ["EVERY FEE,", "FOUND."], { kicker: "RECEIPTS FOR CHROME", size: 110 });

  // 2. Tick your shops (bars 6-7)
  bg(b(20), C.mustard, { wipe: true });
  cam(b(20) - 0.01, "side", 0);
  const s2 = shot(b(20), b(28), M.start + 0.4, M["start-end"] - 1);
  cam(s2.cut(R("shops").t + 0.2), { focus: "shops", zoom: 1.8, at: [1420, 470] }, 0.5);
  cam(s2.cut(R("shops-all").t), "side", 0.5);
  caption(b(20), b(28), ["TICK YOUR", "SHOPS."], { color: C.ink, kicker: "AMAZON, SWIGGY, FLIPKART, BLINKIT", size: 110 });

  // 3. Gemini Nano reads them, on the laptop (bars 8-11)
  bg(b(28), C.ink, { wipe: true });
  cam(b(28), "side", 0.4);
  const s3 = shot(b(28), b(30), M.demo, M.demo + 2.2);
  callout(b(28) + 0.1, Math.min(b(30), s3.cut(M["demo-read"])) - 0.15, "nano-ready", "GEMINI NANO: READY", { pad: 6 });
  shot(b(30), b(38), M.demo + 2.2, M["demo-items"]);
  cam(b(30), { focus: { x: 152, y: 250, w: 384, h: 460, t: R("tally").t }, zoom: 1.55, at: [1420, 500] }, 0.6);
  shot(b(38), b(44), M["demo-items"], M["demo-home"] - 0.3);
  cam(b(38), { focus: "feed-items", zoom: 1.9, at: [1400, 520] }, 0.6);
  callout(b(39) + 0.4, b(44) - 0.1, { x: 380, y: 425, w: 160, h: 300, t: R("feed-items").t }, "ON DEVICE", { pad: 4 });
  caption(b(28), b(36), ["GEMINI NANO", "READS THEM."], { kicker: "ON YOUR LAPTOP", size: 100, sub: ["THE MODEL BUILT INTO CHROME.", "NOTHING UPLOADED."] });
  caption(b(36), b(44), ["EVERY ITEM,", "UNDERSTOOD."], { kicker: "ON DEVICE", size: 100, sub: ["EVERY ORDER CHECKED", "AGAINST THE PAGE."] });

  // 4. A year of fees (bars 12-13)
  bg(b(44), C.tomato, { wipe: true });
  cam(b(44), "side", 0.4);
  shot(b(44), b(46), M["sample-home"], M["sample-home"] + 1.2);
  cam(b(44) + 0.4, { focus: "sample-summary", zoom: 2.0, at: [1400, 470] }, 0.5);
  callout(b(44) + 0.9, b(48), "sample-summary", "A FULL YEAR", { pad: 6 });
  cam(b(48), "side", 0.5);
  shot(b(48), b(52), M.fees + 1.0, M["fees-end"] - 0.5);
  caption(b(44), b(52), ["275 ORDERS.", "₹10,203", "ON TOP."], { kicker: "A YEAR, ITEMISED", size: 100 });

  // 5. Ask (bars 14-16)
  bg(b(52), C.plum, { wipe: true });
  cam(b(52), "side", 0.4);
  const enter = REC.events.filter((e) => e.type === "click" && e.t > M.ask + 2)[1]?.t ?? M.ask + 4.5;
  const ans = R("answer-1").t;
  const s5 = shot(b(52), b(58), M.ask - 0.2, enter + 0.2);
  for (const e of REC.events) if (e.type === "key" && e.t >= M.ask && e.t <= enter) cue(s5.cut(e.t), "key", { v: 0.45 });
  cam(s5.cut(R("ask-input").t) + 0.1, { focus: "ask-input", zoom: 2.0, at: [1400, 470] }, 0.5);
  shot(b(58), b(59), enter + 0.2, ans - 0.3, { sounds: false });
  shot(b(59), b(64), ans - 0.3, ans + 1.2);
  cam(b(58.5), { focus: "answer-1", zoom: 2.0, at: [1400, 470] }, 0.5);
  callout(b(59) + 0.2, b(64), "answer-1", "₹26,550 ON BIRYANI", { pad: 6, below: true });
  caption(b(52), b(64), ["ASK. GET AN", "EXACT ANSWER."], { kicker: "ASK YOUR RECEIPTS", size: 100 });

  // 6. What leaves (bars 17-18)
  bg(b(64), C.indigo, { wipe: true });
  cam(b(64), "side", 0.3);
  shot(b(64), b(66), R("review").t + 1.2, R("payload").t + 0.1);
  cam(b(65), { focus: "payload", zoom: 1.6, at: [1400, 480] }, 0.6);
  shot(b(66), b(72), R("payload").t + 0.1, R("payload").t + 0.6);
  callout(b(66), b(72), "payload", "ALL THAT LEAVES", { pad: 6 });
  caption(b(64), b(72), ["ONLY 14", "ROUNDED FACTS", "LEAVE."], { kicker: "YOU APPROVE IT", size: 88 });

  // 7. The Wrapped (bars 19-20)
  bg(b(72), C.tomato, { wipe: true });
  const sw = REC.events.filter((e) => e.type === "swipe");
  shot(b(72), b(80), M.wrapped + 1, sw[3]?.t ?? M.wrapped + 7);
  cam(b(72), { focus: "cards", zoom: 1.85, at: [1400, 530] }, 0.5);
  caption(b(72), b(80), ["YOUR YEAR,", "WRAPPED."], { kicker: "WRITTEN BY GEMINI", size: 110 });

  // 8. The ledger (bar 21)
  bg(b(80), C.moss, { wipe: true });
  cam(b(80), "side", 0.3);
  shot(b(80), b(84), R("ledger-body").t - 0.2, M.end);
  cam(b(81), { focus: "ledger-body", zoom: 1.55, at: [1400, 470] }, 0.5);
  caption(b(80), b(84), ["A RECEIPT", "FOR THAT TOO."], { kicker: "WHAT LEFT THIS DEVICE", size: 100 });

  // 9. End card
  const END = b(84) + 4.4;
  card(b(84), END + 1, C.ink, ({ box, add, lines }) => {
    const row = el("div", "", box, { position: "absolute", left: 0, top: 330, width: W, display: "flex", justifyContent: "center", alignItems: "center", gap: 48 });
    const icon = el("img", "", row, { width: 150, height: 150, display: "block" });
    icon.src = "../../public/icons/icon128.png";
    el("div", "h1", row, { fontSize: 150, letterSpacing: "0.14em", lineHeight: 1, color: C.paper }, "RECEIPTS");
    lines(["SPENDING CALCULATOR &amp; HIDDEN FEE FINDER"], { x: 0, y: 560, w: W, align: "center", size: 48, at: b(85), color: C.paper });
    lines(["FOR CHROME. READ ON YOUR LAPTOP BY GEMINI NANO."], { x: 0, y: 650, w: W, align: "center", size: 28, cls: "subt", at: b(86), color: C.paper, style: { opacity: 0.75 } });
    lines(["BUILT WITH GEMINI NANO AND FIREBASE AI LOGIC"], { x: 0, y: 760, w: W, align: "center", size: 20, cls: "kick", at: b(87), color: C.paper, style: { opacity: 0.55 } });
    add((tt) => {
      const p = E.out(seg(tt, b(84), b(84) + 0.18));
      row.style.opacity = tt < b(84) ? 0 : 1;
      row.style.transform = `scale(${lerp(1.2, 1, p)})`;
    });
  }, { wipe: true });
  cue(END - 0.01, "end");
  window.CUT = { name: "promo", duration: END, music: { bpm: 128, energy: 1, duck: false, drop: b(8), outro: b(84) } };
  ENG_READY(END);
})();
