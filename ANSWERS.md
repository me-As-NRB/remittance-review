# Answers to the written questions (section 5)

All amounts below come from the code in this repository: `src/batch/automatch.ts`,
`src/batch/readiness.ts` and `src/money/allocate.ts`, and they are pinned by tests
(`automatch.spec.ts`, `readiness.spec.ts`, `allocate.spec.ts`).

## Q1. Batch B-104 right after import

Auto-match (R3) matches a **valid** line when **exactly one** LAB-A charge has the same
claim, date of service and code (the `originalCode` when the payer changed the code).

| Line | State | Why |
|---|---|---|
| L-1 | Matched | one charge fits: CH-11 gets $120.00 |
| L-2 | Matched | one charge fits: CH-12 gets $30.00 |
| L-3 | Matched | one charge fits: CH-21 gets −$200.00 (a reversal) |
| L-4 | Matched | one charge fits: CH-21 gets $180.00 |
| L-5 | Matched | matched on original code 88307: CH-31 gets $100.00 |
| L-6 | **Unmatched** | two charges fit (CH-41 and CH-42: same claim C-504, date and code), and R3 needs exactly one |
| L-7 | **Unmatched** | no LAB-A charge exists for claim C-999 |
| L-8 | Matched | one charge fits: CH-51 gets $0.00 |
| L-9 | **Unmatched** | invalid (R1): billed $40.00 ≠ paid $25.00 + adjustments $10.00 = $35.00, so auto-match skips it even though CH-61 fits. It can only be excluded. |

- **Matched total: $230.00** (120.00 + 30.00 − 200.00 + 180.00 + 100.00 + 0.00)
- **Unmatched total: $275.00** (200.00 + 50.00 + 25.00)
- **Not ready to post.** Two reasons: 3 lines are unmatched, and the decided lines
  ($230.00) differ from the expected $505.00 by $275.00.

It becomes ready once L-6 is split across CH-41 and CH-42, L-7 goes to suspense and
L-9 is excluded: nothing is unmatched and 230.00 + 200.00 + 50.00 + 25.00 = 505.00.

## Q2. Rounding (R4)

Each share is ⌊abs(paid) × charge amount ÷ total of the charges⌋, in cents. Leftover cents
go one at a time to the largest charge amounts (ties: lowest id), then paid's sign is applied.

| Case | Calculation (cents) | Shares |
|---|---|---|
| (a) L-6, $200.00 across CH-41 $250.00 and CH-42 $250.00 | 20000 × 25000 ÷ 50000 = 10000 each, nothing left over | **CH-41 $100.00, CH-42 $100.00** |
| (b) $100.01 across CH-1 $60.00 and CH-2 $40.00 | ⌊10001 × 6000 ÷ 10000⌋ = 6000 and ⌊10001 × 4000 ÷ 10000⌋ = 4000; 1 cent left goes to the largest amount, CH-1 | **CH-1 $60.01, CH-2 $40.00** |
| (c) $100.00 across CH-1, CH-2 and CH-3, each $33.33 | ⌊10000 × 3333 ÷ 9999⌋ = 3333 each, 9999 in total; 1 cent left, all three tie, so the lowest id gets it | **CH-1 $33.34, CH-2 $33.33, CH-3 $33.33** |
| (d) −$100.01 across CH-1 $60.00 and CH-2 $40.00 | split abs(paid) exactly as in (b), then make every share negative | **CH-1 −$60.01, CH-2 −$40.00** |

Every split adds up exactly to paid.

## Q3. Two users change L-6 at the same time

Both screens start with L-6 Unmatched at **version 1**.

**User A splits it across CH-41 and CH-42.**

1. On click, A's row changes at once (optimistic update): Matched, CH-41 $100.00 and
   CH-42 $100.00, marked "Saving…". A's header recalculates straight away: Matched +$200.00,
   one fewer unmatched line.
2. `PUT /lines/L-6/match { version: 1, chargeIds: ["CH-41", "CH-42"] }` reaches the server
   first. Version 1 is current, so the server saves it and answers 200 with L-6 Matched,
   **version 2**.
3. A's row is replaced by the server's line (the same numbers), "Saving…" disappears, the
   screen reader hears "Line L-6 saved", and the batch is reloaded so the header has the
   server's canPost.

**User B sends it to suspense.**

1. On click, B's row shows Suspense and "Saving…".
2. `PUT /lines/L-6/state { version: 1, state: "Suspense" }` arrives second. The line is now
   at version 2, so the server answers **409 `stale_version`**, with `current` holding L-6 as
   A left it (Matched, CH-41 + CH-42, version 2).
3. B's row **rolls back** to what B had (Unmatched, version 1), and so does B's header.
4. A conflict panel opens under the row with B's change next to the server's line:
   - "Your change: Send to suspense"
   - "Now on the server (version 2): Matched to CH-41 $100.00 and CH-42 $100.00"

   It is announced through the aria-live region, and focus moves into the panel, because
   B was working on that row.

**What B is offered:**

- **Take theirs:** B's row shows A's split (version 2). Nothing is sent. Final state:
  Matched, version 2.
- **Keep mine:** B's change is applied again, optimistically, on top of the server's line,
  and resent with the new version: `PUT /lines/L-6/state { version: 2, state: "Suspense" }`.
  The server answers 200: Suspense, allocations cleared, **version 3**.

A's screen still shows version 2 until it reloads. If A changes L-6 again, A gets the same
conflict panel with version 3. In both cases focus returns to the row when the panel closes.

## Q4. Keeping the split preview and the server from drifting apart

In this repo they can't drift: the preview, the optimistic row and the mock server all call
the same `src/money/allocate.ts`. With a separate real backend, I would do this:

1. **One owner of the rule.** Add a dry-run endpoint, e.g. `POST /lines/{id}/match/preview`,
   that returns the allocations without saving. The dialog can still compute locally for
   instant feedback, but it shows the server's numbers once they arrive, and confirms with
   those.
2. **Shared golden tests.** Keep one table of cases (paid, charges → shares, including
   leftover cents, ties, ordinal ids and negatives) as a JSON fixture that both the frontend
   and the backend test suites run in CI. When Finance changes the rule, the table changes
   first, and whichever side hasn't been updated fails its build.
3. **Version the rule.** The server sends the rule version it uses (for example
   `allocationRuleVersion` with the batch). The client knows which version its module
   implements. On a mismatch it stops showing its own preview and falls back to the dry-run
   endpoint, instead of showing numbers that may be wrong.
4. **Detect drift in production.** After each match, compare the server's allocations with
   the preview the user confirmed. On a mismatch, show the server's values and log an alert,
   so drift is noticed in minutes, not at month-end.
5. **Roll changes out in order.** Ship the client that understands the new rule version
   first, then switch the server behind a feature flag.
