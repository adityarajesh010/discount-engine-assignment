const clean = (value) => String(value ?? '').trim()
const asBoolean = (value) => typeof value === 'boolean'
  ? value
  : ['true', '1', 'yes'].includes(clean(value).toLowerCase())

/** A single validation boundary for CSV, LLM and fallback-parser inputs. */
export function validateRule(candidate, { requireId = false } = {}) {
  const errors = []
  const scope = clean(candidate.scope).toLowerCase()
  const type = clean(candidate.type).toLowerCase()
  const ruleId = clean(candidate.ruleId || candidate.rule_id)
  const appliesTo = clean(candidate.appliesTo || candidate.applies_to)
  const value = Number(String(candidate.value ?? '').replace(/[₹,\s]/g, ''))
  const minRaw = clean(candidate.minCartValue ?? candidate.min_cart_value)
  const minCartValue = minRaw ? Number(minRaw.replace(/[₹,\s]/g, '')) : null

  if (requireId && !ruleId) errors.push('rule_id is required')
  if (!['brand', 'platform', 'cart'].includes(scope)) errors.push('scope must be brand, platform, or cart')
  if (!['percentage', 'flat'].includes(type)) errors.push('type must be percentage or flat')
  if (!Number.isFinite(value) || value <= 0) errors.push('value must be a positive number')
  if (type === 'percentage' && value > 100) errors.push('percentage value cannot exceed 100')
  if ((scope === 'brand' || scope === 'platform') && !appliesTo) errors.push('applies_to is required for brand and platform rules')
  if (scope === 'cart' && type !== 'percentage') errors.push('cart rules must use a percentage discount')
  if (scope === 'cart' && (!Number.isFinite(minCartValue) || minCartValue <= 0)) errors.push('cart rules need a positive min_cart_value')

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    errors: [],
    rule: {
      ruleId: ruleId || null,
      scope,
      appliesTo: scope === 'cart' ? '' : appliesTo,
      type,
      value: Number(value),
      stackable: asBoolean(candidate.stackable),
      minCartValue: scope === 'cart' ? Math.round(minCartValue) : null,
    },
  }
}
