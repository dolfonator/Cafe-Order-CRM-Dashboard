import type { Handler } from '@netlify/functions'
import { authorizeExtractionRequest } from '../../server/parse-orders-auth'
import {
  extractOrders,
  isContentLengthOverLimit,
  oversizedBodyResult,
} from '../../server/parse-orders-core'

/** Same-origin only — no Access-Control-Allow-Origin wildcard. */
const headers = { 'content-type': 'application/json; charset=utf-8' }

function response(statusCode: number, body: object) {
  return { statusCode, headers, body: JSON.stringify(body) }
}

/** Netlify adapter. Auth + extraction behavior live in server/. */
export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return response(204, {})
  if (event.httpMethod !== 'POST') return response(405, { error: 'Use POST with a raw_text field.' })

  const auth = await authorizeExtractionRequest(event.headers)
  if (!auth.ok) return response(auth.status, auth.body)

  const contentLength = event.headers['content-length'] ?? event.headers['Content-Length']
  if (isContentLengthOverLimit(contentLength)) {
    return response(oversizedBodyResult().status, oversizedBodyResult().body)
  }

  const { status, body } = await extractOrders(event.body)
  return response(status, body)
}
