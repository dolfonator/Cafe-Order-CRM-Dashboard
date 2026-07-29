import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Breadcrumb, ErrorEvent } from '@sentry/react'
import { sanitizeEvent } from '../sentry'

const sentryInit = vi.fn()

vi.mock('@sentry/react', () => ({
  init: (...args: unknown[]) => sentryInit(...args),
}))

describe('sanitizeEvent', () => {
  it('strips user, request secrets, extra, unsafe contexts, and breadcrumb data', () => {
    const event = {
      type: undefined,
      event_id: 'evt-1',
      environment: 'production',
      release: 'abc123',
      exception: {
        values: [
          {
            type: 'TypeError',
            value: 'Cannot read properties of undefined',
            stacktrace: {
              frames: [{ filename: 'app.js', function: 'render', lineno: 10 }],
            },
          },
        ],
      },
      user: {
        id: 'user-9',
        email: 'customer@example.com',
        username: 'Maria Santos',
      },
      request: {
        method: 'POST',
        url: 'https://app.example.com/api/orders?token=secret#frag',
        headers: {
          Authorization: 'Bearer super-secret',
          Cookie: 'session=abc',
        },
        cookies: { session: 'abc', pin: '4321' },
        query_string: 'token=secret&customer=Maria',
        data: {
          customerName: 'Maria Santos',
          phone: '+63 917 000 0000',
          address: '123 Sample St, Makati',
          note: 'Leave at gate — ring twice',
          rawMessage: 'Hi! Order 2 matcha please, my pin is 1234',
        },
      },
      extra: {
        order: { id: 'ord-1', customerName: 'Maria Santos', total: 500 },
        pin: '1234',
        importedPaste: 'raw Viber / ChatGPT paste with customer details',
      },
      contexts: {
        browser: { name: 'Chrome', version: '120' },
        os: { name: 'iOS' },
        order: {
          customerName: 'Maria Santos',
          phone: '+63 917 000 0000',
          address: '123 Sample St, Makati',
          notes: 'Leave at gate',
        },
        appData: {
          lastOrder: { id: 'ord-1' },
        },
      },
      breadcrumbs: [
        {
          category: 'ui.click',
          level: 'info',
          type: 'user',
          timestamp: 1_700_000_000,
          message: 'clicked save',
          data: {
            customerName: 'Maria Santos',
            phone: '+63 917 000 0000',
            address: '123 Sample St, Makati',
            orderNote: 'Leave at gate — ring twice',
            rawMessage: 'Hi from Viber: full pasted order thread…',
          },
        } satisfies Breadcrumb,
      ],
    } as ErrorEvent

    const result = sanitizeEvent(event)

    expect(result).not.toBeNull()
    const out = result!

    // Monitoring tags retained
    expect(out.exception).toEqual(event.exception)
    expect(out.environment).toBe('production')
    expect(out.release).toBe('abc123')

    // user gone
    expect(out.user).toBeUndefined()

    // extra gone
    expect(out.extra).toBeUndefined()

    // request: method + path only — no headers/cookies/query/body
    expect(out.request).toEqual({
      method: 'POST',
      url: 'https://app.example.com/api/orders',
    })
    expect(out.request).not.toHaveProperty('headers')
    expect(out.request).not.toHaveProperty('cookies')
    expect(out.request).not.toHaveProperty('query_string')
    expect(out.request).not.toHaveProperty('data')

    // only safe technical contexts remain
    expect(out.contexts).toEqual({
      browser: { name: 'Chrome', version: '120' },
      os: { name: 'iOS' },
    })
    expect(out.contexts).not.toHaveProperty('order')
    expect(out.contexts).not.toHaveProperty('appData')

    // breadcrumb: category/level/type/timestamp only
    expect(out.breadcrumbs).toHaveLength(1)
    const crumb = out.breadcrumbs![0]!
    expect(crumb).toEqual({
      category: 'ui.click',
      level: 'info',
      type: 'user',
      timestamp: 1_700_000_000,
    })
    expect(crumb).not.toHaveProperty('data')
    expect(crumb).not.toHaveProperty('message')

    // Explicit PII strings must not appear anywhere in the sanitized payload
    const serialized = JSON.stringify(out)
    expect(serialized).not.toContain('Maria Santos')
    expect(serialized).not.toContain('+63 917 000 0000')
    expect(serialized).not.toContain('123 Sample St')
    expect(serialized).not.toContain('Leave at gate')
    expect(serialized).not.toContain('Viber')
    expect(serialized).not.toContain('ChatGPT')
    expect(serialized).not.toContain('1234')
    expect(serialized).not.toContain('Bearer super-secret')
    expect(serialized).not.toContain('token=secret')
  })
})

describe('initMonitoring', () => {
  beforeEach(() => {
    sentryInit.mockClear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does nothing when VITE_SENTRY_DSN is unset', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', undefined)
    const { initMonitoring } = await import('../sentry')
    initMonitoring()
    expect(sentryInit).not.toHaveBeenCalled()
  })

  it('does nothing when VITE_SENTRY_DSN is empty', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    const { initMonitoring } = await import('../sentry')
    initMonitoring()
    expect(sentryInit).not.toHaveBeenCalled()
  })

  it('does nothing when VITE_SENTRY_DSN is whitespace only', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '   ')
    const { initMonitoring } = await import('../sentry')
    initMonitoring()
    expect(sentryInit).not.toHaveBeenCalled()
  })

  it('initialises Sentry once with error-only, privacy-safe options when DSN is set', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public-key@example.com/1')
    vi.stubEnv('VITE_SENTRY_RELEASE', 'build-deadbeef')
    const { initMonitoring } = await import('../sentry')
    initMonitoring()

    expect(sentryInit).toHaveBeenCalledTimes(1)
    const options = sentryInit.mock.calls[0]![0] as Record<string, unknown>

    expect(options.sendDefaultPii).toBe(false)
    expect(options.dsn).toBe('https://public-key@example.com/1')
    expect(options.environment).toBeDefined()
    expect(options.release).toBe('build-deadbeef')
    expect(typeof options.beforeSend).toBe('function')

    // No tracing / Session Replay configuration
    expect(options).not.toHaveProperty('tracesSampleRate')
    expect(options).not.toHaveProperty('tracePropagationTargets')
    expect(options).not.toHaveProperty('replaysSessionSampleRate')
    expect(options).not.toHaveProperty('replaysOnErrorSampleRate')
    expect(options).not.toHaveProperty('profilesSampleRate')
    expect(options.integrations).toBeUndefined()
  })
})
