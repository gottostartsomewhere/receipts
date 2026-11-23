# Receipts

**Your year of shopping, wrapped. Your orders never leave your laptop.**

Receipts is a Chrome extension that reads your order history from the shops you use (Amazon, Swiggy, Zomato, more coming), works out what you actually bought with **Gemini Nano running on your laptop**, and turns your year into shareable Wrapped cards.

The cloud only ever sees about a dozen rounded facts, and you see every one of them before anything is sent.

> 241 orders stayed on my laptop. 12 facts left it.

## Why hybrid

Your order history is one of the most personal datasets you have: what you eat at 2am, what you buy, where it goes. Nobody should paste that into a chatbot to get a fun summary. So Receipts splits the work by **what the data is**, not just by what the device can do:

| Job | Where it runs | Firebase AI Logic mode | Why |
|---|---|---|---|
| Understand every item ("Hyderabadi Chicken Dum Biryani" → *biryani · food*) | Gemini Nano, on device | `ONLY_ON_DEVICE` | Item names are private, there are hundreds of them, and on-device inference is free. If Nano is missing, Receipts falls back to local rules instead of the cloud, unless you explicitly opt in. |
| Add it all up: totals, favourites, late-night orders, busiest month | Plain code, on device | none | Arithmetic, no model needed. |
| Decide what may leave | On device | none | A fixed list of ~12 facts. Money is rounded. No item list, dates, merchants or addresses. You review it first. |
| Write the Wrapped: persona, roast, card lines | Gemini in the cloud | `ONLY_IN_CLOUD` | Creative writing on a tiny anonymous summary is where a big model shines. |
| Draw the share cards | Canvas, on device | none | Images are made on your laptop. |

Every request that leaves the device is logged, with its exact contents, in the **What left this device** panel.

## How it uses Firebase

- **Firebase AI Logic** (`firebase/ai`) for both models: `ONLY_ON_DEVICE` Gemini Nano with a JSON `responseConstraint` for item labelling, and `ONLY_IN_CLOUD` Gemini with a response schema for the Wrapped. See [`src/lib/firebase.ts`](src/lib/firebase.ts), [`src/lib/labeler.ts`](src/lib/labeler.ts) and [`src/lib/wrapped.ts`](src/lib/wrapped.ts).
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
