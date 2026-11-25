import { validateRule } from '../src/engine/ruleValidation.js'
import { clarificationFrom, ruleInstructions, ruleResponseSchema } from '../src/engine/ruleModelContract.js'

export default async function handler(request, response) {
  if (request.method === 'GET') {
    response.setHeader('Cache-Control', 'no-store')
    return response.status(200).json({ configured: Boolean(process.env.OPENAI_API_KEY) })
  }
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
        instructions: ruleInstructions,
        max_output_tokens: 600,
        input: text,
        text: {
          format: {
            type: 'json_schema',
            name: 'discount_rule',
            strict: true,
            schema: ruleResponseSchema,
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
      return response.status(422).json({ error: clarificationFrom(parsed) })
    }
    const validation = validateRule(parsed?.rule)
    if (!validation.ok) return response.status(422).json({ error: validation.errors.join('. ') })
    return response.status(200).json({ rule: validation.rule })
  } catch {
    return response.status(502).json({ error: 'The AI parser did not return a usable response. Try again.' })
  }
}
