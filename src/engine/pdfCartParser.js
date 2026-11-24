const compact = (value) => String(value || '').replace(/\s+/g, ' ').trim()
const priceFrom = (value) => Number(String(value).replace(/[^0-9.]/g, ''))

let pdfRuntime

async function loadPdfRuntime() {
  if (!pdfRuntime) {
    pdfRuntime = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjsLib, worker]) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjsLib
    })
  }
  return pdfRuntime
}

function rowsFromPage(textItems) {
  const groups = new Map()
  textItems.forEach((item) => {
    const y = Math.round(item.transform[5] / 3) * 3
    const existing = groups.get(y) || []
    existing.push({ x: item.transform[4], text: item.str })
    groups.set(y, existing)
  })
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, tokens]) => tokens.sort((a, b) => a.x - b.x))
}

function headerColumns(row) {
  const rowText = row.map((token) => token.text).join('\t').toLowerCase()
  // Some invoice generators emit a whole visual row as one text run separated
  // by tabs. Keep that common PDF flavour as well as spatially-positioned text.
  if (['product', 'brand', 'platform', 'base price'].every((label) => rowText.includes(label))) {
    return { textual: true }
  }
  const named = {}
  row.forEach((token) => {
    const label = compact(token.text).toLowerCase()
    if (label === 'product') named.product = token.x
    if (label === 'brand') named.brand = token.x
    if (label === 'platform') named.platform = token.x
    if (label === 'base' || label === 'base price') named.price = token.x
  })
  return ['product', 'brand', 'platform', 'price'].every((key) => Number.isFinite(named[key])) ? named : null
}

function splitTextRow(row) {
  const raw = row.map((token) => token.text).join('')
  const cells = raw.split(/\t{2,}| {3,}/).map(compact).filter(Boolean)
  if (cells.length < 4) return []
  return [cells[0], cells[1], cells[2], cells.slice(3).join(' ')]
}

function splitAtColumns(row, columns) {
  const starts = [columns.product, columns.brand, columns.platform, columns.price]
  const boundaries = starts.slice(1).map((start, index) => (start + starts[index]) / 2)
  const cells = [[], [], [], []]
  row.forEach((token) => {
    const cell = token.x < boundaries[0] ? 0 : token.x < boundaries[1] ? 1 : token.x < boundaries[2] ? 2 : 3
    cells[cell].push(token.text)
  })
  return cells.map((cell) => compact(cell.join(' ')))
}

/** Extracts the specified selectable-text table. Image-only PDFs are rejected clearly. */
export async function parseCartPDF(file) {
  const pdfjsLib = await loadPdfRuntime()
  const bytes = await file.arrayBuffer()
  const document = await pdfjsLib.getDocument({ data: bytes }).promise
  const data = []
  const errors = []
  let foundHeader = false

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const rows = rowsFromPage(content.items.filter((item) => compact(item.str)))
    let columns = null

    for (const row of rows) {
      const header = headerColumns(row)
      if (header) {
        columns = header
        foundHeader = true
        continue
      }
      if (!columns) continue

      const [product, brand, platform, priceCell] = columns.textual ? splitTextRow(row) : splitAtColumns(row, columns)
      const basePrice = priceFrom(priceCell)
      const visibleRow = compact(row.map((token) => token.text).join(' '))
      if (!visibleRow || /^[-–—\s]+$/.test(visibleRow)) continue
      if (!product || !brand || !platform || !Number.isFinite(basePrice) || basePrice <= 0) {
        if (/rs\.?|₹|\d{2,}/i.test(visibleRow)) errors.push(`Page ${pageNumber}: skipped a malformed table row: “${visibleRow}”.`)
        continue
      }
      data.push({
        itemId: `PDF-${String(data.length + 1).padStart(2, '0')}`,
        product,
        brand,
        platform,
        basePrice: Math.round(basePrice),
      })
    }
  }

  if (!foundHeader) errors.unshift('No selectable Product / Brand / Platform / Base Price table was found. Use a text-based PDF in the expected four-column format.')
  if (foundHeader && !data.length) errors.unshift('A cart table header was found, but no valid item rows could be read.')
  return { data, errors }
}
