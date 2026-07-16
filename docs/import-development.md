# Import pipeline development

The import feature accepts either a single JSON object/array or JSON Lines locally. `parseLocalInput` decides this before the component can call `fetch`, so valid JSON imports are offline and never contact the extraction endpoint.

Free-form Viber text is sent only to `/.netlify/functions/parse-orders`. The function requires `ANTHROPIC_API_KEY`; without it, it returns HTTP 503 with a configuration message. It calls `claude-haiku-4-5` for structure only. Client-side normalization uses the explicit alias map, then calls `priceOrder` from `src/domain/pricing.ts` for every draft. Source monetary claims are never read.

## Offline test stub

Tests must not call Anthropic. Mock the endpoint with `vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ orders: [...] }), { status: 200 })))`. The existing parser tests cover the local path without a fetch call. The realistic threads used by manual/extraction tests are in `test/fixtures/import/builder/viber-threads.ts`.

## Confirmation behavior

Confirmation resolves a unique normalized customer name or creates a customer. A unique `same as last time` match may reuse the latest saved address. The StorageAdapter has no exposed transaction API; its aggregate `createOrder` operation persists the prepared order and its prepared items together. The UI disables the confirmation control while that operation is in flight.

## Manual browser check

Run `npm run dev -- --host 127.0.0.1 --port 5176`. At 390 by 844, paste JSON fixture content and verify no `parse-orders` request is issued; change a level and confirm the displayed amount changes; then confirm and inspect `adapter.listOrders()` from a test/script. The bottom navigation remains visible on the mobile viewport.
