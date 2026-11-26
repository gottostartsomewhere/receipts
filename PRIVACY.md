# Receipts privacy policy

Last updated: 26 November 2026

Receipts is built so that your order history stays on your computer. This page says exactly what it reads, where that data goes, and how to delete it.

## What Receipts reads

- **Order history from shops you choose.** When you tick a shop (for example Amazon.in or Swiggy) and press Read, Receipts opens that shop's order-history page in a background tab using your existing sign-in, reads the orders, and closes the tab. It reads order dates, totals, item names, order status and the fees listed on each order. It never reads delivery addresses.
- **A page you choose.** When you click the Receipts icon on a shop's order page, Receipts reads the text of that one page.
- **Your questions.** Text you type into "Ask your receipts".

Receipts only asks Chrome for access to a shop's website when you tick that shop.

## Where it is processed

Everything above is processed **on your computer** by Gemini Nano, the on-device model built into Chrome, through Firebase AI Logic. Totals, fees and your answers are calculated by code on your computer.

## What leaves your computer

Only these, and only when the stated condition holds:

1. **Your Wrapped facts, when you press "Send these facts to Gemini".** About a dozen rounded numbers and short labels (for example total spent rounded to the nearest ₹100, your most-ordered item, your busiest month, fees on top rounded). You see the exact list before sending. No item list, dates, addresses, order numbers or exact amounts are sent. If you choose "Keep everything on this laptop", nothing is sent.
2. **Item names, only if you opt in** on a computer without Gemini Nano. Never prices, dates or addresses.
3. **The made-up demo store page**, only on a computer without Gemini Nano. It contains no personal data.

These requests go to Google's Gemini models through Firebase AI Logic and are subject to Google's terms. Every request that leaves your computer is listed, with its exact contents, under "What left this device" inside Receipts.

## What is stored, and where

- Your finished year (orders, item labels and your Wrapped) is saved in Chrome's storage for this extension, on your computer only, so Receipts can reopen it.
- Pages you add with the icon are kept in session storage and are cleared when Chrome closes.
- "Forget this year" deletes your saved year. Uninstalling Receipts deletes everything it stored.

## What Receipts does not do

- No accounts, no analytics, no ads, no tracking.
- Your data is not sold, shared with third parties, or used for anything other than showing you your own year.
- Your data is not used to determine creditworthiness or for lending.

## Contact

Questions or problems: open an issue on the project's GitHub repository.
