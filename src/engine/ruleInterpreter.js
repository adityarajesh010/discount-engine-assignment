import { validateRule } from './ruleValidation.js'
import { amountPattern, currencyPattern, readAmount } from './moneyInput.js'
import { parseWithBrowserModel } from './browserRuleModel.js'

const percentage = /^(\d+(?:\.\d{1,2})?)\s*%\s+off\s+(.+)$/i
const flat = new RegExp(`^(${currencyPattern}${amountPattern})\\s+(?:off|flat discount)\\s+(.+)$`, 'i')
const cart = new RegExp(`^(?:if|when) (?:the )?(?:cart|order)(?: (?:value|total|subtotal))? (?:is )?(?:more than|greater than|above|over|at least|>=|≥) ((?:${currencyPattern})?${amountPattern})$`, 'i')
const brand = /^(?:on|for) (?:all )?(.+?) brand$/i
const platform = /^(?:on|for) (?:all )?(.+?) (?:platform|items|products)$/i
const stacking = /(?:,\s*|\s+)((?:(?:non[- ]|not\s+)?)stackable(?: with other offers)?)$/i
const fallbackError = 'Use one explicit offer with an amount and a named brand, platform, or cart minimum. For example: “15% off for Acme brand”.'

// Offline mode accepts a small grammar with arbitrary targets and amounts.
export function parseRuleLocally(text) {
  const normalized = text.trim().replace(/\s+/g, ' ').replace(/\.$/, '')
  const stackPhrase = normalized.match(stacking)
  const stackable = /^stackable/i.test(stackPhrase?.[1] ?? '')
  const statement = stackPhrase ? normalized.slice(0, stackPhrase.index).trimEnd() : normalized
  const percentMatch = statement.match(percentage)
  const discount = percentMatch ?? statement.match(flat)
  if (!discount) return { ok: false, errors: [fallbackError] }

  const [, amount, target] = discount
  const rule = { type: percentMatch ? 'percentage' : 'flat', value: readAmount(amount), stackable }
  const threshold = target.match(cart)
  if (threshold) {
    return finalize({ ...rule, scope: 'cart', minCartValue: readAmount(threshold[1]) })
  }

  const brandMatch = target.match(brand)
  const appliesTo = (brandMatch ?? target.match(platform))?.[1]
  if (!appliesTo || /[%£$₹,;]|\b(?:and|or|if|when|except|over|under|stackable)\b/i.test(appliesTo)) {
    return { ok: false, errors: [fallbackError] }
  }
  return finalize({ ...rule, scope: brandMatch ? 'brand' : 'platform', appliesTo })
}

function finalize(candidate) {
  const validation = validateRule(candidate)
  return validation.ok ? { ok: true, candidate: validation.rule, source: 'local' } : validation
}

export async function requestRuleParse(text) {
  const onDevice = await parseWithBrowserModel(text)
  if (onDevice) return onDevice

  // Check configuration without sending the entered rule. A static or offline
  // installation keeps working even when this capability check fails.
  let configured
  try {
    const status = await fetch('/api/parse-rule', { signal: AbortSignal.timeout(2500), cache: 'no-store' })
    configured = status.ok && (await status.json())?.configured === true
  } catch {
    return parseRuleLocally(text)
  }
  if (!configured) return parseRuleLocally(text)

  try {
    const response = await fetch('/api/parse-rule', {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (response.status === 404 || response.status === 405) return parseRuleLocally(text)
    const payload = await response.json()
    if (response.status === 503 && payload?.code === 'AI_NOT_CONFIGURED') return parseRuleLocally(text)
    if (!response.ok && typeof payload?.error === 'string') return { ok: false, errors: [payload.error] }
    const validation = validateRule(payload?.rule)
    return validation.ok ? { ok: true, candidate: validation.rule, source: 'llm' } : validation
  } catch {
    return { ok: false, errors: ['Could not reach the rule parser. Try again.'] }
  }
}
