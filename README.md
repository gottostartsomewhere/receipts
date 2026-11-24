# Receipts

**Your year of shopping, wrapped. Your orders never leave your laptop.**

Receipts is a Chrome extension that reads your order history from the shops you use, works out what you actually bought with **Gemini Nano running on your laptop**, and turns your year into shareable Wrapped cards.

The cloud only ever sees about a dozen rounded facts, and you see every one of them before anything is sent.

> 241 orders stayed on my laptop. 12 facts left it.

## What it does

- **Reads your shops.** Amazon.in, Amazon.com and Swiggy have dedicated readers. Flipkart, Myntra, Ajio, Tata CLiQ, Blinkit, JioMart, BookMyShow and Uber in India, and Walmart, Target, DoorDash, Uber Eats, Instacart, eBay and Etsy in the US are read by one generic reader: the order page opens in a background tab with your existing sign-in, the year is loaded, and Gemini Nano reads it on your laptop. Shops nobody has checked against a real account yet are marked beta.
- **Reads any other shop.** Open any order-history page (Flipkart, Myntra, DoorDash, Walmart...) and click the Receipts icon. Gemini Nano pulls the orders off that page on your laptop, and every order it reports is checked against the page text, so it cannot invent a purchase.
- **Understands what you bought.** Nano turns "Dindigul Chicken Dum Biryani" and "Lazeez Bhuna Murgh Biryani" into *biryani*, so the year adds up the way you think about it.
- **Writes your Wrapped.** Gemini in the cloud gets the rounded facts and writes the persona, roast and card lines.
- **Private cards.** Your regulars, priciest day, longest streak, late-night favourite and repeat buys are worked out and drawn on your laptop, with real names, and stamped "never left my laptop".
- **Ask your receipts.** "How much did I spend on biryani in March?" Nano turns the question into a small query on your laptop, the answer is counted from your orders, and the query is checked against your words so a slip cannot change the number.

## Why hybrid

Your order history is one of the most personal datasets you have: what you eat at 2am, what you buy, where it goes. Nobody should paste that into a chatbot to get a fun summary. So Receipts splits the work by **what the data is**, not just by what the device can do:

| Job | Where it runs | Firebase AI Logic mode | Why |
|---|---|---|---|
| Understand every item ("Hyderabadi Chicken Dum Biryani" becomes *biryani, food delivery*) | Gemini Nano, on device | `ONLY_ON_DEVICE` | Item names are private, there are hundreds of them, and on-device inference is free. If Nano is missing, Receipts falls back to local rules instead of the cloud, unless you explicitly opt in. |
| Read orders off any shop's page | Gemini Nano, on device | `ONLY_ON_DEVICE`, no fallback | A whole order page is about as private as data gets. Every extracted order is checked against the page before it counts. |
| Answer your questions | Gemini Nano turns words into a query; code counts the answer | `ONLY_ON_DEVICE` | The question is personal and the answer must be exact, so the model never does the maths. |
| Add it all up: totals, favourites, late-night orders, busiest month | Plain code, on device | none | Arithmetic, no model needed. |
| Decide what may leave | On device | none | A fixed list of ~12 facts. Money is rounded. No item list, dates, merchants or addresses. You review it first. |
| Write the Wrapped: persona, roast, card lines | Gemini in the cloud | `ONLY_IN_CLOUD` | Creative writing on a tiny anonymous summary is where a big model shines. |
| Draw the share cards | Canvas, on device | none | Images are made on your laptop. |

Every request that leaves the device is logged, with its exact contents, in the **What left this device** panel.

## How it uses Firebase

- **Firebase AI Logic** (`firebase/ai`) for every model call: three `ONLY_ON_DEVICE` Gemini Nano jobs (item labels, any-page order extraction, question parsing), each with a regex `responseConstraint` so Nano writes one short line per answer and streams it, and an `ONLY_IN_CLOUD` Gemini call with a response schema for the Wrapped, with a second model as fallback. See [`src/lib/firebase.ts`](src/lib/firebase.ts).
- **Speed on ordinary laptops.** Short constrained lines, streaming and a warm-up session took labelling on a 2022 i5 from about 8 seconds an item to about 1.3.
- **App Check** protects the Gemini API. MV3 extension pages cannot load reCAPTCHA, so the extension uses the App Check debug provider with a registered token.

## Run it

Requirements: Chrome 139+ on desktop with Gemini Nano available (check `chrome://on-device-internals`), Node 20+.

```bash
npm install
cp .env.example .env   # fill in your Firebase web config and App Check debug token
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `dist` folder. Click the Receipts icon.

No accounts handy? Pick **Sample: Chennai** or **Sample: Seattle** for a believable year of orders.

## Tests

```bash
npm test
```

The tests pin the privacy boundary: the cloud payload is a fixed list of facts, money is rounded, and no dates, order ids, merchants or item names can appear in it.

## License

Apache 2.0. See [LICENSE](LICENSE).
