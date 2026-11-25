import { useRef } from 'react'

export default function FileUploader({ label, accept, description, fileName, onSelect }) {
  const input = useRef(null)

  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        aria-label={label}
        accept={accept}
        onChange={(event) => {
          const file = event.target.files[0]
          event.target.value = ''
          if (file) onSelect(file)
        }}
      />
      <button type="button" className={`upload-card ${fileName ? 'is-loaded' : ''}`} aria-label={`Upload ${label}`} onClick={() => input.current?.click()}>
        <span className="upload-icon" aria-hidden="true">{fileName ? '✓' : '↥'}</span>
        <span><strong>{label}</strong><small>{fileName || description}</small></span>
        <span className="text-button">{fileName ? 'Replace' : 'Upload'}</span>
      </button>
    </>
  )
}
