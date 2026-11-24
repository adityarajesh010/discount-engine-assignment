import Papa from 'papaparse'
import { validateRule } from './ruleValidation.js'

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
    data.push(validation.rule)
  })
  return { data, errors }
}

export function parseCartCSV(csvText) {
  const { data: rows, errors: parseErrors } = parse(csvText)
  if (parseErrors.length) return { data: [], errors: parseErrors.map((error) => error.message) }

  const data = []
  const errors = []
  rows.forEach((row, index) => {
    const required = ['item_id', 'product', 'brand', 'platform', 'base_price'].filter((field) => !String(row[field] ?? '').trim())
    const basePrice = Number(String(row.base_price || '').replace(/[₹,\s]/g, ''))
    if (required.length || !Number.isFinite(basePrice) || basePrice <= 0) {
      const problem = required.length ? `missing fields - ${required.join(', ')}` : `base_price must be a positive number, got "${row.base_price}"`
      errors.push(`Row ${index + 2}: ${problem}`)
      return
    }
    data.push({
      itemId: String(row.item_id).trim(),
      product: String(row.product).trim(),
      brand: String(row.brand).trim(),
      platform: String(row.platform).trim(),
      basePrice: Math.round(basePrice),
    })
  })
  return { data, errors }
}
