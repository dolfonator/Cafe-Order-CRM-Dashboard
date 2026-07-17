import type { Handler } from '@netlify/functions'
import { extractOrders } from '../../server/parse-orders-core'

const headers = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }

function response(statusCode: number, body: object) {
  return { statusCode, headers, body: JSON.stringify(body) }
}

/** Netlify adapter. All extraction behavior lives in server/parse-orders-core.ts. */
export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return response(204, {})
  if (event.httpMethod !== 'POST') return response(405, { error: 'Use POST with a raw_text field.' })

  const { status, body } = await extractOrders(event.body)
  return response(status, body)
}
