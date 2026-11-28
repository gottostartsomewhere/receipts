# Chrome Web Store listing: Receipts

Paste these into the Developer Dashboard. Visibility for the hackathon: **Unlisted** (judges get the link). Switch to **Public** after judging.

## Why these words

The store's search leans hardest on the item name, then the summary, then the description, and Google suspends listings that repeat keywords. So the name says the two jobs in the words people type, and the shop names appear once each, in sentences.

What already ranks (checked 2026-11-26): the space is "Spending Calculator for Swiggy and Zomato", "Spending Calculator for Amazon and Flipkart", "Flipkart & Amazon Expense Tracker", "Swiggy & Zomato Spending Tracker & Calculator", "Spending Calculator For Zepto & Blinkit", "Amazon Order History Exporter", and on the US side "Eats Tracker" and "Spend Tracker for Uber Eats" (delivery and service fee totals). So the head terms are **spending calculator**, **spending tracker**, **expense tracker**, **order history**, plus a shop name. Every one of them covers one or two apps and none of them finds fees across apps, which is the hook: **hidden fees**, **delivery fee**, **platform fee**.

Brand names stay out of the item name (trademark review risk) and go in the summary and description, where they describe compatibility.

**Rejected 2026-11-28 for keyword spam** (violation "Yellow Argon"): the description's "WORKS WITH" section listed eight US beta shops in a row. Rule since then: shop names appear once, in one sentence, and only the verified ones (Amazon.in, Swiggy, Flipkart, Blinkit, BookMyShow); beta shops are "more shops in beta", never named.

## Item name (max 75)

Comes from `name` in public/manifest.json:

Receipts: Spending Calculator & Hidden Fee Finder

## Summary (max 132)

Comes from `description` in public/manifest.json:

Adds up a year of your online orders and finds every platform, delivery and packing fee on top. Read privately on your laptop.

(Shop names were taken out of the summary in 0.2.2 after the keyword-spam rejection; they appear once, in the description.)

## Category

Shopping

## Language

English

## Description

How much did you spend online this year, and how much of it was fees?

Receipts is a spending calculator and hidden fee finder for your online orders. It reads your order history right on your laptop and shows you what you spent, plus every fee added on top: platform fees, delivery fees, packing charges and convenience fees.

YOUR YEAR, ITEMISED
Tick the shops you use, or open any shop's order history page and click the Receipts icon. Receipts uses your existing sign-in, and Gemini Nano, the AI model built into Chrome, reads the orders on your laptop. You get your total spend, your spending by month, your regular orders and your biggest buy.

EVERY FEE, FOUND
The fees receipt lists each kind of fee and how often you paid it, your fees by month and your single biggest fee. It also works out whether a delivery membership would have paid for itself.

ASK YOUR RECEIPTS
"How much did I pay in delivery fees in March?" Gemini Nano reads the question on your laptop and the answer is counted from your own orders, so it is exact.

YOUR SPENDING WRAPPED
Shareable story cards for your year. Gemini in the cloud writes the funny lines from about a dozen rounded totals that you see and approve first. Cards with real restaurant and product names are drawn on your laptop and never sent.

PRIVATE BY DESIGN
- Your orders, items, fees and questions are read on your laptop, not on a server.
- Only rounded totals you approve go to the cloud, and every request is listed under "What left this device".
- No account, no analytics, no ads. "Forget this year" deletes your saved year.

WHERE IT WORKS
Amazon.in, Swiggy, Flipkart, Blinkit and BookMyShow work today, with more shops in beta. On any other shop, open its order history page and click the Receipts icon.

No orders handy? Try the built-in demo store or a sample year.

Needs Chrome on a desktop with Gemini Nano (Chrome 139 or later). Without Nano, the demo store and sample years still work.

## Single purpose

Shows the user a private summary of their own online order history and the fees they paid, read on their device.

## Permission justifications

- **storage, unlimitedStorage**: saves the user's finished year (orders, item labels, Wrapped) on their computer so it reopens instantly; order histories can exceed the default quota.
- **scripting**: reads the order-history page of a shop the user ticked, inside a background tab, and reads the page the user clicked the icon on.
- **activeTab**: when the user clicks the Receipts icon on a shop's order page, reads that one page.
- **Optional host permissions (amazon.in, amazon.com, swiggy.com, flipkart.com, myntra.com, ajio.com, tatacliq.com, blinkit.com, jiomart.com, bookmyshow.com, riders.uber.com, walmart.com, target.com, doordash.com, ubereats.com, instacart.com, ebay.com, etsy.com)**: requested only for the shops the user ticks, to open that shop's order-history page with the user's own sign-in.
- **Remote code**: none. All code is in the package.

## Data usage (privacy practices tab)

Data collected and handled **on the device only**: Website content (the user's order-history pages), Financial and payment information (purchase totals and fees from those pages).

Transferred off the device: only aggregated, rounded totals the user approves (sent to Google Gemini via Firebase AI Logic to write the Wrapped).

Certify:
- Not sold to third parties.
- Not used or transferred for purposes unrelated to the item's single purpose.
- Not used or transferred to determine creditworthiness or for lending.

Privacy policy URL: https://github.com/gottostartsomewhere/receipts/blob/main/PRIVACY.md

## Test instructions (for reviewers and judges)

1. Click the Receipts icon. "Demo store" is selected: press READ THE DEMO STORE. Gemini Nano reads a made-up order page on your computer and checks every order and fee against it (about 1 to 3 minutes, faster on a GPU).
2. Look through the Wrapped, Fees and Ask tabs. Try "How much did I pay in fees?".
3. For instant results, pick "Sample year: Seattle" or "Sample year: Chennai".
4. If you shop on any supported site, tick it, or open your order page there and click the Receipts icon.

## Images to upload

- Screenshots 1280x800, in this order: marketing/store-1.png ... store-5.png
- Small promo tile 440x280: marketing/tile-440x280.png
- Marquee 1400x560 (optional, used if the store ever features it): marketing/marquee-1400x560.png
- Store icon 128x128: public/icons/icon128.png
- Promo video (YouTube link field): the promo from promo/
