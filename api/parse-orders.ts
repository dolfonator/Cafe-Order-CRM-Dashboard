import { extractOrders } from '../server/parse-orders-core'

const headers = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }

/**
 * Vercel adapter. All extraction behavior lives in server/parse-orders-core.ts,
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

  const rawBody = await request.text()
  const { status, body } = await extractOrders(rawBody)
  return new Response(JSON.stringify(body), { status, headers })
}
