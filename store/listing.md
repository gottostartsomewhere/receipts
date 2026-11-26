# Chrome Web Store listing: Receipts

Paste these into the Developer Dashboard. Visibility for the hackathon: **Unlisted** (judges get the link).

## Item name (max 75)

Receipts: your year of orders and the fees on top

## Summary (max 132)

See what you spent online and every fee you paid on top. Read on your laptop by Gemini Nano; only a few rounded totals leave.

## Category

Shopping

## Language

English

## Description

Receipts reads your order history on your own laptop and shows you your year: what you bought, what you spent, and every platform, delivery, packing and convenience fee you paid on top.

YOUR YEAR, ITEMISED
Tick the shops you use (Amazon.in, Amazon.com, Swiggy, Flipkart, Blinkit, BookMyShow and more) or click Receipts on any shop's order page. Receipts opens your order history with your existing sign-in and Gemini Nano, the AI model built into Chrome, reads it on your laptop.

EVERY FEE, FOUND
A fees receipt shows each kind of fee per app and how often you paid it, your fees by month, and whether a membership like Swiggy One or DashPass would have paid for itself.

ASK YOUR RECEIPTS
"How much did I pay in fees in March?" Gemini Nano understands the question on your laptop; the answer is counted from your orders, so it is exact.

YOUR WRAPPED
Shareable story cards for your year. Gemini in the cloud writes the funny lines from about a dozen rounded totals that you see and approve first. Cards with real restaurant names are drawn on your laptop and never sent.

PRIVATE BY DESIGN
- Orders, items, fees and questions are read on your laptop.
- Only rounded totals you approve go to the cloud, and every request is listed under "What left this device".
- No accounts, no analytics, no ads. Your saved year stays in your browser and "Forget this year" deletes it.

NO ACCOUNTS? Try the demo store or a sample year.

Requires Chrome on desktop with Gemini Nano (Chrome 139+). Without Nano, the demo store and sample years still work.

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

- Screenshots 1280x800: marketing/store-1.png ... store-5.png
- Small promo tile 440x280: marketing/tile-440x280.png
- Store icon 128x128: public/icons/icon128.png
