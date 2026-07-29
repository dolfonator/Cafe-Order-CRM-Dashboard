# WarFleet Session Handoff — Roadmap Execution Run

**Run date:** 2026-07-28
**Session:** `4763f803-23e5-4b11-8e0e-d6af11e36531`
**Scope of this document:** only the WarFleet run that executed the accepted roadmap revision
(`docs/IMPROVEMENT_ROADMAP.md`). Prior-session work (settings uuid fix, cup-names feature) is
covered in `master.md` and is not repeated here.

**Status:** All roster work complete and independently re-verified. Verdict from the Fleet
Admiral's final review: **PARTIAL** — two open items are open by design, not failure (see below).
**Nothing in this run has been committed or pushed.** The working tree still holds every change
uncommitted, exactly as WarFleet produced it.

---

## 1. What changed

### Phase 0 — Adapter parity + backups (the run's foundation)
- **`src/data/__tests__/fake-postgrest.ts`** (new) — a shared fake PostgREST client enforcing
  uuid columns, NOT NULL, enum values, CHECK constraints, FK presence, PK uniqueness, and UNIQUE
  keys the way Postgres actually does. Extracted from the pre-existing settings-only harness.
- **`src/data/__tests__/adapter-parity.test.ts`** (new) — 35+ tests covering `customers`,
  `products`, `orders`, `order_items`, `settings`, `modifier_groups`. Every guard is
  mutation-proven: the guard was disabled, the named test was confirmed to fail, then restored.
- **`docs/BACKUP_RUNBOOK.md`** (new) — manual CSV/`pg_dump` export procedure, restore order,
  verification steps, pre-migration checklist. Addresses the fact that production `products` rows
  had gone missing once before with no recovery path.

### CI, lint, and release process
- **`.github/workflows/quality.yml`** (new) — lint → test → build on PR and push to `main`. Zero
  secrets. E2E steps are present but commented out until the Playwright wave landed (then
  re-enabled by that wave).
- **`docs/RELEASE_RUNBOOK.md`** (new) — fixed release sequence, rollback rules, migration
  discipline.
- **`supabase/checks/01_baseline.sql`, `02_schema.sql`** (new) — read-only invariant queries for
  manual pre/post migration verification.
- **`package.json`** — added `lint`, `test:e2e`, `check` scripts.
- Untracked `dev-dist/sw.js`, `dev-dist/workbox-*.js` from Git (were tracked by mistake).
- **Lint: 16 warnings → 0.** 8 `no-useless-escape` fixes in `src/features/import/parser.ts`; 7
  fast-refresh export moves (see below); 1 `exhaustive-deps` resolved with a documented,
  test-pinned suppression (see Discovery #3).
  - New modules from the fast-refresh moves: `src/features/orders/order-display.ts`
    (`formatPhp`, `cupCount`), `src/features/today/delivery-dates.ts`
    (`relevantDeliveryDate` + helpers), `src/features/order-editor/order-draft-helpers.ts`
    (`blankItem`, `blankBag`, `updateItem`, `setCupName`).

### Demo-mode E2E
- **`playwright.config.ts`, `e2e/smoke.spec.ts`** (new) — 5-scenario Chromium suite at 390×844,
  `en-PH`/`Asia/Manila`. `webServer.env` explicitly forces empty `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` so a developer's real `.env` can never redirect the suite at
  production. Covers: seeded Today board, New→Paid→Delivered lifecycle, cancellation +
  terminal-state + run-list exclusion, primary nav to all 5 other pages, PWA manifest/service
  worker. Playwright + Chromium installed locally (`@playwright/test` in devDependencies,
  browser binary at `~/Library/Caches/ms-playwright/`).

### Order lifecycle timestamps
- **`src/data/types.ts`** — `StoredOrder.paidAt` / `.deliveredAt: string | null`, required fields.
- **Both adapters** (`supabase-adapter.ts`, `local-adapter.ts`) populate them **server/trigger-side
  only** — never from a client-supplied value. This was a deliberate amendment to the original
  roadmap doc, which had specified client timestamps; combined with a `paid_at <= delivered_at`
  CHECK, that would have let a skewed phone clock hard-fail legitimate order updates.
- **`supabase/migrations/20260728010000_add_order_lifecycle_timestamps.sql`** (new, **not yet
  applied to production**) + matching update to `supabase/schema.sql`. Trigger
  `orders_set_lifecycle_timestamps` calls `set_order_lifecycle_timestamps()`; a CHECK constraint
  enforces status/timestamp consistency (new→both null, paid→paid_at only, delivered→both with
  paid_at≤delivered_at, cancelled→delivered_at forbidden). Backfill maps historical rows from
  `updated_at` as an approximation, documented as such.
- **`src/features/orders/order-timestamps.ts`** (new) — `formatLifecycleTimestamp`,
  `lifecycleTimestampLines`, `en-PH`/`Asia/Manila` formatting.
- Display added to `OrderCard.tsx` (used by both Today board and Orders history) and
  `CustomersFeature.tsx`'s per-customer order history. No new controls or audit screen.
- Every fixture site updated: `src/demo/seed.ts`, `adapter.test.ts`, `hostile-import.test.ts`,
  `test/fixtures/insights/createInsightsFixture.ts`, `persist.ts` (creates with both null).

### Sentry error monitoring
- **`src/monitoring/sentry.ts`** (new) — `initMonitoring()` is a no-op unless
  `VITE_SENTRY_DSN` is a non-empty string. When active: `sendDefaultPii: false`, a tested
  `beforeSend` sanitizer strips `user`, `extra`, request headers/cookies/query-string/body, URL
  query+fragment, non-whitelisted `contexts`, and breadcrumb data/message — retaining only
  exception+stack, environment, release.
- **`src/components/ErrorBoundary.tsx`** (new) — branded generic fallback with reload action;
  reports via `captureException` only when a Sentry client is actually configured.
- Wired in `src/main.tsx` (init before render) and `src/App.tsx` (boundary around the app).
- **`vite.config.ts`** — `@sentry/vite-plugin` registers only when `SENTRY_AUTH_TOKEN` is present
  in the build environment; hidden source maps, deleted after upload. Verified: zero `.map` files
  and zero secret-shaped strings in a local build with no token set.
- **Sentry project created and confirmed live**, org `tristan-dolfo`, project
  `javascript-react-o3`. DSN: `https://e5fae92e96a0fc3f3932258e64a6864b@o4511812782850048.ingest.us.sentry.io/4511813345804288`
  (public value, safe to embed in the client bundle). A default alert rule
  ("new/existing issue marked high priority → notify") was already auto-created by Sentry scoped
  to this exact project — confirmed adequate, no duplicate created.

### Bundle splitting
- **`src/App.tsx`** — all 6 route pages converted to `React.lazy`; `AuthBoundary`, `AppShell`,
  demo banner, install prompt stay eager.
- **`vite.config.ts`** — deterministic chunk groups (`framework`, `supabase`, per-page lazy
  chunks).
- **`scripts/check-bundle.mjs`** (new) — measures gzipped initial-route transfer, fails if it
  exceeds budget. **Budget is 220 KiB gzipped** (a deliberate amendment from the original
  roadmap's 300 KiB *uncompressed*-per-chunk, which measures the wrong thing for what actually
  affects a phone on mobile data). Measured: **151.59 KiB gzipped** for `/today`.
- All 19 JS chunks confirmed present in the PWA precache (`dist/sw.js`).

---

## 2. Discoveries (bugs found during this run)

1. **`SupabaseAdapter.updateOrder` was sending `created_at` on every UPDATE.** No database
   trigger protected it (unlike `updated_at`, which has `orders_set_updated_at`). **Fixed**: the
   shared `replace()` helper now strips both `created_at` and `updated_at` from every UPDATE
   payload across all six tables. Mutation-proven.

2. **A demo-E2E test was a false red, not a product bug.** `e2e/smoke.spec.ts` asked for
   `getByRole('status', { name: /Demo... /i })`, but `role="status"` is name-from-author per
   WAI-ARIA — it never gets a name from its text content. The banner itself was correct and
   visible throughout. **Fixed**: the test locator now uses `.filter({ hasText: ... })` instead
   of a name match. The product's `DemoBanner.tsx` was intentionally left unchanged — adding an
   `aria-label` purely to satisfy a mistaken locator would have altered production markup for no
   real accessibility gain.

3. **A "safe" lint fix would have silently broken a live feature.** Oxlint flagged
   `catalog` as an unused dependency in `useMemo(() => validateDraft(draft), [draft, catalog])`
   (`OrderEditorCard.tsx`). Removing it looked correct — `catalog` is never read inside the
   factory. In fact, `getRuntimeCatalog()` returns a **new object identity on every call** when
   runtime settings are active, and that changing identity is what forces the memo to re-run when
   a Settings price change should reflect in an already-open order editor. Deleting the dependency
   is what oxlint wants, but breaks that live sync. **Resolution**: kept the dependency, added a
   documented `oxlint-disable-next-line` with the reason, and left a permanent regression test
   (`catalog-memo.test.tsx`) that would fail if anyone tries the "obvious" fix again. This was
   caught before merge specifically because the task was told to write the regression test *before*
   making the change, watch it pass, make the change, watch it fail, then report rather than force
   it through.

4. **A latent contract defect, found but deliberately not fixed:**
   **`SupabaseAdapter.subscribe()` emits realtime order events with `items: []`** —
   `fromOrder(row)` is called without its items argument in the realtime handler
   (`src/data/supabase-adapter.ts` around the `subscribe` method). This is currently harmless:
   `useOrdersData` discards the realtime payload entirely and just re-lists on any change event,
   so nothing today reads the empty array. But it is exactly the kind of
   LocalAdapter-vs-SupabaseAdapter divergence this whole Phase 0 effort exists to catch — any
   future code that reads `change.entity.items` off a realtime order event will get `[]` from
   Supabase and the correct value from LocalAdapter. **Recommended as a small standalone
   follow-up**, not folded into this run (it would be a behavior change, and this run was already
   at its 3-remediation discipline).

5. **`TodayBoard`'s order editor has no live-settings subscription at all.** Only
   `ImportWorkspace` subscribes to settings changes and reloads the catalog. This was discovered
   while manually verifying #3 above in a live two-tab browser test — pre-existing, unrelated to
   this run's changes, not fixed (out of scope), just noting it exists.

---

## 3. Explicitly open — needs the user, not another agent run

1. **The lifecycle-timestamp migration has NOT been applied to production.**
   `supabase/migrations/20260728010000_add_order_lifecycle_timestamps.sql` exists in the repo,
   tested, and matches the schema exactly — but per `docs/RELEASE_RUNBOOK.md`, applying it is a
   manual step in a maintenance window: run the baseline check in `supabase/checks/`, apply the
   migration transaction, run the postflight check, compare invariants, record the result. This
   was intentionally never done inside the WarFleet run — CI and agents never apply migrations.

2. **The CI workflow has never actually run.** `.github/workflows/quality.yml` is locally
   validated — `npm run check` (lint → test → build → E2E) passes with the exact commands the
   workflow runs — but nothing has been pushed to GitHub, so no real Actions run has ever
   exercised it. This can only be confirmed by an actual push/PR.

3. **Sentry environment variables need to be set in Netlify by hand:**
   - `VITE_SENTRY_DSN` = `https://e5fae92e96a0fc3f3932258e64a6864b@o4511812782850048.ingest.us.sentry.io/4511813345804288`
   - `SENTRY_ORG` = `tristan-dolfo`
   - `SENTRY_PROJECT` = `javascript-react-o3`
   - `SENTRY_AUTH_TOKEN` = **not captured by this session.** Generate one at Sentry → Settings →
     Auth Tokens (scopes: `project:releases`, `project:write`) and paste it into Netlify directly —
     no agent should ever hold this value.
   Without these set, the app behaves exactly as it did before this run (Sentry code is fully
   gated on `VITE_SENTRY_DSN` presence) — this is not blocking, just inactive until configured.

4. **Nothing in this run is committed.** The full working tree (53 changed/new paths across
   `src/`, `supabase/`, `.github/`, `docs/`, `e2e/`, `test/`, `package.json`) is sitting uncommitted.
   Decide how to split it into commits (or one) before pushing.

5. **The `SupabaseAdapter.subscribe()` `items: []` defect** (Discovery #4 above) — a small,
   well-scoped follow-up task whenever convenient.

---

## 4. Final verification state (independently re-run by the dispatcher, not just unit self-reports)

| Check | Result |
|---|---|
| `npx vitest run` | 276 passed, 1 skipped (33 files) |
| `npx oxlint src server netlify api test e2e` | 0 warnings, 0 errors |
| `npx tsc -b` | clean |
| `npm run build` | success, 26-entry PWA precache |
| `npm run check:bundle` | 151.59 KiB gzipped initial `/today` load vs. 220 KiB budget |
| `npm run test:e2e` | 5/5 passed |
| Test count trend | 159 → 194 → 225 → 226 → 227 → 228 → 254 → 268 → 276 across the run's waves |
| Lint trend | 16 → 8 → 7 → 0 warnings |
| Secret scan of `dist/` | clean (no token-shaped strings, no `.map` files without a token) |

## 5. Process note (for whoever picks this up)

This run used WarFleet: Fleet Admiral (Opus 5) planned the roster and wrote every task spec;
General (GPT Sol) adjudicated all three casualties above and the debrief; 14 Infantry units
(Grok 4.5) executed, plus 3 remediation tasks (t3b, t5b, t8-round-2) the General authored in
response to findings. Every wave's gate (tests/lint/typecheck/build, scoped git diff) was run and
confirmed by the dispatcher itself, not taken on a unit's word. The Fleet Admiral's final review
independently re-verified the whole suite again and did a behavior-preserving polish pass (7
files: a real duplicate `formatPhp` removed, module docs added to the new helper files, the
suppression comment expanded, one dead parameter removed from `ErrorBoundary.tsx`).
