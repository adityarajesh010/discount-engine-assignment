// Accept plain, Indian-grouped, and international-grouped INR amounts.
export const amountPattern = String.raw`(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?`
export const currencyPattern = String.raw`(?:₹|Rs\.?|INR)\s*`
const amount = new RegExp(`^(?:${currencyPattern})?(${amountPattern})$`, 'i')

export function readAmount(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return NaN
  const match = amount.exec(String(value).trim())
  if (!match) return NaN
  const parsed = Number(match[1].replaceAll(',', ''))
  return parsed <= Number.MAX_SAFE_INTEGER ? parsed : NaN
}
