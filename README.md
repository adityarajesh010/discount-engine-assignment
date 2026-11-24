# Opptra Price Confidence Engine

A customer-facing checkout-pricing prototype for the Opptra FDE Intern assignment. It deliberately treats “lowest eligible price” and “can the shopper understand it?” as the same product problem.

## Local run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Upload the two CSV files in `sample-data/`, then choose **Calculate best price**.

## Live deployment

Local-first milestone complete. Deployment is intentionally pending review; add the production URL here before assignment submission.

## What is built

- Item pricing that compares all matching non-stackable rules by rupee saving, then applies valid stackable rules on the running price.
- Cart-level rules evaluated after item pricing, with an explicit cart-offer row and final total.
- A near-threshold nudge when a cart offer is not yet eligible. This is the “best price / price confidence” pattern: make the next saving understandable without hiding the current price.
- Natural-language rule input with a confirmation card before the rule can affect any checkout total.
  - Production/Vercel uses `api/parse-rule.js`, an OpenAI Responses API route with strict structured output.
  - The key is server-only (`OPENAI_API_KEY`); the browser never sees it.
  - With no server key, a deliberately narrow local parser supports the brief’s examples and fails clearly rather than guessing.
- PDF cart upload for selectable-text tables with `Product`, `Brand`, `Platform`, and `Base Price` columns. Valid rows load; malformed rows are reported with a page and row excerpt. Image-only PDFs are called out instead of silently producing a bad cart.
- Offer audit disclosures for losing non-stackable offers, so checkout reasoning survives custom rules and cart replacement.

## Design choices and trade-offs

### The engine is input-agnostic

`src/engine/discountEngine.js` accepts only typed objects. CSV, PDF, and natural-language paths adapt data into that contract at the edge. A new source (API, database, spreadsheet) therefore does not alter checkout calculations.

### Rounding and price floor

Each offer rounds to the nearest rupee when applied, matching the expected assignment totals. A flat offer is capped at the current price, so a malformed or oversized offer cannot create a negative payable amount.

### Cart rule behaviour

The engine checks each cart threshold against the item-discounted subtotal, exactly once item offers are complete. If several cart rules are eligible, it uses the same transparent policy as items: choose the biggest non-stackable saving, then apply eligible stackable rules in their listed order. An equality at the threshold is eligible.

### LLM output is not trusted

Structured output avoids missing keys or invented enum values, but it is not business validation. The response is checked again by `src/engine/ruleValidation.js`, then shown to the user for confirmation. An unresolved rule cannot enter active pricing.

## Configure the optional AI route

Copy `.env.example` to `.env.local`, set `OPENAI_API_KEY`, and deploy to Vercel (which discovers `api/parse-rule.js`). Never use a `VITE_` prefix for the key. The local Vite-only server intentionally falls back to the safe parser when that function is not present.

## Verify

```bash
npm test
npm run build
```

The test suite covers the supplied expected totals (₹5,932 subtotal, ₹593 cart saving, ₹5,339 final), one-rupee-below threshold handling, price-floor protection, and natural-language examples.

## Project map

```text
src/engine/discountEngine.js  pure pricing and cart evaluation
src/engine/csvParser.js       CSV adapters
src/engine/pdfCartParser.js   text-table PDF adapter
src/engine/ruleInterpreter.js API + safe local rule parsing adapter
src/engine/ruleValidation.js  shared business-rule validation boundary
api/parse-rule.js             server-only structured LLM parser
test/                         executable checkout examples
```
