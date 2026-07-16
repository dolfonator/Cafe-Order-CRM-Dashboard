import type { Handler } from '@netlify/functions'

const headers = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }

function response(statusCode: number, body: object) { return { statusCode, headers, body: JSON.stringify(body) } }

function anthropicApiKey(): string | undefined {
  return (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.ANTHROPIC_API_KEY
}

const extractionInstruction = `Extract order structure from the supplied Viber conversation. Return JSON only in this shape:
{"orders":[{"customer_name":null,"items":[{"product_slug":null,"quantity":null,"level":null,"powder":null,"sweetness":null}],"thermal_bags":[{"covered_cup_count":null}],"delivery_date":null,"address":null,"notes":null,"source_confidence":null,"unresolved_fields":[]}]}
Canonical product slugs: matcha-latte, strawberry-matcha, salted-maple-matcha, hojicha-latte, strawberry-hojicha, salted-maple-hojicha.
All drinks use oat milk. Matcha levels are L1, L2, L3. Hojicha levels are L1, L2, L3. Powders are yumeno and mk_isuzu. Sweetness none, light, regular, or extra is permitted only for plain matcha-latte and plain hojicha-latte. Thermal bags cover 1, 2, 3, or 4 cups.
Keep uncertain values null and explain them in unresolved_fields. Ignore monetary claims. Do not add any keys beyond the requested structure.`

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return response(204, {})
  if (event.httpMethod !== 'POST') return response(405, { error: 'Use POST with a raw_text field.' })
  const apiKey = anthropicApiKey()
  if (!apiKey) return response(503, { error: 'Anthropic extraction is not configured: set ANTHROPIC_API_KEY.' })
  let rawText: unknown
  try { rawText = JSON.parse(event.body ?? '{}').raw_text } catch { return response(400, { error: 'Request body must be JSON.' }) }
  if (typeof rawText !== 'string' || !rawText.trim()) return response(400, { error: 'raw_text must be a nonblank string.' })
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1400, messages: [{ role: 'user', content: `${extractionInstruction}\n\nVIBER CONVERSATION:\n${rawText}` }] }),
    })
    if (!upstream.ok) return response(502, { error: 'Anthropic extraction request failed.' })
    const payload: unknown = await upstream.json()
    const content = typeof payload === 'object' && payload !== null && 'content' in payload ? (payload as { content?: unknown }).content : null
    const text = Array.isArray(content) ? content.find((entry): entry is { type: string; text: string } => typeof entry === 'object' && entry !== null && (entry as { type?: unknown }).type === 'text' && typeof (entry as { text?: unknown }).text === 'string')?.text : undefined
    if (!text) return response(502, { error: 'Anthropic returned no extractable text.' })
    return response(200, JSON.parse(text) as object)
  } catch {
    return response(502, { error: 'Anthropic extraction returned invalid JSON.' })
  }
}
