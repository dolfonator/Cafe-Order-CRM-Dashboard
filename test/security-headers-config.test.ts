import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd())

const requiredHeaderNames = [
  'Content-Security-Policy',
  'X-Frame-Options',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
] as const

const requiredCspTokens = ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'"] as const

describe('deploy security headers (Netlify + Vercel alignment)', () => {
  it('configures the required browser-hardening headers in netlify.toml', () => {
    const toml = readFileSync(resolve(root, 'netlify.toml'), 'utf8')
    for (const name of requiredHeaderNames) {
      expect(toml, name).toContain(name)
    }
    for (const token of requiredCspTokens) {
      expect(toml).toContain(token)
    }
    expect(toml).toMatch(/X-Frame-Options\s*=\s*"DENY"/)
    expect(toml).toMatch(/X-Content-Type-Options\s*=\s*"nosniff"/)
    expect(toml).toMatch(/Referrer-Policy\s*=\s*"no-referrer"/)
    expect(toml).toMatch(/Permissions-Policy\s*=\s*"camera=\(\), microphone=\(\), geolocation=\(\)"/)
    // Do not introduce a restrictive script-src that would break Vite chunks.
    expect(toml).not.toMatch(/script-src/)
  })

  it('configures the same hardening headers in vercel.json', () => {
    const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as {
      headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
    }
    expect(Array.isArray(vercel.headers)).toBe(true)
    const all = (vercel.headers ?? []).flatMap((entry) => entry.headers)
    const byKey = Object.fromEntries(all.map((header) => [header.key, header.value]))
    for (const name of requiredHeaderNames) {
      expect(byKey[name], name).toBeTypeOf('string')
    }
    for (const token of requiredCspTokens) {
      expect(byKey['Content-Security-Policy']).toContain(token)
    }
    expect(byKey['X-Frame-Options']).toBe('DENY')
    expect(byKey['X-Content-Type-Options']).toBe('nosniff')
    expect(byKey['Referrer-Policy']).toBe('no-referrer')
    expect(byKey['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()')
    expect(byKey['Content-Security-Policy']).not.toMatch(/script-src/)
  })
})
