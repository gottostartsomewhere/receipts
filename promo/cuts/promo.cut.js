// The promo: 44 seconds of the real app at 128 BPM, cut on the beat, no voice.
(() => {
  const { W, C, E, seg, lerp, el, cue, bg, cam, footage, callout, caption, card, REC } = ENG;
  const M = REC.marks;
  const R = (name) => REC.rects.find((r) => r.name === name);
  const BEAT = 60 / 128, BAR = 4 * BEAT;
  const b = (n) => n * BEAT; // time of beat n

  function shot(t0, t1, r0, r1, { sounds = true } = {}) {
    footage(t0, t1, r0, r1);
    const speed = (r1 - r0) / (t1 - t0);
    const cut = (r) => t0 + (r - r0) / speed;
    if (sounds && speed <= 2.6)
      for (const e of REC.events) if (e.t >= r0 && e.t <= r1 && e.type !== "key") cue(cut(e.t), e.type === "swipe" ? "whoosh" : "click", e.type === "swipe" ? { dur: 0.25 } : {});
    return { cut, speed };
  }

  // 0. Hook (bar 1)
  card(0, b(4), C.ink, ({ lines }) => {
    lines(["WHAT DID YOU"], { x: 136, y: 300, size: 150, at: b(0), dur: 0.18, color: C.paper });
    lines(["PAY ON TOP?"], { x: 136, y: 470, size: 150, at: b(2), dur: 0.18, color: C.red });
  });
  cue(b(0), "slap", { i: 0 });
  cue(b(2), "slap", { i: 3 });

  // 1. The answer, in the real app (bars 2-3)
  bg(b(4), C.tomato);
  cam(b(4) - 0.01, { focus: "fee-total", zoom: 2.5, at: [W / 2, 470], zone: [0, W] }, 0);
  shot(b(4), b(8), M.fees + 0.6, M.fees + 1.2, { sounds: false });
  callout(b(4) + 0.15, b(8) - 0.1, "fee-total", "₹10,203 IN FEES. ON TOP.", { pad: 6, below: true });
  cue(b(4), "impact");
  cue(b(4) + 0.2, "ching");
  cam(b(8), "side", 0.5);
  shot(b(8), b(12), M.fees + 1.2, M["fees-end"] - 1.5);
  // the caption comes in once the window has left the text column
  caption(b(8) + 0.5, b(12), ["EVERY FEE,", "FOUND."], { kicker: "RECEIPTS FOR CHROME", size: 110 });

  // 2. Every kind of fee, half a beat each (bar 4)
  const FEES = [["PLATFORM", C.teal, C.paper], ["PACKING", C.mustard, C.ink], ["DELIVERY", C.indigo, C.paper], ["HANDLING", C.plum, C.paper], ["SMALL CART", C.moss, C.paper], ["CONVENIENCE", C.tomato, C.paper], ["LATE NIGHT", C.ink, C.paper], ["RAIN", C.teal, C.paper]];
  FEES.forEach(([w, bgc, fg], i) => {
    const t0 = b(12 + i * 0.5), t1 = b(12 + (i + 1) * 0.5);
    card(t0, t1, bgc, ({ lines }) => {
      const size = Math.min(230, Math.floor(1650 / (w.length * 0.6)));
      lines([w, "FEE."], { x: 136, y: 220 + (230 - size) * 0.5, size, at: t0, dur: 0.08, stagger: 0.02, color: fg });
    });
    cue(t0, "slap", { i });
  });

  // 3. Tick your shops (bars 5-6)
  bg(b(16), C.mustard);
  cam(b(16) - 0.01, "side", 0);
  const s3 = shot(b(16), b(24), M.start + 0.4, M["start-end"] - 1);
  cam(s3.cut(R("shops").t + 0.2), { focus: "shops", zoom: 1.8, at: [1420, 470] }, 0.5);
  cam(s3.cut(R("shops-all").t), "side", 0.5);
  caption(b(16), b(24), ["TICK YOUR", "SHOPS."], { color: C.ink, kicker: "AMAZON, SWIGGY, FLIPKART, BLINKIT...", size: 110 });

  // 4. Gemini Nano reads them, on the laptop (bars 7-10)
  bg(b(24), C.ink, { wipe: true });
  cam(b(24), "side", 0.4);
  const s4 = shot(b(24), b(26), M.demo, M.demo + 2.2);
  // off before the click swaps the screen
  callout(b(24) + 0.1, Math.min(b(26), s4.cut(M["demo-read"])) - 0.15, "nano-ready", "GEMINI NANO: READY", { pad: 6 });
  shot(b(26), b(34), M.demo + 2.2, M["demo-items"]);
  cam(b(26), { focus: { x: 152, y: 250, w: 384, h: 460, t: R("tally").t }, zoom: 1.55, at: [1420, 500] }, 0.6);
  shot(b(34), b(40), M["demo-items"], M["demo-home"] - 0.3);
  cam(b(34), { focus: "feed-items", zoom: 1.9, at: [1400, 520] }, 0.6);
  callout(b(35) + 0.4, b(40) - 0.1, { x: 380, y: 425, w: 160, h: 300, t: R("feed-items").t }, "ON DEVICE", { pad: 4 });
  caption(b(24), b(32), ["GEMINI NANO", "READS THEM."], { kicker: "ON YOUR LAPTOP", size: 100, sub: ["THE MODEL BUILT INTO CHROME.", "NOTHING UPLOADED."] });
  caption(b(32), b(40), ["EVERY ITEM,", "UNDERSTOOD."], { kicker: "ON DEVICE", size: 100, sub: ["EVERY ORDER CHECKED", "AGAINST THE PAGE."] });

  // 5. A year of fees (bars 11-12)
  bg(b(40), C.tomato, { wipe: true });
  cam(b(40), "side", 0.4);
  shot(b(40), b(42), M["sample-home"], M["sample-home"] + 1.2);
  cam(b(40) + 0.4, { focus: "sample-summary", zoom: 2.0, at: [1400, 470] }, 0.5);
  callout(b(40) + 0.8, b(44), "sample-summary", "A FULL YEAR", { pad: 6 });
  cam(b(44), "side", 0.5);
  shot(b(44), b(48), M.fees + 1.0, M["fees-end"] - 0.5);
  caption(b(40), b(48), ["275 ORDERS.", "₹10,203", "ON TOP."], { kicker: "A YEAR, ITEMISED", size: 100 });

  // 6. Ask (bars 13-15)
  bg(b(48), C.plum, { wipe: true });
  cam(b(48), "side", 0.4);
  const enter = REC.events.filter((e) => e.type === "click" && e.t > M.ask + 2)[1]?.t ?? M.ask + 4.5;
  const ans = R("answer-1").t;
  const s6 = shot(b(48), b(54), M.ask - 0.2, enter + 0.2);
  for (const e of REC.events) if (e.type === "key" && e.t >= M.ask && e.t <= enter) cue(s6.cut(e.t), "key", { v: 0.45 });
  cam(s6.cut(R("ask-input").t) + 0.1, { focus: "ask-input", zoom: 2.0, at: [1400, 470] }, 0.5);
  shot(b(54), b(55), enter + 0.2, ans - 0.3, { sounds: false });
  shot(b(55), b(60), ans - 0.3, ans + 1.2);
  cam(b(54.5), { focus: "answer-1", zoom: 2.0, at: [1400, 470] }, 0.5);
  callout(b(55) + 0.2, b(60), "answer-1", "₹26,550 ON BIRYANI", { pad: 6, below: true });
  caption(b(48), b(60), ["ASK. GET AN", "EXACT ANSWER."], { kicker: "ASK YOUR RECEIPTS", size: 100 });

  // 7. What leaves (bars 16-17)
  bg(b(60), C.indigo, { wipe: true });
  cam(b(60), "side", 0.3);
  shot(b(60), b(62), R("review").t + 1.2, R("payload").t + 0.1);
  cam(b(61), { focus: "payload", zoom: 1.6, at: [1400, 480] }, 0.6);
  shot(b(62), b(68), R("payload").t + 0.1, R("payload").t + 0.6);
  callout(b(62), b(68), "payload", "ALL THAT LEAVES", { pad: 6 });
  caption(b(60), b(68), ["ONLY 14", "ROUNDED FACTS", "LEAVE."], { kicker: "YOU APPROVE IT", size: 88 });

  // 8. The Wrapped (bars 18-19)
  bg(b(68), C.tomato, { wipe: true });
  const sw = REC.events.filter((e) => e.type === "swipe");
  shot(b(68), b(76), M.wrapped + 1, sw[3]?.t ?? M.wrapped + 7);
  cam(b(68), { focus: "cards", zoom: 1.85, at: [1400, 530] }, 0.5);
  caption(b(68), b(76), ["YOUR YEAR,", "WRAPPED."], { kicker: "WRITTEN BY GEMINI", size: 110 });

  // 9. The ledger (bar 20)
  bg(b(76), C.moss, { wipe: true });
  cam(b(76), "side", 0.3);
  shot(b(76), b(80), R("ledger-body").t - 0.2, M.end);
  cam(b(77), { focus: "ledger-body", zoom: 1.55, at: [1400, 470] }, 0.5);
  caption(b(76), b(80), ["A RECEIPT", "FOR THAT TOO."], { kicker: "WHAT LEFT THIS DEVICE", size: 100 });

  // 10. End card
  const END = b(80) + 4.4;
  card(b(80), END + 1, C.ink, ({ box, add, lines }) => {
    const row = el("div", "", box, { position: "absolute", left: 0, top: 330, width: W, display: "flex", justifyContent: "center", alignItems: "center", gap: 48 });
    const icon = el("img", "", row, { width: 150, height: 150, display: "block" });
    icon.src = "../../public/icons/icon128.png";
    el("div", "h1", row, { fontSize: 150, letterSpacing: "0.14em", lineHeight: 1, color: C.paper }, "RECEIPTS");
    lines(["SPENDING CALCULATOR &amp; HIDDEN FEE FINDER"], { x: 0, y: 560, w: W, align: "center", size: 48, at: b(81), color: C.paper });
    lines(["FOR CHROME. READ ON YOUR LAPTOP BY GEMINI NANO."], { x: 0, y: 650, w: W, align: "center", size: 28, cls: "subt", at: b(82), color: C.paper, style: { opacity: 0.75 } });
    lines(["BUILT WITH GEMINI NANO AND FIREBASE AI LOGIC"], { x: 0, y: 940, w: W, align: "center", size: 20, cls: "kick", at: b(83), color: C.paper, style: { opacity: 0.55 } });
    add((tt) => {
      const p = E.out(seg(tt, b(80), b(80) + 0.18));
      row.style.opacity = tt < b(80) ? 0 : 1;
      row.style.transform = `scale(${lerp(1.2, 1, p)})`;
    });
  }, { wipe: true });
  cue(b(80), "impact");
  cue(END - 0.01, "end");
  window.CUT = { name: "promo", duration: END, music: { bpm: 128, energy: 1, duck: false, outro: b(80) } };
  ENG_READY(END);
})();
