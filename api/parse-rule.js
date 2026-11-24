/*
 * Vercel serverless endpoint. OPENAI_API_KEY never reaches the browser.
 * The client re-validates this response before a rule is shown for approval.
 */
const schema = {
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

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' })
  const text = String(request.body?.text || '').trim()
  if (!text || text.length > 500) return response.status(400).json({ error: 'Provide a rule description under 500 characters.' })
  if (!process.env.OPENAI_API_KEY) return response.status(503).json({ error: 'LLM parser is not configured.' })

  try {
    const completion = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        store: false,
        instructions: 'Extract exactly one marketplace discount rule. Never infer a missing discount amount, audience, or cart threshold. Cart rules must be percentage discounts; for them, appliesTo must be empty and minCartValue must be a positive number. For brand/platform rules, minCartValue must be null. A phrase saying stackable means true; otherwise false. Return the requested JSON only.',
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
    if (!completion.ok) throw new Error(`Model request failed (${completion.status})`)
    const payload = await completion.json()
    const rule = JSON.parse(payload.output_text)
    return response.status(200).json({ rule })
  } catch (error) {
    return response.status(422).json({ error: error.message || 'The rule could not be parsed.' })
  }
}
