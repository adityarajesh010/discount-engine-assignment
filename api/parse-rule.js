import { validateRule } from '../src/engine/ruleValidation.js'

const ruleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['scope', 'appliesTo', 'type', 'value', 'stackable', 'minCartValue'],
  properties: {
    scope: { type: 'string', enum: ['brand', 'platform', 'cart'] },
    appliesTo: { type: 'string', description: 'The exact brand or platform, otherwise an empty string for cart.' },
    type: { type: 'string', enum: ['percentage', 'flat'] },
    value: { type: 'number' },
    stackable: { type: 'boolean' },
    minCartValue: { type: ['number', 'null'] },
  },
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['rule', 'clarification'],
  properties: {
    rule: { anyOf: [ruleSchema, { type: 'null' }] },
    clarification: { type: ['string', 'null'] },
  },
}

const instructions = [
  'Extract one explicitly specified marketplace discount rule from the user text.',
  'For missing or ambiguous amounts, targets, or thresholds, multiple offers, or unsupported conditions, return rule: null and a short clarification. Never invent missing values.',
  'For a valid rule, set clarification to null. Brand and platform rules must name the exact target, without words like "brand" or "items", and use minCartValue: null.',
  'Cart rules apply to the discounted cart subtotal. They require a percentage, an empty appliesTo, and a positive minimum, interpreted inclusively. Extract the stated threshold amount.',
  'Set stackable to true only if combining offers is explicitly allowed. Treat negation as false.',
].join(' ')

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' })
  const text = typeof request.body?.text === 'string' ? request.body.text.trim() : ''
  if (!text || text.length > 500) return response.status(400).json({ error: 'Provide a rule description of 1 to 500 characters.' })
  if (!process.env.OPENAI_API_KEY) {
    return response.status(503).json({ code: 'AI_NOT_CONFIGURED', error: 'AI parser is not configured.' })
  }

  try {
    const completion = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        store: false,
        instructions,
        max_output_tokens: 600,
        input: text,
        text: {
          format: {
            type: 'json_schema',
            name: 'discount_rule',
            strict: true,
            schema,
          },
        },
      }),
    })
    if (!completion.ok) return response.status(502).json({ error: 'The AI parser is unavailable. Try again shortly.' })
    const payload = await completion.json()
    const content = payload.output?.filter((item) => item.type === 'message').flatMap((item) => item.content) ?? []
    if (content.some((part) => part.type === 'refusal')) {
      return response.status(422).json({ error: 'Describe one discount, its amount, and who it applies to.' })
    }
    const outputText = content.filter((part) => part.type === 'output_text').map((part) => part.text).join('')
    if (payload.status !== 'completed' || !outputText) {
      return response.status(502).json({ error: 'The AI response was incomplete. Try again.' })
    }
    const parsed = JSON.parse(outputText)
    if (parsed?.rule === null) {
      const clarification = typeof parsed.clarification === 'string' ? parsed.clarification.trim() : ''
      return response.status(422).json({ error: clarification || 'Provide a discount amount and a clear target or cart minimum.' })
    }
    const validation = validateRule(parsed?.rule)
    if (!validation.ok) return response.status(422).json({ error: validation.errors.join('. ') })
    return response.status(200).json({ rule: validation.rule })
  } catch {
    return response.status(502).json({ error: 'The AI parser did not return a usable response. Try again.' })
  }
}
