import { validateRule } from './ruleValidation.js'

const trim = (value) => String(value || '').replace(/\s+/g, ' ').trim()

function extractValue(text) {
  const percent = text.match(/(\d+(?:\.\d+)?)\s*%/i)
  if (percent) return { type: 'percentage', value: Number(percent[1]) }
  const flat = text.match(/(?:₹|rs\.?|inr)\s*(\d[\d,]*(?:\.\d+)?)/i)
  return flat ? { type: 'flat', value: Number(flat[1].replace(/,/g, '')) } : null
}

/**
 * A deliberately narrow local safety net. The hosted API parser handles open
 * language; this only accepts the transparent, well-formed phrasing shown in
 * the brief so that a missing API key never silently invents a promotion.
 */
export function parseRuleLocally(text) {
  const normalized = trim(text)
  const value = extractValue(normalized)
  if (!value) return { ok: false, errors: ['I need a discount value, such as "20%" or "Rs.100".'] }

  const stackable = /\bstack(?:able|\s+with)\b/i.test(normalized)
  if (/\b(cart|order)\b/i.test(normalized)) {
    const threshold = normalized.match(/(?:more than|above|over|at least|minimum(?:\s+cart(?:\s+value)?)?|greater than|>=)\s*(?:rs\.?|₹|inr)?\s*(\d[\d,]*)/i)
      || normalized.match(/(?:rs\.?|₹|inr)\s*(\d[\d,]*).{0,30}(?:cart|order)/i)
    if (!threshold) return { ok: false, errors: ['I need a cart threshold, for example "if cart value is more than Rs.5,000".'] }
    return finalize({ scope: 'cart', type: value.type, value: value.value, stackable, minCartValue: threshold[1].replace(/,/g, '') })
  }

  const brand = normalized.match(/(?:for|on)\s+(.+?)\s+brand\b/i)
  if (brand) return finalize({ scope: 'brand', appliesTo: trim(brand[1]), type: value.type, value: value.value, stackable })

  const platform = normalized.match(/(?:on|for)\s+(?:all\s+)?(.+?)\s+(?:items|products)\b/i)
    || normalized.match(/(?:on|for)\s+(Amazon(?:\s+India)?|Flipkart|Noon)\b/i)
  if (platform) return finalize({ scope: 'platform', appliesTo: trim(platform[1]), type: value.type, value: value.value, stackable })

  return { ok: false, errors: ['Please say who the rule applies to: a brand, a platform, or the cart.'] }
}

function finalize(candidate) {
  const validation = validateRule(candidate)
  return validation.ok ? { ok: true, candidate: validation.rule, source: 'local' } : validation
}

export async function requestRuleParse(text) {
  try {
    const response = await fetch('/api/parse-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (response.ok) {
      const payload = await response.json()
      const validation = validateRule(payload.rule || payload)
      if (validation.ok) return { ok: true, candidate: validation.rule, source: 'llm' }
      return { ok: false, errors: validation.errors }
    }
  } catch {
    // A static build or local Vite server intentionally has no API route.
  }
  return parseRuleLocally(text)
}
