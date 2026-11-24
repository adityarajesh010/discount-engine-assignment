import { useMemo, useState } from 'react'
import CsvUploader from './components/CsvUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import PdfCartUploader from './components/PdfCartUploader.jsx'
import RuleComposer from './components/RuleComposer.jsx'
import { parseRulesCSV, parseCartCSV } from './engine/csvParser.js'
import { evaluateCart } from './engine/discountEngine.js'

const rupees = (amount) => `Rs.${Number(amount || 0).toLocaleString('en-IN')}`

const RULES_COLUMNS = [
  { key: 'ruleId', label: 'Rule ID' },
  { key: 'scope', label: 'Scope', render: (value) => value[0].toUpperCase() + value.slice(1) },
  { key: 'appliesTo', label: 'Applies to', render: (value, row) => row.scope === 'cart' ? 'Entire cart' : value },
  { key: 'type', label: 'Offer', render: (value, row) => value === 'percentage' ? `${row.value}% off` : `${rupees(row.value)} off` },
  { key: 'minCartValue', label: 'Condition', render: (value, row) => row.scope === 'cart' ? `Cart ≥ ${rupees(value)}` : '—' },
  { key: 'stackable', label: 'Stacks', render: (value) => value ? 'Yes' : 'No' },
]

const CART_COLUMNS = [
  { key: 'itemId', label: 'Item' },
  { key: 'product', label: 'Product' },
  { key: 'brand', label: 'Brand' },
  { key: 'platform', label: 'Platform' },
  { key: 'basePrice', label: 'Base price', render: (value) => rupees(value) },
]

const RESULTS_COLUMNS = [
  { key: 'itemId', label: 'Item' },
  { key: 'product', label: 'Product' },
  { key: 'basePrice', label: 'List', render: (value) => rupees(value) },
  { key: 'finalPrice', label: 'Best price', render: (value, row) => <strong className={row.totalDiscount ? 'price-green' : ''}>{rupees(value)}</strong> },
  { key: 'totalDiscount', label: 'Saved', render: (value) => value ? <span className="saving">−{rupees(value)}</span> : <span className="muted">—</span> },
  { key: 'reasoning', label: 'Why this price', render: (value) => <span className={value === 'No offers available' ? 'muted' : ''}>{value}</span> },
]

function RuleAudit({ item }) {
  if (!item.alternatives.length) return null
  return (
    <details className="rule-audit">
      <summary>{item.product}: why this offer won</summary>
      <p><strong>{item.appliedRules.join(' + ')}</strong> gives the best eligible price.</p>
      {item.alternatives.map((rule) => (
        <p key={rule.ruleId} className="muted">{rule.ruleId} was not combined because it is non-stackable ({rupees(rule.saving)} possible saving).</p>
      ))}
    </details>
  )
}

// Pricing is derived from the current cart and rules. Keeping a quote out of
// mutable state removes stale-result bugs when either input is replaced.
function useCheckoutQuote(cartItems, rules, shouldShow) {
  return useMemo(() => (
    shouldShow && cartItems.length && rules.length
      ? evaluateCart(cartItems, rules)
      : null
  ), [cartItems, rules, shouldShow])
}

export default function App() {
  const [rules, setRules] = useState([])
  const [rulesErrors, setRulesErrors] = useState([])
  const [rulesFileName, setRulesFileName] = useState('')
  const [cartItems, setCartItems] = useState([])
  const [cartErrors, setCartErrors] = useState([])
  const [cartFileName, setCartFileName] = useState('')
  const [shouldShowResults, setShouldShowResults] = useState(false)
  const canCalculate = rules.length > 0 && cartItems.length > 0
  const results = useCheckoutQuote(cartItems, rules, shouldShowResults)

  function handleRulesLoad(csvText, fileName) {
    const parsed = parseRulesCSV(csvText)
    setRules(parsed.data)
    setRulesErrors(parsed.errors)
    setRulesFileName(fileName)
    setShouldShowResults(false)
  }

  function handleCartCsvLoad(csvText, fileName) {
    const parsed = parseCartCSV(csvText)
    setCartItems(parsed.data)
    setCartErrors(parsed.errors)
    setCartFileName(fileName)
    setShouldShowResults(false)
  }

  function handlePdfLoad(parsed, fileName) {
    setCartErrors(parsed.errors)
    if (!parsed.data.length) return
    setCartItems(parsed.data)
    setCartFileName(fileName)
    setShouldShowResults(rules.length > 0)
  }

  function addNaturalLanguageRule(candidate) {
    const ruleId = `RULE-NL-${String(rules.filter((rule) => rule.ruleId.startsWith('RULE-NL-')).length + 1).padStart(2, '0')}`
    const nextRules = [...rules, { ...candidate, ruleId }]
    setRules(nextRules)
    if (cartItems.length) setShouldShowResults(true)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Opptra Discount Engine">O<span>pp</span>tra</a>
        <div className="topbar-note"><i /> Price confidence engine</div>
      </header>

      <main id="top" className="main-content">
        <section className="hero">
          <div>
            <div className="eyebrow">Checkout pricing, explained</div>
            <h1>The best eligible price.<br /><em>Nothing hidden.</em></h1>
            <p>A customer-first discount engine that picks the highest saving, applies valid stacks, and gives every rupee a reason.</p>
          </div>
          <div className="hero-proof">
            <span className="proof-icon">₹</span>
            <div><strong>Best-price promise</strong><small>Every non-stackable offer is compared before checkout.</small></div>
          </div>
        </section>

        <section className="workspace-grid" aria-label="Pricing inputs">
          <div className="panel">
            <div className="panel-heading"><div><span className="step">01</span><h2>Load active offers</h2></div><span className="panel-caption">CSV source</span></div>
            <CsvUploader label="rules.csv" description="Upload discount rules, including optional cart rules" onLoad={handleRulesLoad} hasData={rules.length > 0} fileName={rulesFileName} />
            <ErrorBanner errors={rulesErrors} />
            {rules.length > 0 && <div className="data-preview"><span>{rules.length} active rule{rules.length === 1 ? '' : 's'}</span><DataTable columns={RULES_COLUMNS} rows={rules} /></div>}
          </div>

          <div className="panel">
            <div className="panel-heading"><div><span className="step">02</span><h2>Load the cart</h2></div><span className="panel-caption">CSV or PDF</span></div>
            <div className="upload-options">
              <CsvUploader label="Cart CSV" description="Upload cart.csv" onLoad={handleCartCsvLoad} hasData={cartItems.length > 0 && cartFileName.endsWith('.csv')} fileName={cartFileName} />
              <PdfCartUploader onLoad={handlePdfLoad} onError={setCartErrors} hasData={cartItems.length > 0 && cartFileName.toLowerCase().endsWith('.pdf')} fileName={cartFileName} />
            </div>
            <p className="help-text">PDF import reads selectable-text tables. Valid rows are loaded; malformed rows are called out instead of guessed.</p>
            <ErrorBanner errors={cartErrors} />
            {cartItems.length > 0 && <div className="data-preview"><span>{cartItems.length} cart item{cartItems.length === 1 ? '' : 's'}</span><DataTable columns={CART_COLUMNS} rows={cartItems} /></div>}
          </div>
        </section>

        <RuleComposer onConfirm={addNaturalLanguageRule} />

        <div className="calculate-wrap">
          <button className="primary-button calculate" disabled={!canCalculate} onClick={() => setShouldShowResults(true)}>Calculate best price <span>→</span></button>
          {!canCalculate && <span>Load at least one offer and one cart item to calculate.</span>}
        </div>

        {results && (
          <section className="results-section" aria-live="polite">
            <div className="results-heading"><div><div className="section-kicker">Customer checkout</div><h2>Your price, fully explained</h2></div><span className="calculated-badge">Calculated now</span></div>
            <div className="metrics-row">
              <div><span>Item subtotal</span><strong>{rupees(results.subtotal)}</strong></div>
              <div><span>Total savings</span><strong className="saving">−{rupees(results.totalSavings)}</strong></div>
              <div className="total-metric"><span>Final cart total</span><strong>{rupees(results.total)}</strong></div>
            </div>
            {results.nextCartOffer && !results.cartOffer && <div className="threshold-nudge"><span>✦</span><div><strong>You’re {rupees(results.nextCartOffer.amountAway)} away from an extra cart offer.</strong><small>Add eligible items to reach {rupees(results.nextCartOffer.threshold)} after item discounts.</small></div></div>}
            <DataTable columns={RESULTS_COLUMNS} rows={results.items} />
            {results.cartOffer && <div className="cart-offer-row"><div><span className="offer-chip">Cart offer</span><strong>{results.cartOffer.label}</strong><small>{results.cartOffer.reasoning}</small></div><strong className="saving">−{rupees(results.cartOffer.saved)}</strong></div>}
            <div className="final-total-row"><span>Final cart total</span><strong>{rupees(results.total)}</strong></div>
            <div className="audit-list">{results.items.map((item) => <RuleAudit item={item} key={item.itemId} />)}</div>
          </section>
        )}
      </main>
    </div>
  )
}
