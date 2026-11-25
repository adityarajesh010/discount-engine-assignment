import { useState } from 'react'
import { requestRuleParse } from '../engine/ruleInterpreter.js'

const money = (value) => `Rs.${Number(value).toLocaleString('en-IN')}`

function Field({ label, value }) {
  return <div className="parsed-field"><span>{label}</span><strong>{value}</strong></div>
}

export default function RuleComposer({ onConfirm }) {
  const [text, setText] = useState('')
  const [candidate, setCandidate] = useState(null)
  const [errors, setErrors] = useState([])
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(false)

  async function parse() {
    setErrors([])
    setCandidate(null)
    if (!text.trim()) {
      setErrors(['Describe the offer before parsing it.'])
      return
    }
    setLoading(true)
    const result = await requestRuleParse(text)
    setLoading(false)
    if (!result.ok) {
      setErrors(result.errors || ['This rule could not be resolved.'])
      return
    }
    setCandidate(result.candidate)
    setSource(result.source)
  }

  function confirm() {
    onConfirm(candidate)
    setCandidate(null)
    setText('')
    setSource('')
  }

  return (
    <section className="rule-composer" aria-labelledby="rule-composer-title">
      <div className="section-kicker">Rule Studio</div>
      <div className="rule-composer-heading">
        <div>
          <h2 id="rule-composer-title">Describe an offer in plain English</h2>
          <p>Every rule is shown and validated before it can affect a price.</p>
        </div>
        <span className="security-note">Key stays server-side</span>
      </div>
      <div className="composer-row">
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setCandidate(null)
            setErrors([])
          }}
          placeholder="e.g. 20% off for Natura Casa brand, stackable with other offers"
          aria-label="Describe a discount rule"
          maxLength={500}
          disabled={loading}
        />
        <button className="primary-button" onClick={parse} disabled={loading}>{loading ? 'Parsing…' : 'Parse rule'}</button>
      </div>
      <div className="examples">Try: “Rs.100 flat discount on all Flipkart items” · “10% off if cart value is more than Rs.5,000”</div>
      {errors.length > 0 && <div className="inline-error" role="alert">{errors.map((error) => <div key={error}>{error}</div>)}</div>}
      {candidate && (
        <div className="confirmation-card">
          <div className="confirmation-topline">
            <strong>Confirm this structured rule</strong>
            <span className={`parser-source ${source}`}>{source === 'llm' ? 'AI parsed' : 'Local safe parser'}</span>
          </div>
          <div className="parsed-grid">
            <Field label="Scope" value={candidate.scope} />
            {candidate.scope !== 'cart' && <Field label="Applies to" value={candidate.appliesTo} />}
            <Field label="Discount" value={candidate.type === 'percentage' ? `${candidate.value}% off` : `${money(candidate.value)} off`} />
            <Field label="Stackable" value={candidate.stackable ? 'Yes' : 'No'} />
            {candidate.scope === 'cart' && <Field label="Cart subtotal at least" value={money(candidate.minCartValue)} />}
          </div>
          <div className="confirmation-actions">
            <button className="primary-button" onClick={confirm}>Add & recalculate</button>
            <button className="secondary-button" onClick={() => setCandidate(null)}>Discard</button>
          </div>
        </div>
      )}
    </section>
  )
}
