/**
 * Pure checkout pricing. Inputs are plain CartItem / DiscountRule objects;
 * nothing in here knows how a rule or a cart entered the application.
 */

const normalise = (value = '') => String(value).trim().toLowerCase()
const money = (amount) => Math.max(0, Math.round(amount))

export function calculateDiscountAmount(price, rule) {
  if (rule.type === 'percentage') return money(price * rule.value / 100)
  if (rule.type === 'flat') return money(rule.value)
  return 0
}

export function ruleMatchesItem(item, rule) {
  if (rule.scope === 'brand') return normalise(item.brand) === normalise(rule.appliesTo)
  if (rule.scope === 'platform') return normalise(item.platform) === normalise(rule.appliesTo)
  return false
}

function offerLabel(rule) {
  const scope = rule.scope === 'brand' ? 'Brand' : rule.scope === 'platform' ? 'Platform' : 'Cart'
  const value = rule.type === 'percentage' ? `${rule.value}% off` : `Rs.${rule.value} off`
  return `${scope} offer: ${value}`
}

function applyRule(price, rule) {
  const saving = Math.min(price, calculateDiscountAmount(price, rule))
  return { price: money(price - saving), saving }
}

/**
 * Pick the customer-best non-stackable offer, then apply every compatible
 * stackable offer on the running price. Stable sorting makes equal savings
 * predictable: the first rule in the supplied rule set wins a tie.
 */
function priceWithRules(startingPrice, candidateRules) {
  const nonStackable = candidateRules.filter((rule) => !rule.stackable)
  const stackable = candidateRules.filter((rule) => rule.stackable)
  const ranked = nonStackable
    .map((rule, index) => ({ rule, index, saving: Math.min(startingPrice, calculateDiscountAmount(startingPrice, rule)) }))
    .sort((a, b) => b.saving - a.saving || a.index - b.index)

  let price = startingPrice
  const applied = []

  if (ranked[0] && ranked[0].saving > 0) {
    const outcome = applyRule(price, ranked[0].rule)
    price = outcome.price
    applied.push({ ...ranked[0].rule, saving: outcome.saving })
  }

  stackable.forEach((rule) => {
    const outcome = applyRule(price, rule)
    price = outcome.price
    if (outcome.saving > 0) applied.push({ ...rule, saving: outcome.saving })
  })

  return {
    finalPrice: money(price),
    totalDiscount: money(startingPrice - price),
    applied,
    skipped: ranked.slice(1).map(({ rule, saving }) => ({ ...rule, saving })),
  }
}

export function applyDiscounts(item, rules) {
  const matchingRules = rules.filter((rule) => rule.scope !== 'cart' && ruleMatchesItem(item, rule))
  const outcome = priceWithRules(item.basePrice, matchingRules)
  const reasoning = outcome.applied.length
    ? outcome.applied.map((rule) => offerLabel(rule)).join(' + ')
    : 'No offers available'

  return {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
    finalPrice: outcome.finalPrice,
    totalDiscount: outcome.totalDiscount,
    appliedRules: outcome.applied.map((rule) => rule.ruleId),
    skippedRules: outcome.skipped.map((rule) => rule.ruleId),
    appliedOffers: outcome.applied,
    alternatives: outcome.skipped,
    reasoning,
  }
}

export function processCart(cartItems, rules) {
  return cartItems.map((item) => applyDiscounts(item, rules))
}

export function cartTotal(results) {
  return results.reduce((sum, result) => sum + result.finalPrice, 0)
}

function eligibleCartRules(rules, subtotal) {
  return rules.filter((rule) => (
    rule.scope === 'cart'
    && subtotal >= Number(rule.minCartValue || 0)
  ))
}

/**
 * The checkout contract used by the UI. Cart rules are evaluated only after
 * item pricing, so their threshold is always checked against the shopper's
 * actual item subtotal rather than the undiscounted list total.
 */
export function evaluateCart(cartItems, rules) {
  const items = processCart(cartItems, rules)
  const subtotal = cartTotal(items)
  const cartRules = rules.filter((rule) => rule.scope === 'cart')
  const eligible = eligibleCartRules(cartRules, subtotal)
  const outcome = priceWithRules(subtotal, eligible)
  const inactiveRules = cartRules.filter((rule) => !eligible.includes(rule))
  const nextThreshold = inactiveRules
    .map((rule) => Number(rule.minCartValue || 0))
    .filter((threshold) => threshold > subtotal)
    .sort((a, b) => a - b)[0]

  const cartOffer = outcome.applied.length
    ? {
        appliedRules: outcome.applied.map((rule) => rule.ruleId),
        skippedRules: outcome.skipped.map((rule) => rule.ruleId),
        label: outcome.applied.map((rule) => offerLabel(rule).replace('Cart offer: ', '')).join(' + '),
        saved: outcome.totalDiscount,
        reasoning: outcome.applied.map((rule) => offerLabel(rule)).join(' + '),
      }
    : null

  return {
    items,
    subtotal,
    cartOffer,
    total: outcome.finalPrice,
    totalSavings: money(items.reduce((sum, item) => sum + item.totalDiscount, 0) + outcome.totalDiscount),
    nextCartOffer: nextThreshold ? { threshold: nextThreshold, amountAway: nextThreshold - subtotal } : null,
  }
}
