import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseRulesCSV, parseCartCSV } from '../src/engine/csvParser.js'
import { applyDiscounts, evaluateCart } from '../src/engine/discountEngine.js'
import { parseRuleLocally, requestRuleParse } from '../src/engine/ruleInterpreter.js'
import { validateRule } from '../src/engine/ruleValidation.js'

async function sampleInputs() {
  const [rulesCsv, cartCsv] = await Promise.all([
    readFile(new URL('../sample-data/rules.csv', import.meta.url), 'utf8'),
    readFile(new URL('../sample-data/cart.csv', import.meta.url), 'utf8'),
  ])
  return { rules: parseRulesCSV(rulesCsv).data, cart: parseCartCSV(cartCsv).data }
}

test('sample cart matches the assignment price and cart-offer results', async () => {
  const { rules, cart } = await sampleInputs()
  const quote = evaluateCart(cart, rules)

  assert.deepEqual(quote.items.map((item) => item.finalPrice), [1104, 629, 509, 2499, 382, 809])
  assert.equal(quote.subtotal, 5932)
  assert.equal(quote.cartOffer.saved, 593)
  assert.equal(quote.total, 5339)
  assert.equal(quote.items[3].reasoning, 'No offers available')
})

test('cart offer does not apply one rupee below its post-item threshold', () => {
  const quote = evaluateCart(
    [{ itemId: 'ONE', product: 'Chair', brand: 'A', platform: 'B', basePrice: 3999 }],
    [{ ruleId: 'CART-10', scope: 'cart', appliesTo: '', type: 'percentage', value: 10, stackable: false, minCartValue: 4000 }],
  )
  assert.equal(quote.cartOffer, null)
  assert.equal(quote.total, 3999)
  assert.deepEqual(quote.nextCartOffer, { threshold: 4000, amountAway: 1 })
})

test('flat offers cannot lower an item below zero', () => {
  const result = applyDiscounts(
    { itemId: 'ONE', product: 'Tray', brand: 'A', platform: 'B', basePrice: 90 },
    [{ ruleId: 'BIG', scope: 'brand', appliesTo: 'A', type: 'flat', value: 150, stackable: false }],
  )
  assert.equal(result.finalPrice, 0)
  assert.equal(result.totalDiscount, 90)
})

test('natural-language fallback accepts all brief examples and rejects ambiguity', () => {
  assert.deepEqual(parseRuleLocally('20% off for Natura Casa brand, stackable with other offers').candidate, {
    ruleId: null, scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true, minCartValue: null,
  })
  assert.deepEqual(parseRuleLocally('Rs.100 flat discount on all Flipkart items').candidate, {
    ruleId: null, scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false, minCartValue: null,
  })
  assert.deepEqual(parseRuleLocally('10% off if cart value is more than Rs.5,000').candidate, {
    ruleId: null, scope: 'cart', appliesTo: '', type: 'percentage', value: 10, stackable: false, minCartValue: 5000,
  })
  assert.equal(parseRuleLocally('Give a discount for big orders').ok, false)
})

test('AI-route absence uses the safe local parser instead of blocking a local demo', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('Not found', { status: 404 })
  try {
    const parsed = await requestRuleParse('20% off for Natura Casa brand')
    assert.equal(parsed.ok, true)
    assert.equal(parsed.source, 'local')
    assert.equal(parsed.candidate.appliesTo, 'Natura Casa')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('LLM-shaped data cannot bypass checkout business rules', () => {
  const invalid = validateRule({
    scope: 'cart', appliesTo: '', type: 'flat', value: 100, stackable: false, minCartValue: 5000,
  })
  assert.equal(invalid.ok, false)
  assert.match(invalid.errors.join(' '), /percentage/)
})

test('the discounted subtotal controls eligibility, and an exact threshold qualifies', () => {
  const cart = [{ itemId: 'X', product: 'Box', brand: 'Forge', platform: 'River', basePrice: 4100 }]
  const itemRule = { ruleId: '1', scope: 'brand', appliesTo: 'Forge', type: 'flat', value: 101, stackable: false }
  const cartRule = { ruleId: '2', scope: 'cart', type: 'percentage', value: 10, minCartValue: 4000, stackable: false }
  assert.equal(evaluateCart(cart, [itemRule, cartRule]).cartOffer, null)
  const quote = evaluateCart(cart, [{ ...itemRule, value: 100 }, cartRule])
  assert.equal(quote.subtotal, 4000)
  assert.equal(quote.total, 3600)
})

test('offline parsing supports arbitrary names and rejects unsupported conditions', () => {
  const parsed = parseRuleLocally('INR 1,250 off on all River Market items, not stackable')
  assert.equal(parsed.candidate.value, 1250)
  assert.equal(parsed.candidate.appliesTo, 'River Market')
  assert.equal(parsed.candidate.stackable, false)
  assert.equal(parseRuleLocally('12.5% off for Orbits brand, stackable').candidate.stackable, true)
  for (const text of ['-10% off for Orbits brand', '10% off for Orbits brand on Mondays', '10% off for Alpha and 5% off for Beta brand']) {
    assert.equal(parseRuleLocally(text).ok, false, text)
  }
})

test('CSV rejects corrupt money, invalid stack flags, and duplicate IDs', () => {
  const rules = parseRulesCSV('rule_id,scope,applies_to,type,value,stackable\nR,brand,A,percentage,15,false\nR,brand,A,flat,50,true\nX,brand,A,flat,50,maybe')
  assert.equal(rules.data.length, 1)
  assert.match(rules.errors.join(' '), /duplicate rule_id.*stackable/)
  const cart = parseCartCSV('item_id,product,brand,platform,base_price\nX,Box,A,B,100\nX,Tin,A,B,200\nY,Tray,A,B,0x20')
  assert.equal(cart.data.length, 1)
  assert.match(cart.errors.join(' '), /duplicate item_id.*valid INR/)
})
