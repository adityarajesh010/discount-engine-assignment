import { readAmount } from './moneyInput.js'

const clean = (value) => typeof value === 'string' ? value.trim() : ''

/** A single validation boundary for CSV, LLM and fallback-parser inputs. */
export function validateRule(candidate, { requireId = false } = {}) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, errors: ['A structured discount rule is required.'] }
  }
  const errors = []
  const scope = clean(candidate.scope).toLowerCase()
  const type = clean(candidate.type).toLowerCase()
  const ruleId = clean(candidate.ruleId || candidate.rule_id)
  const appliesTo = clean(candidate.appliesTo || candidate.applies_to)
  const value = readAmount(candidate.value)
  const minRaw = candidate.minCartValue ?? candidate.min_cart_value
  const minCartValue = minRaw == null || minRaw === '' ? null : readAmount(minRaw)
  const stacking = String(candidate.stackable ?? '').trim().toLowerCase()

  if (requireId && !ruleId) errors.push('rule_id is required')
  if (!['brand', 'platform', 'cart'].includes(scope)) errors.push('scope must be brand, platform, or cart')
  if (!['percentage', 'flat'].includes(type)) errors.push('type must be percentage or flat')
  if (!Number.isFinite(value) || value <= 0) errors.push('value must be a positive number')
  if (type === 'percentage' && value > 100) errors.push('percentage value cannot exceed 100')
  if (type === 'flat' && value < 1) errors.push('flat discounts must be at least Rs.1')
  if (!['true', 'false', 'yes', 'no', '1', '0'].includes(stacking)) errors.push('stackable must be true or false')
  if ((scope === 'brand' || scope === 'platform') && !appliesTo) errors.push('applies_to is required for brand and platform rules')
  if (scope === 'cart' && type !== 'percentage') errors.push('cart rules must use a percentage discount')
  if (scope === 'cart' && appliesTo) errors.push('cart rules cannot target a brand or platform')
  if (scope === 'cart' && (!Number.isFinite(minCartValue) || minCartValue <= 0)) errors.push('cart rules need a positive min_cart_value')
  if (scope !== 'cart' && minCartValue !== null) errors.push('only cart rules can have a min_cart_value')

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    errors: [],
    rule: {
      ruleId: ruleId || null,
      scope,
      appliesTo: scope === 'cart' ? '' : appliesTo,
      type,
      value,
      stackable: ['true', 'yes', '1'].includes(stacking),
      minCartValue: scope === 'cart' ? Math.ceil(minCartValue) : null,
    },
  }
}
