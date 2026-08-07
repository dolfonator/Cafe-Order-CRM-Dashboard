/**
 * Host-neutral core for the Viber order-extraction endpoint.
 *
 * Wrapped by netlify/functions/parse-orders.ts and api/parse-orders.ts so both
 * hosts run byte-identical extraction logic. Keep all behavior here; the wrappers
 * only translate each host's request/response shape and call shared authorization.
 */

export type CoreResult = { status: number; body: object }

/** Reject raw HTTP bodies larger than this (bytes), before and after materializing. */
export const MAX_RAW_BODY_BYTES = 64 * 1024

/** Reject raw_text longer than this after JSON parsing. */
export const MAX_RAW_TEXT_CHARS = 50_000

/** Abort the Anthropic fetch after this many milliseconds. */
export const ANTHROPIC_TIMEOUT_MS = 20_000

export const extractionInstruction = `Extract order structure from the supplied Viber conversation. Return JSON only in this shape:
{"orders":[{"customer_name":null,"items":[{"product_slug":null,"quantity":null,"level":null,"powder":null,"sweetness":null,"cup_names":[]}],"thermal_bags":[{"covered_cup_count":null}],"delivery_date":null,"address":null,"notes":null,"source_confidence":null,"unresolved_fields":[]}]}
Canonical product slugs: matcha-latte, strawberry-matcha, salted-maple-matcha, hojicha-latte, strawberry-hojicha, salted-maple-hojicha.
All drinks use oat milk. Matcha levels are L1, L2, L3. Hojicha levels are L1, L2, L3. Powders are yumeno and mk_isuzu. Sweetness none, light, regular, or extra is permitted only for plain matcha-latte and plain hojicha-latte. Thermal bags cover 1, 2, 3, or 4 cups.
cup_names holds a name per cup when one customer orders for several people ("one for Ana, one for Ben"): at most one name per cup in quantity, in the order mentioned, [] when none are given. Never invent names.
Keep uncertain values null and explain them in unresolved_fields. Ignore monetary claims. Do not add any keys beyond the requested structure.`

/** Reads the key without assuming a Node global, so this works on serverless and edge runtimes alike. */
export function anthropicApiKey(): string | undefined {
  return (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.ANTHROPIC_API_KEY
}

/** UTF-8 byte length without Node Buffer dependency (works on edge). */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

/**
 * True when a Content-Length header is present and reports a body over the cap.
 * Missing/unparseable headers are ignored so the post-read check remains authoritative.
 */
export function isContentLengthOverLimit(contentLengthHeader: string | null | undefined): boolean {
  if (contentLengthHeader == null || contentLengthHeader === '') return false
  const parsed = Number(contentLengthHeader)
  return Number.isFinite(parsed) && parsed > MAX_RAW_BODY_BYTES
}

export function oversizedBodyResult(): CoreResult {
  return { status: 413, body: { error: 'Request body is too large.' } }
}

/**
 * Runs extraction for an already-read request body.
 * Never throws: every failure is returned as a { status, body } pair.
 */
export async function extractOrders(rawBody: string | null | undefined, apiKey = anthropicApiKey()): Promise<CoreResult> {
  if (!apiKey) return { status: 503, body: { error: 'Anthropic extraction is not configured: set ANTHROPIC_API_KEY.' } }

  if (rawBody != null && utf8ByteLength(rawBody) > MAX_RAW_BODY_BYTES) {
    return oversizedBodyResult()
  }

  let rawText: unknown
  try {
    rawText = JSON.parse(rawBody ?? '{}').raw_text
  } catch {
    return { status: 400, body: { error: 'Request body must be JSON.' } }
  }
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return { status: 400, body: { error: 'raw_text must be a nonblank string.' } }
  }
  if (rawText.length > MAX_RAW_TEXT_CHARS) {
    return { status: 413, body: { error: 'raw_text exceeds the maximum length.' } }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS)
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1400,
        messages: [{ role: 'user', content: `${extractionInstruction}\n\nVIBER CONVERSATION:\n${rawText}` }],
      }),
      signal: controller.signal,
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
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { status: 504, body: { error: 'Anthropic extraction timed out.' } }
    }
    return { status: 502, body: { error: 'Anthropic extraction returned invalid JSON.' } }
  } finally {
    clearTimeout(timer)
  }
}
