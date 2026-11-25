import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseCartPDF } from '../src/engine/pdfCartParser.js'
import { parseCartCSV, parseRulesCSV } from '../src/engine/csvParser.js'
import { evaluateCart } from '../src/engine/discountEngine.js'

const sample = (name) => readFile(new URL(`../sample-data/${name}`, import.meta.url))
const pdfFile = async (path) => new Blob([await readFile(new URL(path, import.meta.url))], { type: 'application/pdf' })

test('the sample PDF produces the same items and quote as the sample CSV', async () => {
  const pdf = await parseCartPDF(await pdfFile('../sample-data/cart.pdf'))
  const csv = parseCartCSV(String(await sample('cart.csv')))
  const rules = parseRulesCSV(String(await sample('rules.csv')))
  const withoutIds = (items) => items.map(({ itemId, ...fields }) => fields)
  assert.deepEqual(pdf.errors, [])
  assert.deepEqual(withoutIds(pdf.data), withoutIds(csv.data))
  assert.equal(evaluateCart(pdf.data, rules.data).total, 5339)
})

test('a PDF preserves valid rows across pages and reports invalid or missing cells', async () => {
  const result = await parseCartPDF(await pdfFile('./fixtures/mixed-cart.pdf'))
  assert.deepEqual(result.data.map(({ product, basePrice }) => [product, basePrice]), [
    ['Steel Trivet', 1251],
    ['Travel Tin', 200],
  ])
  assert.equal(result.errors.length, 3)
  assert.match(result.errors[0], /Page 1.*Invalid amount/)
  assert.match(result.errors[1], /Missing platform/)
  assert.match(result.errors[2], /Negative amount/)
})

test('a fixed-width text table preserves multiword product, brand, and platform names', async () => {
  const result = await parseCartPDF(await pdfFile('./fixtures/aligned-cart.pdf'))
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.data, [
    { itemId: 'PDF-01', product: 'Travel Tin', brand: 'North Lines', platform: 'River Market', basePrice: 800 },
  ])
})

test('image-only PDFs report an actionable error and return no items', async () => {
  const result = await parseCartPDF(await pdfFile('./fixtures/image-only-cart.pdf'))
  assert.deepEqual(result.data, [])
  assert.match(result.errors[0], /selectable.*text-based PDF/i)
})

test('corrupt and oversized PDFs fail cleanly', async () => {
  await assert.rejects(parseCartPDF(new Blob(['invalid PDF bytes'])), /invalid pdf/i)
  await assert.rejects(parseCartPDF({ size: 10 * 1024 * 1024 + 1 }), /10 MB/)
})
