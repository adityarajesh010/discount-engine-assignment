import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/parse-rule.js'
import { requestRuleParse } from '../src/engine/ruleInterpreter.js'

async function callRoute(text, method = 'POST') {
  const response = {
    status(status) { this.statusCode = status; return this },
    json(body) { return Response.json(body, { status: this.statusCode }) },
  }
  return handler({ method, body: { text } }, response)
}

const rule = { scope: 'brand', appliesTo: 'Forge Works', type: 'percentage', value: 17.5, stackable: false, minCartValue: null }
const completed = (content) => Response.json({ status: 'completed', output: [{ type: 'message', content }] })
const structured = (result) => completed([{ type: 'output_text', text: JSON.stringify(result) }])

test('server route handles raw Responses API output and keeps the credential server-side', async (t) => {
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'mock-server-key'
  t.after(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
  })

  const input = 'Forge Works should take seventeen and a half per cent off'
  const upstream = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses')
    assert.equal(options.headers.Authorization, 'Bearer mock-server-key')
    const sent = JSON.parse(options.body)
    assert.equal(sent.input, input)
    assert.equal(sent.store, false)
    assert.equal(sent.text.format.strict, true)
    return structured({ rule, clarification: null })
  })
  const success = await callRoute(input)
  assert.equal(success.status, 200)
  assert.deepEqual(await success.json(), { rule: { ruleId: null, ...rule } })
  assert.equal(upstream.mock.callCount(), 1)

  for (const [payload, status, message] of [
    [() => structured({ rule: null, clarification: 'What discount and minimum cart value should apply?' }), 422, /minimum cart value/],
    [() => structured({ rule: { ...rule, value: 120 }, clarification: null }), 422, /cannot exceed 100/],
    [() => completed([{ type: 'refusal', refusal: 'refused' }]), 422, /Describe one discount/],
    [() => completed([{ type: 'output_text', text: 'invalid JSON' }]), 502, /usable response/],
    [() => Response.json({ status: 'incomplete', output: [] }), 502, /incomplete/],
    [() => new Response('', { status: 429 }), 502, /unavailable/],
  ]) {
    upstream.mock.mockImplementation(async () => payload())
    const result = await callRoute(input)
    assert.equal(result.status, status)
    assert.match((await result.json()).error, message)
  }
  const count = upstream.mock.callCount()
  assert.equal((await callRoute(input, 'GET')).status, 405)
  assert.equal((await callRoute(' '.repeat(3))).status, 400)
  assert.equal((await callRoute('x'.repeat(501))).status, 400)
  assert.equal(upstream.mock.callCount(), count)
})

test('browser adapter preserves provider errors and falls back only when AI is absent', async (t) => {
  const mocked = t.mock.method(globalThis, 'fetch', async () => Response.json({ rule }))
  const input = '20% off for Forge Works brand'
  assert.equal((await requestRuleParse(input)).source, 'llm')

  mocked.mock.mockImplementation(async () => Response.json({ error: 'Offer target is ambiguous' }, { status: 422 }))
  assert.deepEqual(await requestRuleParse(input), { ok: false, errors: ['Offer target is ambiguous'] })

  mocked.mock.mockImplementation(async () => Response.json({ rule: null }))
  assert.equal((await requestRuleParse(input)).ok, false)

  mocked.mock.mockImplementation(async () => Response.json({ code: 'AI_NOT_CONFIGURED' }, { status: 503 }))
  const fallback = await requestRuleParse(input)
  assert.equal(fallback.source, 'local')
  assert.equal(fallback.candidate.appliesTo, 'Forge Works')
})
