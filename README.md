# Remittance review

Front-end take-home for the Frontend Developer role at Seven Seas Strategies. It's a screen
where a billing user reviews an insurer's payment batch before it is posted: each line is
matched to the charge it pays (or split across several), sent to suspense, or excluded, and
the header shows whether the batch is ready to post.

Built with Vue 3, TypeScript, Vite and Vitest. The API is mocked with MSW, so no backend is
needed.

## Run it

You need Node.js 22.18+ or 24.12+, and npm.

```sh
npm install
npm run dev
```

If npm warns that it skipped msw's install script, that's fine: the service worker it would
generate is already committed in `public/mockServiceWorker.js`.

Open http://localhost:5173. It redirects to batch B-104. The links at the top switch batches:

| Batch | What it is |
|---|---|
| B-104 | The reference batch from spec 2.6 |
| B-500 | 500 generated lines, to check the table stays responsive |
| B-099 | A batch that is already posted, so the screen is read-only |

## Tests and checks

```sh
npm test            # all Vitest tests, once
npm run test:unit   # Vitest in watch mode
npm run check       # oxlint + ESLint + type-check + tests: what CI would run
npm run build       # type-check and production build
```

## The mock API

The mock starts automatically with the app. MSW intercepts the requests in the browser, so
the app talks to it with real `fetch` calls, as it would to a real server. Its data lives in
memory, so **reloading the page resets it**.

It implements the contract in section 3 under the base URL `/api`, enforces R1, R4, R6 and
R8, checks writes in R9 order, and returns every error in the R10 shape
(`application/problem+json` with a stable `code`).

### Switches

Use the **Mock API controls** panel at the bottom right, or URL parameters:

| Switch | Panel | URL parameter |
|---|---|---|
| Fixed delay | Delay: Fixed, in ms | `?mockDelay=800` |
| Random delay, 100–1500 ms (to see races) | Delay: Random | `?mockDelay=random` |
| No delay | Delay: Off | `?mockDelay=off` |
| Fail the next request: the connection drops | Drop the connection | `?mockFail=network` |
| Fail the next request: a 502 from a gateway in front of the API | Answer 502 | `?mockFail=gateway` |

The delay setting is saved in `localStorage`. The panel can also act as **another user**, so
you can try the conflict flows by hand:

- **Changes this line** moves a line on the server and bumps its version. Your next change to
  that line gets 409 `stale_version`, with Keep mine / Take theirs.
- **Posts this batch** posts the open batch. Your next change gets 409 `batch_posted`, and the
  screen turns read-only.

### Against a real server

Set the base URL and the mock is switched off:

```sh
VITE_API_BASE_URL=https://api.example.com npm run dev
```

## How the code is organised

```
src/
  money/
    cents.ts          parseCents, formatCents (fixed interface), plus toAmount and formatAmount
    allocate.ts       allocate (fixed interface): the R4 split, the only implementation
  batch/
    types.ts          API shapes: Batch, Line, Charge, …
    readiness.ts      readiness (fixed interface): R5, with every reason
    rules.ts          R1 validity, totals per state
    automatch.ts      R3, run when the mock seed loads
    changes.ts        the optimistic version of a change (reuses allocate)
    sorting.ts        filter by state, sort by date or paid
  api/
    client.ts         the only way to reach the API; typed ApiError, branching on `code`
    problem.ts        the R10 error shape
    config.ts         VITE_API_BASE_URL, and whether the mock is on
  composables/        one per API resource, each exposing data, loading and error:
    useBatch.ts       GET /batches/{id}
    useLines.ts       GET /batches/{id}/lines, and the optimistic writes with rollback and conflicts
    useChargeSearch.ts  GET /charges: 300 ms debounce, AbortController, stale-response guard
    useAnnouncer.ts   messages for the aria-live region
  components/         BatchHeader, LinesTable, LineRow, MatchDialog, ExcludeDialog,
                      BaseDialog (focus trap), LiveRegion, DevPanel (mock switches)
  pages/BatchReviewPage.vue   the screen at /batches/:id
  mock/               seed.ts (spec 2.6 data + generated batches), db.ts (rules),
                      handlers.ts (MSW routes), controls.ts (switches), browser.ts
```

Tests sit next to the code, in `__tests__` folders.

## How the key requirements are met

- **Money (2.3).**
  - `parseCents` builds integer cents digit by digit. It never uses `parseFloat`, `Number()`
    or unary `+` on an amount string.
  - All arithmetic is on integer cents. `allocate` multiplies with BigInt, so large amounts
    can't lose precision.
  - `formatCents` formats only at the edge, with the U+2212 minus sign from the spec's example.
- **One R4 implementation.**
  - `allocate` is a pure, table-tested module.
  - The mock server, the split preview and the optimistic row all call it, so the preview
    equals the server's answer to the cent.
- **Header (4.1).**
  - Totals, the difference and readiness are recalculated from the lines on screen after
    every change, including optimistic ones.
  - After each confirmed write the batch is reloaded. If the server's `canPost` disagrees once
    nothing is in flight, the header says so and offers a reload.
- **Stale search (4.3).**
  - Every new query aborts the request in flight and invalidates it.
  - A late answer, or a late error, from an older request is dropped, even if the server
    ignored the abort.
  - Tested with fake timers.
- **Optimistic updates and conflicts (4.4).**
  - The row changes on click and rolls back if the server says no:
    - 409 `stale_version` opens Keep mine / Take theirs. Keep mine resends with the server's
      version.
    - 409 `batch_posted` reloads the batch, which turns the screen read-only.
    - 422 lists the field errors next to the row.
    - A network failure shows a message next to the row.
  - Everything is announced through aria-live regions.
- **Focus.**
  - The dialog traps Tab, closes on Esc and returns focus to the button that opened it.
  - A conflict panel takes focus, and gives it back to the row when it closes.
  - If the batch is posted under you, focus moves to the read-only banner.
  - Buttons that are only unavailable for a moment (while saving) use `aria-disabled`, so
    they keep focus. Actions R1 forbids are `disabled`, with the visible reason linked by
    `aria-describedby`.
- **500 lines.**
  - Lines are immutable objects in a `shallowRef`, and rows bind stable handlers.
  - A change to one line gives only that row new props: a test checks that exactly one of 500
    rows re-renders.
- **No `v-html`, no `any`.** Both are lint errors (`vue/no-v-html`,
  `@typescript-eslint/no-explicit-any`). Remarks are rendered with `{{ }}`, so the seeded
  `<img src=x onerror=alert(1)>` shows as text.

## Assumptions

1. **API base URL.** The contract paths (`/batches/{id}`, …) sit under a base URL, `/api` by
   default, so they don't collide with the page route `/batches/:id`. A real server is used
   unchanged by setting `VITE_API_BASE_URL`.
2. **`GET /batches/{id}` shape.** It returns the batch fields plus `totals` (paid per state, as
   amount strings) and `canPost`:
   `{ id, labId, expectedAmount, status, totals: { Unmatched, Matched, Suspense, Excluded }, canPost }`.
3. **R3 and `originalCode`.** When a line has `originalCode`, that is the code compared with
   the lab's charges, because it is the code the lab billed. For B-104, reading the rule as
   "code or originalCode" gives the same result.
4. **R1 read literally.** An invalid line "may only move to Excluded", so Unmatch is blocked for
   it too: disabled in the UI, 422 from the mock. That means an exclusion of an invalid line
   can't be undone. I'd check this with product.
5. **Readiness wording.**
   - "Batch is posted"
   - "1 line unmatched" / "N lines unmatched"
   - "Totals differ by $X", as an absolute amount

   Reasons follow the order of R5.
6. **`allocate` edge cases.** Shares keep the order of the input charges. It throws a
   `RangeError` for:
   - an empty list
   - a non-integer paid amount
   - a negative charge amount in a split
   - charges that are all zero
7. **`GET /charges`.**
   - `q` is trimmed, and an empty or blank `q` gets 422.
   - `limit` must be a whole number from 1 to 50, otherwise 422 (it is not clamped).
   - The match dialog asks for 50.
8. **Errors outside the contract.** The failure switch simulates infrastructure failures: a
   dropped connection, or a 502 text page from a gateway. These are deliberately not
   problem+json, and the client reports them as `network` / `unexpected` errors.
9. **Bad JSON.** A body that isn't JSON gets 400 with `code: "validation"`, because R10 lists
   no other code.
10. **One write per row at a time.** A row's actions are inactive while it saves.
11. **Reasons.** Reasons are trimmed. A reason is kept for Suspense and Excluded, and cleared
    when the line is matched or unmatched.
12. **No login.** The caller is always LAB-A. Charges, batches and lines of other labs are
    never returned (404 for batches and lines).

## Not done

- **No end-to-end browser tests.** The flows were checked by hand in the browser: the split,
  the conflict with Keep mine, a batch posted mid-edit, a dropped connection, the 500-line
  batch and the read-only batch. Logic and components are covered by Vitest.
- **No list virtualization.** 500 rows stay fast because only the changed row re-renders, but
  50,000 lines would need virtualization and server-side paging and filtering.
- **R7 and R9 only in part,** which the brief allows:
  - Lab isolation is implemented for reads and writes, but not tested exhaustively.
  - R9 order is applied to writes.
- **No undo** for excluding an invalid line, because of assumption 4.
- **Mock data is in memory** and resets on every page reload.
