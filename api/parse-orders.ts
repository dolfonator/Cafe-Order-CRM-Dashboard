import { authorizeExtractionRequest } from '../server/parse-orders-auth'
import {
  extractOrders,
  isContentLengthOverLimit,
  oversizedBodyResult,
} from '../server/parse-orders-core'

/** Same-origin only — no Access-Control-Allow-Origin wildcard. */
const headers = { 'content-type': 'application/json; charset=utf-8' }

/**
 * Vercel adapter. Auth + extraction behavior live in server/,
 * shared with the Netlify function so both hosts stay identical.
 *
 * Uses the Web-standard Request/Response signature so no @vercel/node dependency
 * is needed. vercel.json rewrites /.netlify/functions/parse-orders to this route,
 * which lets the frontend keep calling one path on either host.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST with a raw_text field.' }), { status: 405, headers })
  }

  const auth = await authorizeExtractionRequest(request.headers)
  if (!auth.ok) {
    return new Response(JSON.stringify(auth.body), { status: auth.status, headers })
  }

  if (isContentLengthOverLimit(request.headers.get('content-length'))) {
    const oversized = oversizedBodyResult()
    return new Response(JSON.stringify(oversized.body), { status: oversized.status, headers })
  }

  const rawBody = await request.text()
  const { status, body } = await extractOrders(rawBody)
  return new Response(JSON.stringify(body), { status, headers })
}
