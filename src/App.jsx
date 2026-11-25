import { useMemo, useRef, useState } from 'react'
import FileUploader from './components/FileUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import RuleComposer from './components/RuleComposer.jsx'
import { parseRulesCSV, parseCartCSV } from './engine/csvParser.js'
import { evaluateCart } from './engine/discountEngine.js'
import { parseCartPDF } from './engine/pdfCartParser.js'

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
  if (!item.alternatives.length || !item.appliedOffers.length) return null
  const winner = item.appliedOffers[0]
  return (
    <details className="rule-audit">
      <summary>{item.product}: why this offer won</summary>
      <p><strong>{winner.ruleId}</strong> saved {rupees(winner.saving)} before any stacked offers.</p>
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
    shouldShow && cartItems.length
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
  const [cartLoading, setCartLoading] = useState(false)
  const [shouldShowResults, setShouldShowResults] = useState(false)
  const rulesRead = useRef(0)
  const cartRead = useRef(0)
  const canCalculate = cartItems.length > 0
  const results = useCheckoutQuote(cartItems, rules, shouldShowResults)

  async function loadRules(file) {
    const request = ++rulesRead.current
    try {
      const parsed = parseRulesCSV(await file.text())
      if (request !== rulesRead.current) return
      setRulesErrors(parsed.errors.length || parsed.data.length ? parsed.errors : ['No rules found in the CSV.'])
      if (parsed.data.length) {
        setRules(parsed.data)
        setRulesFileName(file.name)
      }
    } catch {
      if (request === rulesRead.current) setRulesErrors(['Could not read the rules CSV.'])
    }
  }

  async function loadCart(file, format) {
    const request = ++cartRead.current
    setCartLoading(true)
    setCartErrors([])
    try {
      const parsed = format === 'pdf' ? await parseCartPDF(file) : parseCartCSV(await file.text())
      if (request !== cartRead.current) return
      setCartErrors(parsed.errors.length || parsed.data.length ? parsed.errors : ['No cart items found.'])
      if (!parsed.data.length) return
      setCartItems(parsed.data)
      setCartFileName(file.name)
      setShouldShowResults(format === 'pdf')
    } catch (error) {
      if (request === cartRead.current) setCartErrors([`Could not read the ${format.toUpperCase()}: ${error.message}`])
    } finally {
      if (request === cartRead.current) setCartLoading(false)
    }
  }

  function addNaturalLanguageRule(candidate) {
    setRules((current) => {
      const ids = new Set(current.map((rule) => rule.ruleId))
      let index = 1
      let ruleId = 'RULE-NL-01'
      while (ids.has(ruleId)) {
        index += 1
        ruleId = `RULE-NL-${String(index).padStart(2, '0')}`
      }
      return [...current, { ...candidate, ruleId }]
    })
    setShouldShowResults(true)
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
            <FileUploader label="Rules CSV" accept=".csv" description="Brand, platform, and cart rules" onSelect={loadRules} fileName={rulesFileName} />
            <ErrorBanner errors={rulesErrors} />
            {rules.length > 0 && <div className="data-preview"><span>{rules.length} active rule{rules.length === 1 ? '' : 's'}</span><DataTable columns={RULES_COLUMNS} rows={rules} /></div>}
          </div>

          <div className="panel">
            <div className="panel-heading"><div><span className="step">02</span><h2>Load the cart</h2></div><span className="panel-caption">CSV or PDF</span></div>
            <div className="upload-options">
              <FileUploader label="Cart CSV" accept=".csv" description="Upload cart.csv" onSelect={(file) => loadCart(file, 'csv')} fileName={/\.csv$/i.test(cartFileName) ? cartFileName : ''} />
              <FileUploader label="Cart PDF" accept="application/pdf,.pdf" description="Product, Brand, Platform, Base Price" onSelect={(file) => loadCart(file, 'pdf')} fileName={/\.pdf$/i.test(cartFileName) ? cartFileName : ''} />
            </div>
            <p className="help-text">Use a PDF with selectable text. The importer lists any rows it skipped.</p>
            {cartLoading && <p className="help-text" role="status">Reading cart…</p>}
            <ErrorBanner errors={cartErrors} />
            {cartItems.length > 0 && <div className="data-preview"><span>{cartItems.length} cart item{cartItems.length === 1 ? '' : 's'}</span><DataTable columns={CART_COLUMNS} rows={cartItems} /></div>}
          </div>
        </section>

        <RuleComposer onConfirm={addNaturalLanguageRule} />

        <div className="calculate-wrap">
          <button className="primary-button calculate" disabled={!canCalculate} onClick={() => setShouldShowResults(true)}>Calculate best price <span>→</span></button>
          {!canCalculate && <span>Load a cart to calculate its total.</span>}
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
