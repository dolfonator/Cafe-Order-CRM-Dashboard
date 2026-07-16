import type { MoneyCentavos } from './contracts'

const pesoFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

export function formatPesos(centavos: MoneyCentavos): string {
  if (!Number.isSafeInteger(centavos)) throw new TypeError('Money must be an integer number of centavos')
  return pesoFormatter.format(centavos / 100)
}
