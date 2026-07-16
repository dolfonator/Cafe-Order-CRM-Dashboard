# Order Dashboard

A mobile-first React order dashboard for a Metro Manila matcha cafe.

## Requirements

- Node.js 20+
- npm

## Commands

```sh
npm run dev
npm test
npm run build
npm run preview
```

The app starts in demo-safe mode: no environment variables are required and no secrets are included in client code. Monetary values use integer centavos and should be displayed with `formatPesos`, which formats PHP using `en-PH`. Future price values must be produced by a deterministic pricing engine, never an LLM.
