const ruleProperties = {
  scope: { type: 'string', enum: ['brand', 'platform', 'cart'] },
  appliesTo: { type: 'string' },
  type: { type: 'string', enum: ['percentage', 'flat'] },
  value: { type: 'number' },
  stackable: { type: 'boolean' },
  minCartValue: { type: ['number', 'null'] },
}

export const ruleResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['rule', 'clarification'],
  properties: {
    rule: {
      anyOf: [{
        type: 'object',
        additionalProperties: false,
        required: Object.keys(ruleProperties),
        properties: ruleProperties,
      }, { type: 'null' }],
    },
    clarification: { type: ['string', 'null'] },
  },
}

export const ruleInstructions = [
  'Extract one explicitly stated marketplace discount rule from the user text.',
  'If the amount, target, or threshold is ambiguous or missing, or there are multiple offers or unsupported conditions, set rule to null and ask for clarification. Do not invent values.',
  'For a valid rule, set clarification to null. Brand and platform rules must name the exact target and set minCartValue to null.',
  'A cart rule must use a percentage, an empty appliesTo, and a positive minimum. Extract the stated threshold. The engine treats cart thresholds as inclusive.',
  'Set stackable to true only when the text explicitly allows combining offers.',
].join(' ')

export function clarificationFrom(output) {
  const message = typeof output?.clarification === 'string' ? output.clarification.trim() : ''
  return message || 'Provide a discount amount and a clear target or cart minimum.'
}
