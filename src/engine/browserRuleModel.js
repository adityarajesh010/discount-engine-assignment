import { clarificationFrom, ruleInstructions, ruleResponseSchema } from './ruleModelContract.js'
import { validateRule } from './ruleValidation.js'

const options = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
}

export async function browserModelStatus() {
  try {
    return await globalThis.LanguageModel?.availability(options) ?? 'unavailable'
  } catch {
    return 'unavailable'
  }
}

export async function enableBrowserModel(onProgress) {
  const session = await globalThis.LanguageModel.create({
    ...options,
    signal: AbortSignal.timeout(180_000),
    monitor: (monitor) => monitor.addEventListener('downloadprogress', (event) => onProgress(event.loaded)),
  })
  session.destroy()
}

export async function parseWithBrowserModel(text) {
  if (await browserModelStatus() !== 'available') return null

  let session
  const signal = AbortSignal.timeout(15_000)
  try {
    session = await globalThis.LanguageModel.create({
      ...options,
      signal,
      initialPrompts: [{ role: 'system', content: ruleInstructions }],
    })
    const output = JSON.parse(await session.prompt(text, { responseConstraint: ruleResponseSchema, signal }))
    if (output?.rule === null) return { ok: false, errors: [clarificationFrom(output)] }
    const validation = validateRule(output?.rule)
    return validation.ok ? { ok: true, candidate: validation.rule, source: 'browser' } : validation
  } catch {
    return null
  } finally {
    session?.destroy()
  }
}
