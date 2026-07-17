/**
 * Host-neutral core for the Viber order-extraction endpoint.
 *
 * Wrapped by netlify/functions/parse-orders.ts and api/parse-orders.ts so both
 * hosts run byte-identical extraction logic. Keep all behavior here; the wrappers
 * only translate each host's request/response shape.
 */

export type CoreResult = { status: number; body: object }

export const extractionInstruction = `Extract order structure from the supplied Viber conversation. Return JSON only in this shape:
{"orders":[{"customer_name":null,"items":[{"product_slug":null,"quantity":null,"level":null,"powder":null,"sweetness":null}],"thermal_bags":[{"covered_cup_count":null}],"delivery_date":null,"address":null,"notes":null,"source_confidence":null,"unresolved_fields":[]}]}
Canonical product slugs: matcha-latte, strawberry-matcha, salted-maple-matcha, hojicha-latte, strawberry-hojicha, salted-maple-hojicha.
All drinks use oat milk. Matcha levels are L1, L2, L3. Hojicha levels are L1, L2, L3. Powders are yumeno and mk_isuzu. Sweetness none, light, regular, or extra is permitted only for plain matcha-latte and plain hojicha-latte. Thermal bags cover 1, 2, 3, or 4 cups.
Keep uncertain values null and explain them in unresolved_fields. Ignore monetary claims. Do not add any keys beyond the requested structure.`

/** Reads the key without assuming a Node global, so this works on serverless and edge runtimes alike. */
export function anthropicApiKey(): string | undefined {
  return (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.ANTHROPIC_API_KEY
}

/**
 * Runs extraction for an already-read request body.
 * Never throws: every failure is returned as a { status, body } pair.
 */
export async function extractOrders(rawBody: string | null | undefined, apiKey = anthropicApiKey()): Promise<CoreResult> {
  if (!apiKey) return { status: 503, body: { error: 'Anthropic extraction is not configured: set ANTHROPIC_API_KEY.' } }

  let rawText: unknown
  try {
    rawText = JSON.parse(rawBody ?? '{}').raw_text
  } catch {
    return { status: 400, body: { error: 'Request body must be JSON.' } }
  }
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return { status: 400, body: { error: 'raw_text must be a nonblank string.' } }
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1400,
        messages: [{ role: 'user', content: `${extractionInstruction}\n\nVIBER CONVERSATION:\n${rawText}` }],
      }),
    })
    if (!upstream.ok) return { status: 502, body: { error: 'Anthropic extraction request failed.' } }

    const payload: unknown = await upstream.json()
    const content =
      typeof payload === 'object' && payload !== null && 'content' in payload ? (payload as { content?: unknown }).content : null
    const text = Array.isArray(content)
      ? content.find(
          (entry): entry is { type: string; text: string } =>
            typeof entry === 'object' &&
            entry !== null &&
            (entry as { type?: unknown }).type === 'text' &&
            typeof (entry as { text?: unknown }).text === 'string',
        )?.text
      : undefined
    if (!text) return { status: 502, body: { error: 'Anthropic returned no extractable text.' } }

    return { status: 200, body: JSON.parse(text) as object }
  } catch {
    return { status: 502, body: { error: 'Anthropic extraction returned invalid JSON.' } }
  }
}
