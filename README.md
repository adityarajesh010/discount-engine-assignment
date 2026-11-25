# Opptra Price Confidence Engine

A checkout prototype that compares item offers, stacks compatible savings, and explains what the customer pays. Cart offers apply to the item-discounted subtotal.

[Open the live demo](https://discount-engine-assignment-puce.vercel.app/)

The live demo runs without an account or API key. Cart pricing, uploads, and the explicit rule examples are available in every supported browser.

## Run locally

With Node.js 22 or later, run `npm ci`, then `npm run dev`. Open the URL printed by Vite.

## Try it

1. Upload [rules.csv](sample-data/rules.csv) and [cart.csv](sample-data/cart.csv), then select **Calculate best price**. The sample gives a ₹5,932 item subtotal, ₹593 cart discount, and ₹5,339 final total.
2. Describe a rule such as `20% off for Natura Casa brand, stackable with other offers`. Review the structured rule, then select **Add & recalculate**. With the sample cart, the total becomes ₹5,026. An ambiguous description such as `Give a discount for big orders` asks for more detail.
3. Upload [cart.pdf](sample-data/cart.pdf). It replaces the cart and immediately recalculates using the active rules. It contains the same six items as the sample CSV.

## Rule parsing

- **On-device AI.** Supported desktop Chrome can parse free-form descriptions with Gemini Nano using the Prompt API. If Chrome offers **Enable on-device AI**, select it to download the model once. A successful preview is labeled **On-device AI**. Availability depends on the device and browser. [Chrome Prompt API requirements](https://developer.chrome.com/docs/ai/prompt-api)
- **Local parser.** When the browser model is unavailable and hosted AI is disabled, a deterministic grammar handles the sample prompts and similarly worded offers. The preview is labeled **Local parser**. Rule descriptions stay in the browser in both keyless modes.
- **Optional hosted AI.** Reviewers who deploy their own copy can set their own server-side `OPENAI_API_KEY` in Vercel's **Production** environment and redeploy. `OPENAI_MODEL` is optional. When configured, the hosted route handles descriptions if on-device AI is unavailable and sends the description to OpenAI. Usage is billed to the key owner.

## Deployment

Import the GitHub repo into Vercel using the **Vite** preset, repository root, build command `npm run build`, and output directory `dist`. Vercel serves `api/parse-rule.js` as a function.

Leave environment variables empty for a keyless deployment. The optional hosted settings are documented in [.env.example](.env.example).

## Pricing and import decisions

- The engine picks the largest immediate saving among matching non-stackable offers. Ties follow input order. Stackable offers apply in order against the remaining balance. Discounts round to whole rupees and cannot take a price below zero.
- Cart thresholds are inclusive and evaluated after item offers. The checkout shows the cart discount separately only when it applies.
- The PDF importer expects a selectable-text table with Product, Brand, Platform, and Base Price in that order. It loads valid rows and reports skipped rows. A file with no valid rows leaves the current cart intact. Scans require a text-based export or CSV.
- CSV, PDF, and rule parsing produce validated inputs for the same pure pricing engine. A parsed rule changes the quote only after confirmation.

Run `npm test` for pricing, PDF fixtures, and browser and hosted parser integration tests with mocked models. Run `npm run build` to verify the production bundle.
