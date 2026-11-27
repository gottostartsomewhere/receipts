# Recording the voiceover

The 3-minute demo is timed to these 23 lines. A computer voice reads them for now; your voice replaces it.

**How:** a quiet room, phone or laptop mic about a hand's width from your mouth, one take. Read each line, then **pause for two full seconds** before the next one (the pauses are how the take gets split). If you fluff a line, pause, read it again, carry on, and note the line number; the retake gets sorted out when the take is split.

Save as WAV or M4A and drop it in `promo/vo/take/`. Then:

```
python promo/vo/split.py promo/vo/take/<your file>
python promo/vo/timing.py
node promo/render.mjs frames 5 --page cuts/demo.html --out demo
python promo/mix.py demo
```

(or just tell Claude the file is there).

Speak a little slower than you'd talk, and smile on the first and last lines.

## The lines

1. This is Receipts, a Chrome extension that reads a year of your online orders and finds every fee you paid on top.
2. Platform fees. Packing charges. Delivery, handling, small cart, even rain. Each one is a few rupees, so nobody adds them up.
3. India's consumer regulator has a name for it: drip pricing.
4. Here's an order page. The fees are printed right under each order, and Receipts reads pages like this.
5. You tick the shops you use. Amazon, Swiggy, Flipkart, Blinkit, BookMyShow, and more in beta.
6. Or open any shop's order history and click the Receipts icon.
7. Each shop opens in a background tab with your own sign-in. Nothing is uploaded.
8. Now watch it read the demo store. This is Gemini Nano, the model built into Chrome, running on this laptop.
9. It pulls out every order: the date, the total and the fees.
10. Then each order is checked against the page. The total, an item and the date must be printed there, and a fee only counts inside its own order. Anything Nano made up is dropped.
11. Next, Nano turns messy product names into things you'd recognise. Every label is stamped on device.
12. Here's a full sample year. Two hundred and seventy five orders, and ten thousand two hundred rupees in fees on top.
13. The fees receipt splits it by app, by kind and by month.
14. And it works out the most a membership like Swiggy One could cost and still pay for itself.
15. You can ask it anything. Nano reads the question on the laptop, and the answer is counted from your orders, so it's exact.
16. The Wrapped is the fun part, and the only part that uses the cloud.
17. Before anything leaves, you see the whole list. Fourteen rounded facts. No items, no dates, no addresses.
18. Say yes, and Gemini in the cloud writes the jokes, through Firebase AI Logic, with App Check.
19. Cards with real restaurant names are drawn on your laptop and never sent.
20. And there's a receipt for that too. Every cloud request, word for word.
21. So here's the split. On device: reading pages, labelling items and understanding questions, with constrained, streamed output.
22. In the cloud: only the Wrapped, from fourteen numbers you approved, with a fallback model when one is busy.
23. Receipts. Every fee you paid on top, found on your laptop.
