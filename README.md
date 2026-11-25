# Opptra Price Confidence Engine

A checkout prototype that compares item offers, stacks compatible savings, and explains what the customer pays. Cart offers apply to the item-discounted subtotal.

[Open the live demo](https://discount-engine-assignment-puce.vercel.app/)

## Run locally

With Node.js 22 or later, run `npm ci`, then `npm run dev`. Open the URL printed by Vite.

## Try it

1. Upload [rules.csv](sample-data/rules.csv) and [cart.csv](sample-data/cart.csv), then select **Calculate best price**. The sample gives a ₹5,932 item subtotal, ₹593 cart discount, and ₹5,339 final total.
2. Describe a rule such as `20% off for Natura Casa brand, stackable with other offers`. Review the structured rule, then select **Add & recalculate**. With the sample cart, the total becomes ₹5,026. An ambiguous description such as `Give a discount for big orders` asks for more detail.
3. Upload [cart.pdf](sample-data/cart.pdf). It replaces the cart and immediately recalculates using the active rules. It contains the same six items as the sample CSV.

## Deployment

Import the GitHub repo into Vercel using the **Vite** preset, repository root, build command `npm run build`, and output directory `dist`. Vercel serves `api/parse-rule.js` as a function.

Set `OPENAI_API_KEY` in Vercel’s **Production** environment and redeploy to enable AI parsing. `OPENAI_MODEL` is an optional override documented in [.env.example](.env.example). The API key stays on the server. Rule descriptions go to OpenAI in AI mode, while files and pricing stay in the browser. The Vite-only local app and keyless deploys use a limited grammar for explicit offers.

## Pricing and import decisions

- The engine picks the largest immediate saving among matching non-stackable offers. Ties follow input order. Stackable offers apply in order against the remaining balance. Discounts round to whole rupees and cannot take a price below zero.
- Cart thresholds are inclusive and evaluated after item offers. The checkout shows the cart discount separately only when it applies.
- The PDF importer expects a selectable-text table with Product, Brand, Platform, and Base Price in that order. It loads valid rows and reports skipped rows. A file with no valid rows leaves the current cart intact. Scans require a text-based export or CSV.
- CSV, PDF, and rule parsing produce validated inputs for the same pure pricing engine. A parsed rule changes the quote only after confirmation.

Run `npm test` for pricing, PDF fixtures, and mocked Responses API cases. Run `npm run build` to verify the production bundle.
