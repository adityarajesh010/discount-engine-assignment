import { readAmount } from './moneyInput.js'

const headers = ['product', 'brand', 'platform', 'base price']
const cellGap = / {2,}|\t+/
const compact = (value) => value.replace(/\s+/g, ' ').trim()
const maxFileSize = 10 * 1024 * 1024
const maxPages = 50

let runtime

async function loadPdfRuntime() {
  if (!runtime) {
    runtime = import('pdfjs-dist/legacy/build/pdf.mjs').then(async (pdfjs) => {
      if (typeof window !== 'undefined') {
        const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      }
      return pdfjs
    }).catch((error) => {
      runtime = undefined
      throw error
    })
  }
  return runtime
}

function rowsFromPage(items) {
  const runs = items.filter((item) => item.str?.trim()).map((item) => ({
    x: item.transform[4],
    y: item.transform[5],
    text: item.str,
  })).sort((a, b) => b.y - a.y)
  const rows = []
  for (const run of runs) {
    let row = rows.at(-1)
    if (!row || row.y - run.y > 2) {
      row = { y: run.y, runs: [] }
      rows.push(row)
    }
    row.runs.push(run)
  }
  return rows.map((row) => row.runs.sort((a, b) => a.x - b.x))
}

function readHeader(row) {
  const labels = row.map((run) => compact(run.text).toLowerCase())
  if (labels.join(' ') !== headers.join(' ')) return null
  if (labels.length >= 4 && headers.slice(0, 3).every((label, index) => labels[index] === label)) {
    return { starts: row.slice(0, 4).map((run) => run.x) }
  }
  if (row.length === 1 && row[0].text.trim().split(cellGap).length === headers.length) {
    return { starts: null }
  }
  return null
}

function readCells(row, layout) {
  if (!layout.starts || (row.length === 1 && cellGap.test(row[0].text.trim()))) {
    return row.map((run) => run.text).join(' ').trim().split(cellGap).map(compact)
  }
  const cells = headers.map(() => [])
  for (const run of row) {
    // A word inside a long cell still belongs to that cell until the next column starts.
    const column = layout.starts.findLastIndex((start) => run.x >= start - 6)
    cells[Math.max(0, column)].push(run.text)
  }
  return cells.map((parts) => compact(parts.join(' ')))
}

export async function parseCartPDF(file) {
  if (file.size > maxFileSize) throw new Error('Choose a PDF of 10 MB or less.')
  const pdfjs = await loadPdfRuntime()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false })
  const data = []
  const errors = []
  let layout = null
  try {
    const document = await task.promise
    if (document.numPages > maxPages) throw new Error('Choose a PDF of 50 pages or fewer.')

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const { items } = await page.getTextContent()
      let inTable = false
      for (const row of rowsFromPage(items)) {
        const header = readHeader(row)
        if (header) {
          layout = header
          inTable = true
          continue
        }
        if (!layout) continue
        const visible = compact(row.map((run) => run.text).join(' '))
        if (/^[-–—─=]+$/.test(visible)) continue

        const cells = readCells(row, layout)
        // A later page can continue the previous table without repeating its headings.
        if (!inTable && cells.filter(Boolean).length < 3) continue
        const [product, brand, platform, price] = cells
        const basePrice = Math.round(readAmount(price))
        if (cells.length !== 4 || !product || !brand || !platform || !(basePrice > 0)) {
          errors.push(`Page ${pageNumber}: skipped malformed row “${visible.slice(0, 160)}”.`)
          continue
        }
        inTable = true
        data.push({
          itemId: `PDF-${String(data.length + 1).padStart(2, '0')}`,
          product,
          brand,
          platform,
          basePrice,
        })
      }
      page.cleanup()
    }
  } finally {
    await task.destroy()
  }

  if (!layout) errors.unshift('No selectable Product / Brand / Platform / Base Price table found. Use a text-based PDF or upload a CSV.')
  else if (!data.length) errors.unshift('The table contained no valid cart items.')
  return { data, errors }
}
