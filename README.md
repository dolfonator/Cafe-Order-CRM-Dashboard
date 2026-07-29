# Order Dashboard

A mobile-first React order dashboard for a Metro Manila matcha cafe.

## Requirements

- Node.js 20+
- npm

## Commands

```sh
npm run dev
npm run lint
npm test
npm run build
npm run check
npm run test:e2e
npm run preview
```

`npm run test:e2e` needs the E2E wave (Playwright config and dependency) before it can run.

Database backup procedure (manual CSV / pg_dump): see [docs/BACKUP_RUNBOOK.md](docs/BACKUP_RUNBOOK.md).

The app starts in demo-safe mode: no environment variables are required and no secrets are included in client code. Monetary values use integer centavos and should be displayed with `formatPesos`, which formats PHP using `en-PH`. Future price values must be produced by a deterministic pricing engine, never an LLM.
