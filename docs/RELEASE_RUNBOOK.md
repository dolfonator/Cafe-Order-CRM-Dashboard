# Release runbook

Followable release procedure for the order dashboard. Invents no commands. Apply migrations only by hand in the Supabase SQL Editor — never from CI, never from a script in this repo.

**No secret ever enters CI.** Netlify holds environment variables for the deployed app. GitHub Actions holds none; the `quality` workflow needs zero repository secrets.

---

## Preconditions (every release)

- A backup is taken **before any migration**. Follow [docs/BACKUP_RUNBOOK.md](BACKUP_RUNBOOK.md) (manual CSV or `pg_dump` as documented there). Do not skip this step.
- Working tree is clean and you are on the intended branch.

---

## Fixed sequence

### 1. Clean branch, clean `git status`

Confirm you are on the correct branch and that `git status` shows a clean working tree (or only the intentional changes for this release).

```sh
git status
```

### 2. Local quality gate

```sh
npm run check
```

This runs, fail-fast in order:

1. `npm run lint` — oxlint; gate is **zero errors** (warnings are allowed today)
2. `npm test` — unit/integration tests (vitest)
3. `npm run build` — TypeScript project build + Vite production build

<!-- E2E-IN-CHECK: When the E2E wave lands (Playwright config + dependency installed),
     append `npm run test:e2e` to the `check` script so it becomes:
     `npm run lint && npm test && npm run build && npm run test:e2e`.
     Until then, run E2E separately only after that wave ships. -->

<!-- DENY-WARNINGS: Do NOT pass `--deny-warnings` to oxlint until the 7 deferred
     `react(only-export-components)` warnings are cleared. Until then the lint gate
     is zero *errors* only; those 7 are optional cleanup and would break the gate
     if denied early. -->

### 3. Open (or update) the PR — `quality` must be green

Push the branch and open a pull request. GitHub Actions workflow `.github/workflows/quality.yml` runs on pull requests and on pushes to `main`. Job name: **quality**.

Required steps (in order): checkout → Node 20 + npm cache → `npm ci` → `npm run lint` → `npm test` → `npm run build`.

Do not merge until the **quality** check is green.

### 4. Maintenance window

Schedule and announce a short maintenance window if the release includes a production database migration or any behavior that could disrupt operators mid-shift.

### 5. Record production baseline (pre-migration)

In the **Supabase SQL Editor**, run the contents of:

```text
supabase/checks/01_baseline.sql
```

Paste the single-row result (order count, order-item count, money sums, counts-by-status JSON) into the release record / changelog entry for this release.

### 6. Apply pending migration by hand

Apply the pending file under `supabase/migrations/` **by hand in the Supabase SQL Editor**, inside **its own transaction** (the migration file should begin with `begin;` and end with `commit;`, or wrap the body yourself).

- Never apply migrations from CI.
- Never apply migrations from a script in this repository.
- If anything fails before `commit`, roll back the transaction (see Rollback below).

### 7. Post-migration checks

In the Supabase SQL Editor, run again:

```text
supabase/checks/01_baseline.sql
supabase/checks/02_schema.sql
```

Compare invariants against the pre-migration record from step 5. Counts and money sums must match **exactly**, except where the migration intentionally changes them (document any intentional delta in the release record). Schema checks must show expected enum labels, required columns/constraints, and zero lifecycle-consistency violations (`orders_status_payment_inconsistent_count = 0`).

### 8. Merge / push `main`

Merge the PR (or push to `main` per your branching practice). Netlify auto-deploys from `main`.

### 9. Verify the deploy

1. Verify the deployed Netlify asset hash **byte-for-byte** against the local `npm run build` output (same method used for the last three releases).
2. Verify the PIN shell loads and accepts operator auth as expected.
3. Verify `/manifest.webmanifest` is served.
4. Verify `/sw.js` is served.
5. Open a clean browser console (hard refresh if needed) and confirm no unexpected errors.

### 10. Record the release

Record commit SHA, check results, baseline invariants (pre and post), and any intentional schema deltas in the project changelog.

---

## Rollback

- **Before a migration commits:** rollback is the SQL transaction rollback (`rollback;` in the Supabase SQL Editor). Do not leave a half-applied migration.
- **After a migration commits:** recovery is a **new forward migration** only. Never perform an ad-hoc manual rewrite of production data to “undo” a committed migration.

---

## Ordering rule

Frontend code that **requires** a schema change must not reach `main` before the compatible production migration is applied. Ship and apply the migration first (or in the same maintenance window before the frontend that depends on it is live), then promote the frontend.

---

## What CI does and does not do

| Does | Does not |
|------|----------|
| `npm run lint` | Apply database migrations |
| `npm test` | Hold or use repository secrets |
| `npm run build` | Deploy to production |
| | Run Playwright E2E until a later wave enables those steps |

Environment variables for the live app live in **Netlify**, not in GitHub Actions.
