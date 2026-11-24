import { useRef, useState } from 'react'
import { parseCartPDF } from '../engine/pdfCartParser.js'

export default function PdfCartUploader({ onLoad, hasData, fileName, onError }) {
  const inputRef = useRef(null)
  const [loading, setLoading] = useState(false)

  async function handleFile(event) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    setLoading(true)
    try {
      const parsed = await parseCartPDF(file)
      onLoad(parsed, file.name)
    } catch (error) {
      onError([`Could not read this PDF: ${error.message}`])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`upload-card ${hasData ? 'is-loaded' : ''}`} onClick={() => !loading && inputRef.current?.click()}>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={handleFile} />
      <div className="upload-icon" aria-hidden="true">{loading ? '…' : hasData ? '✓' : '⌁'}</div>
      <div>
        <strong>Cart PDF</strong>
        <span>{loading ? 'Reading selectable table…' : hasData ? fileName : 'Product, Brand, Platform, Base Price'}</span>
      </div>
      <button type="button" className="text-button" tabIndex={-1}>{loading ? 'Reading' : hasData ? 'Replace' : 'Upload'}</button>
    </div>
  )
}
