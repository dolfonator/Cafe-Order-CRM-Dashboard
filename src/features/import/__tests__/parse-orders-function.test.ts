import { afterEach, describe, expect, it, vi } from 'vitest'
import { handler } from '../../../../netlify/functions/parse-orders'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('parse-orders Netlify function', () => {
  it('returns a clear configuration error and makes no upstream call without the Anthropic key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ raw_text: 'Mika: one matcha latte' }) } as never, {} as never)
    expect(response).toMatchObject({ statusCode: 503 })
    expect(JSON.parse((response as { body: string }).body).error).toMatch(/not configured/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the structural schema to Haiku and returns the model structure unchanged for local normalization', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'text', text: '{"orders":[{"customer_name":"Mika","items":[{"product_slug":"matcha-latte","quantity":1,"level":1,"powder":"yumeno","sweetness":null}],"thermal_bags":[],"delivery_date":null,"address":"Makati","notes":null,"source_confidence":0.9,"unresolved_fields":[]}]}' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ raw_text: 'Mika: one matcha latte, Makati' }) } as never, {} as never)
    expect(response).toMatchObject({ statusCode: 200 })
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(request.model).toBe('claude-haiku-4-5')
    expect(request.messages[0].content).toContain('unresolved_fields')
    expect(request.messages[0].content).not.toMatch(/price|total/i)
  })
})
