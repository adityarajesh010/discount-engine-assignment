import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/parse-rule.js'
import { requestRuleParse } from '../src/engine/ruleInterpreter.js'

async function callRoute(text, method = 'POST') {
  const response = {
    setHeader() {},
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
  assert.deepEqual(await (await callRoute(input, 'GET')).json(), { configured: true })
  delete process.env.OPENAI_API_KEY
  assert.deepEqual(await (await callRoute(input, 'GET')).json(), { configured: false })
  assert.equal((await callRoute(input, 'DELETE')).status, 405)
  assert.equal((await callRoute(' '.repeat(3))).status, 400)
  assert.equal((await callRoute('x'.repeat(501))).status, 400)
  assert.equal(upstream.mock.callCount(), count)
})

test('hosted parser runs only when configured and preserves provider errors', async (t) => {
  let configured = true
  let result = () => Response.json({ rule })
  let posts = 0
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    if (options.method !== 'POST') {
      assert.equal(options.body, undefined)
      return Response.json({ configured })
    }
    posts += 1
    return result()
  })
  const input = '20% off for Forge Works brand'
  assert.equal((await requestRuleParse(input)).source, 'llm')

  result = () => Response.json({ error: 'Offer target is ambiguous' }, { status: 422 })
  assert.deepEqual(await requestRuleParse(input), { ok: false, errors: ['Offer target is ambiguous'] })

  result = () => Response.json({ rule: null })
  assert.equal((await requestRuleParse(input)).ok, false)

  configured = false
  const fallback = await requestRuleParse(input)
  assert.equal(fallback.source, 'local')
  assert.equal(fallback.candidate.appliesTo, 'Forge Works')
  assert.equal(posts, 3)
})

test('on-device parsing validates structured output and sends no request to the hosted parser', async (t) => {
  const network = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network call') })
  let output = { rule, clarification: null }
  let closed = 0
  globalThis.LanguageModel = {
    availability: async () => 'available',
    create: async ({ initialPrompts }) => {
      assert.equal(initialPrompts[0].role, 'system')
      return {
        async prompt(text, { responseConstraint }) {
          assert.match(text, /Forge Works/)
          assert.deepEqual(responseConstraint.required, ['rule', 'clarification'])
          return JSON.stringify(output)
        },
        destroy() { closed += 1 },
      }
    },
  }
  t.after(() => { delete globalThis.LanguageModel })

  const input = 'Forge Works should take seventeen and a half per cent off'
  const parsed = await requestRuleParse(input)
  assert.equal(parsed.source, 'browser')
  assert.equal(parsed.candidate.value, 17.5)
  output = { rule: null, clarification: 'Which discount amount should apply?' }
  assert.deepEqual(await requestRuleParse(input), { ok: false, errors: [output.clarification] })
  output = { rule: { ...rule, value: 150 }, clarification: null }
  assert.equal((await requestRuleParse(input)).ok, false)
  assert.equal(closed, 3)
  assert.equal(network.mock.callCount(), 0)
})
