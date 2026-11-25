import Papa from 'papaparse'
import { validateRule } from './ruleValidation.js'
import { readAmount } from './moneyInput.js'

function parse(csvText) {
  return Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
  })
}

export function parseRulesCSV(csvText) {
  const { data: rows, errors: parseErrors } = parse(csvText)
  // min_cart_value is optional for item rules, so a trailing blank CSV column
  // is allowed. Other CSV shape errors still fail the import.
  const fatalErrors = parseErrors.filter((error) => error.code !== 'TooFewFields')
  if (fatalErrors.length) return { data: [], errors: fatalErrors.map((error) => error.message) }

  const data = []
  const errors = []
  const ids = new Set()
  rows.forEach((row, index) => {
    const validation = validateRule({
      ruleId: row.rule_id,
      scope: row.scope,
      appliesTo: row.applies_to,
      type: row.type,
      value: row.value,
      stackable: row.stackable,
      minCartValue: row.min_cart_value,
    }, { requireId: true })
    if (!validation.ok) {
      errors.push(`Row ${index + 2}: ${validation.errors.join('; ')}`)
      return
    }
    if (ids.has(validation.rule.ruleId)) {
      errors.push(`Row ${index + 2}: duplicate rule_id "${validation.rule.ruleId}"`)
      return
    }
    ids.add(validation.rule.ruleId)
    data.push(validation.rule)
  })
  return { data, errors }
}

export function parseCartCSV(csvText) {
  const { data: rows, errors: parseErrors } = parse(csvText)
  if (parseErrors.length) return { data: [], errors: parseErrors.map((error) => error.message) }

  const data = []
  const errors = []
  const ids = new Set()
  rows.forEach((row, index) => {
    const required = ['item_id', 'product', 'brand', 'platform', 'base_price'].filter((field) => !String(row[field] ?? '').trim())
    const basePrice = readAmount(row.base_price)
    if (required.length || !Number.isFinite(basePrice) || Math.round(basePrice) <= 0) {
      const problem = required.length ? `missing fields - ${required.join(', ')}` : `base_price must be a valid INR amount that rounds to at least Rs.1, got "${row.base_price}"`
      errors.push(`Row ${index + 2}: ${problem}`)
      return
    }
    const itemId = String(row.item_id).trim()
    if (ids.has(itemId)) {
      errors.push(`Row ${index + 2}: duplicate item_id "${itemId}"`)
      return
    }
    ids.add(itemId)
    data.push({
      itemId,
      product: String(row.product).trim(),
      brand: String(row.brand).trim(),
      platform: String(row.platform).trim(),
      basePrice: Math.round(basePrice),
    })
  })
  return { data, errors }
}
