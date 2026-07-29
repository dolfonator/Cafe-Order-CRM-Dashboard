import * as Sentry from '@sentry/react'
import type { Breadcrumb, ErrorEvent } from '@sentry/react'

/** Sentry contexts that are browser/runtime metadata only — never app or customer data. */
const SAFE_CONTEXT_KEYS = new Set([
  'app',
  'browser',
  'device',
  'os',
  'runtime',
  'culture',
  'gpu',
  'trace',
  'cloud_resource',
  'response',
  'error',
])

/**
 * Pure beforeSend sanitizer: deny-by-default for any field that might carry
 * customer PII, order payloads, PINs, or imported message text.
 * Exported for unit tests without initialising Sentry.
 */
export function sanitizeEvent(event: ErrorEvent): ErrorEvent | null {
  // Never attach an identified user.
  delete event.user

  // Drop all free-form extras (often hold app objects / order snapshots).
  delete event.extra

  // Request: keep method + path only; strip headers, cookies, query, body.
  if (event.request) {
    const method = event.request.method
    const url = stripQueryAndFragment(event.request.url)
    event.request = {
      ...(method ? { method } : {}),
      ...(url ? { url } : {}),
    }
  }

  // Contexts: keep only known-safe technical entries.
  if (event.contexts) {
    const next: NonNullable<ErrorEvent['contexts']> = {}
    for (const key of Object.keys(event.contexts)) {
      if (SAFE_CONTEXT_KEYS.has(key)) {
        next[key] = event.contexts[key]
      }
    }
    if (Object.keys(next).length === 0) {
      delete event.contexts
    } else {
      event.contexts = next
    }
  }

  // Breadcrumbs: category/level/type/timestamp only — no data, no message payload.
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(sanitizeBreadcrumb)
  }

  return event
}

function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const clean: Breadcrumb = {}
  if (breadcrumb.category !== undefined) clean.category = breadcrumb.category
  if (breadcrumb.level !== undefined) clean.level = breadcrumb.level
  if (breadcrumb.type !== undefined) clean.type = breadcrumb.type
  if (breadcrumb.timestamp !== undefined) clean.timestamp = breadcrumb.timestamp
  return clean
}

function stripQueryAndFragment(url: string | undefined): string | undefined {
  if (!url) return undefined
  const q = url.indexOf('?')
  const h = url.indexOf('#')
  let end = url.length
  if (q !== -1) end = Math.min(end, q)
  if (h !== -1) end = Math.min(end, h)
  return url.slice(0, end)
}

function readRelease(): string | undefined {
  const raw = import.meta.env.VITE_SENTRY_RELEASE
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim()
  return undefined
}

/**
 * Initialise client-side error monitoring.
 * No-op unless VITE_SENTRY_DSN is a non-empty string — demo mode, tests,
 * and local builds must send nothing and change no observable behaviour.
 */
export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (typeof dsn !== 'string' || dsn.trim() === '') {
    return
  }

  const release = readRelease()

  Sentry.init({
    dsn: dsn.trim(),
    sendDefaultPii: false,
    environment: import.meta.env.MODE,
    ...(release ? { release } : {}),
    beforeSend: sanitizeEvent,
    // Error capture only: no tracesSampleRate, no Session Replay, no profiling.
  })
}
