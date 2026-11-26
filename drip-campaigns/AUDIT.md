# Drip Campaigns — architecture audit

Measured against Braze, CleverTap, MoEngage and Adobe Journey Optimizer.

**Every file and line reference below was resolved against the working tree.** An earlier version of this audit carried roughly a third of its citations past the end of the cited file; those are corrected here and the corrections are noted inline.

This module is a **builder only** — it saves journeys as config and nothing executes them. Every runtime failure described is what would happen once a backend runs these graphs as saved.

| | Count | Fixed |
|---|---|---|
| Critical | 3 | **3** |
| High | 8 | **5** |
| Medium | 9 | **7** |
| Low | 5 | 0 |

**Fixed so far:** C1, C2, C3, H1, H2, H4, H8, M2 — plus four seed-data defects the new validation found. Each fixed finding is marked below with what closed it.

---

## Critical

### C1 · Goal Check runs at zero elapsed time after every Send  ✅ **FIXED**

> **Fixed.** campaignReducer.ts — a Send now auto-inserts a WAIT_UNTIL on the goal event. Regression test: *no Send anywhere is followed directly by a GOAL_CHECK*.

**`src/reducer/campaignReducer.ts:55`**

```js
if (type === 'SEND' || type === 'PAUSE') { /* auto-insert GOAL_CHECK + GOAL_EXIT */ }
```

Adding a Send auto-inserts a Goal Check immediately after it, with no time in between. The check runs the moment the message is dispatched, so it can only ever catch customers who converted *before* the campaign messaged them.

The comment above the condition argues for this deliberately. The Pause half is sound — a customer can convert during a wait. The Send half inverts the sequence.

**Seeded into every campaign.** `src/data/seedCampaigns.ts` — the Card Activation spine is `SEND → GOAL_CHECK → PAUSE → SEND → GOAL_CHECK → PAUSE → SEND → GOAL_CHECK → EXIT`.

**It also fabricates analytics.** `src/data/dripAnalytics.ts:93`

```js
const yesPct = 0.1 + rand() * 0.2; // a modest 10-30% reach the goal at this specific checkpoint
```

A node that structurally cannot convert anyone reports 10–30% conversion.

**Fix.** Remove `type === 'SEND' ||`. Insert after time-passing steps only.

### C2 · The campaign Goal is only honoured where a Goal Check node sits  ✅ **FIXED**

> **Fixed.** Same change as C1. The wait carries the goal's own conditions, so it means the goal rather than its event type — which also closes H3 for auto-inserted waits.

**`src/data/graphTypes.ts:142-163`** (`DripGoal`) carries an event definition and nothing else — no exit-on-goal flag, no attribution window.

A customer who converts during a 20-day wait, or during a Send's own relative delay, keeps receiving messages. Conversions outside a Goal Check node are never counted.

**Partial correction to the original audit.** It stated the goal is *only* detectable at Goal Check nodes. `WAIT_UNTIL` already auto-wires to Goal Reached when the awaited event matches the goal (`campaignReducer.ts:117-120`), with the timeout path on the `No` branch (`:125`). The capability exists; nothing steers authors to it.

**Fix.** Campaign-level settings evaluated before every Send:

```ts
goalSettings?: { exitOnGoal: boolean; attributionWindow: { duration: number; unit: 'hours'|'days' } }
exitCriteria?: DripFilterRow[][]
```

Goal Check nodes then become optional milestones rather than the only detection point.

### C3 · Submit never validates node configuration  ✅ **FIXED**

> **Fixed.** `dcValidateCampaign(graph, goal)` re-checks every reachable node against the rule its own drawer enforces, plus reachability, open slots named by branch, non-terminal leaves and steps wired past an Exit. Gates submit; the first issue is shown as the validation message.

**`src/wizard/DripBuilder.tsx:264`**

```js
const canSubmit = !!name && !!issuer && graph.rootId !== null && !open;
```

`dcAddFormValid` (`src/reducer/defaultConfig.ts:77`) is called from exactly one place — **`src/wizard/AddEditDrawer.tsx:59`** — inside the drawer. Nothing re-checks a node once the drawer closes.

Reaching `PENDING_REVIEW` with any of these is possible:

- Imported nodes with partial `_config`
- The auto-inserted `SPLIT` after Wait for Event, which carries `_config: null` (`campaignReducer.ts:104`) — a Condition that checks nothing
- Nodes whose event filter was cleared by a program change (`src/reducer/programChange.ts`)
- Sends with no template, Experiments not summing to 100, Waits with no duration

**Fix.** `dcValidateCampaign(campaign): Issue[]` running `dcAddFormValid` over every node reachable from the root, plus the structural rules below. Gate `canSubmit` on it and list issues on Review with jump-to-node links.

---

## High

### H1 · Removing a Branch's catch-all arm deletes it permanently  ✅ **FIXED**

> **Fixed.** `'DECISION_SPLIT'` added to the revert-to-open-slot list.

**`src/reducer/graphOps.ts:49`** *(originally cited as `:325` — the file is 194 lines)*

```js
if (parent && ['SPLIT', 'RANDOM_SPLIT', 'WAIT_UNTIL', 'GOAL_CHECK'].includes(parent.type)) {
```

`DECISION_SPLIT` is absent, so its edges are deleted outright rather than reverting to an open slot. `dcReconcileBranchEdges` (`graphOps.ts:109`) never recreates a missing catch-all.

With no catch-all edge and no `null` slot, `dcGraphHasOpenBranches` (`graphOps.ts:187`) passes. Anyone matching no branch stalls silently.

**Fix.** Add `'DECISION_SPLIT'` to the list; guarantee exactly one catch-all in reconcile.

### H2 · Mid-edge insert orphans the downstream chain  ✅ **FIXED**

> **Fixed.** `'SPLIT'` and `'WAIT_UNTIL'` added to MID_EDGE_RESTRICTED_TYPES — both leave two open arms, and the reducer only reattaches when one remains. `dcValidateCampaign` also reports any node left unreachable.

**`src/reducer/campaignReducer.ts:203-204`**

```js
const openEdges = next.edges.filter((e2) => reachable.has(e2.from) && e2.to === null);
if (openEdges.length === 1) openEdges[0].to = originalTarget;
```

Reattachment happens only when exactly one dangling edge remains. **`src/wizard/DripBuilder.tsx:46`**:

```js
const MID_EDGE_RESTRICTED_TYPES: DcNodeType[] = ['DECISION_SPLIT', 'RANDOM_SPLIT', 'GOAL_EXIT', 'EXIT'];
```

`SPLIT` and `WAIT_UNTIL` are **not** restricted, and both leave two open arms. Insert either mid-edge and the original target is silently dropped — the subtree stays in `nodes`, unreachable, floating on canvas, counted in Review totals, and saved in the payload.

**Fix.** Either restrict both types, or reattach to a chosen port — `No` for Condition, timeout for Wait for Event. Add an unreachable-node check.

### H3 · Wait for Event wires to Goal Reached on event identity alone  ✅ **FIXED**

**`src/reducer/campaignReducer.ts:83` and `:116`**

```js
const goalMatchesThisEvent = goal && goal.eventCategory === p.eventCategory && goal.eventType === p.eventType;
```

The goal's `conditions`, `cardDetails` and journey/offer scoping are ignored. Goal = *Transaction, amount ≥ ₹5,000* with a Wait for *Transaction* and no filters sends every transaction down the Goal Reached path.

**Fix.** Auto-wire only when the Wait's predicate equals or narrows the goal's. Otherwise insert a real `GOAL_CHECK`.

> **Fixed, as prescribed.** `dcWaitMeetsGoal` compares the whole predicate — every goal condition (operators normalised through `dcNormalizeOperator`, so a legacy spelling still reads as the same comparison, and a single stored `value` reads as a one-item set), every scoping field the goal names, every non-empty card detail. Equal or narrower qualifies: conditions are AND'd, so carrying more than the goal does only ever matches fewer customers. Broader does not, and gets a real Goal Check on the wait's Yes arm, with its No arm left open — "the event fired but the goal was not met" is a real outcome only the author can route.
>
> Deliberately conservative where it cannot tell: an unrecognised operator or value shape reads as *not* meeting the goal. The costs are not symmetric — an unnecessary Goal Check is visible on the canvas and removable in one click, while a false Goal Reached is silent and indistinguishable from a real conversion afterwards.
>
> **The validator now checks auto-generated waits too**, which it did not before. The old exemption reasoned that `dcReconcileGoal` keeps them in step with the goal — true in the builder, false for any graph that never passes through it. **It was hiding a real defect in this repo's own seed data, introduced by the C1 migration in `8b2a169`:** DRIP-004's second checkpoint was converted into a wait built from the goal as it stood *before* that same batch corrected the goal, so it listened for `Transaction` while exiting to Goal Reached under a goal of `Outcome Issuance` — recording any purchase at all as a reward redemption. The seed is corrected to the event the conversion should have produced.
>
> The statusAttr branch (EMI's New Status) is deliberately unchanged: it already inserts a Goal Check rather than auto-wiring, which is safe whatever the predicate, and it preserves a distinction worth keeping — "resolved, but not to the goal outcome" is not the same as "never resolved".

### H4 · Editing the Goal leaves stale wiring  ✅ **FIXED**

> **Fixed.** `dcReconcileGoal` re-derives auto-generated goal wiring on goal change; `dcGoalWiringIssues` reports what only a person can resolve and blocks submit. This mattered more after C1, because a Send's wait now embeds the goal's event and predicate.

Auto-inserts are decided once, at node creation (`campaignReducer.ts:55-125`). `setGoal` (`src/wizard/DripBuilder.tsx:101`) is plain `useState` with no graph side effect, and the edit path explicitly excludes Goal Check nodes (`campaignReducer.ts:237-242`).

- Clear the goal and `GOAL_CHECK` nodes remain, now labelled "Goal?", still submittable
- Change the goal event and a Wait wired to Goal Reached for the old goal now records attainment for a non-goal event
- Add a goal later and earlier Sends get no checks

**Fix.** Reconcile on goal change. Block submit when the graph contains a `GOAL_CHECK` and `goal` is null.

### H5 · Re-entry defaults off, breaking repeating audiences

**`src/wizard/DripBuilder.tsx:94`** — `useState(initial?.allowReEntry ?? false)`
**`src/data/graphTypes.ts:189-191`** — the re-entry fields

`DRIP-004` "Reward Points Expiry Reminder" (`seedCampaigns.ts:848`) is configured `"repeat": true, "recurrenceType": "Monthly"` with `"conditions": []` — every account, monthly — and no `allowReEntry`. **Each customer can enter exactly once, so the monthly scan works only the first month.**

The rule tying re-entry to repeating entry exists as prose in `CLAUDE.md`, not in code.

**Fix.** Warn when `repeat && !allowReEntry`. For `ENTRY_EVENT` add `maxEntriesPerCustomer` and `dedupeWindow`. Make the eligibility rule an executable, tested function.

### H6 · The model never says what one journey run is keyed to

`DripCampaign` (`src/data/graphTypes.ts:168`) has no `journeyKey`. Entry filters mix Customer, Account and Card attributes.

DRIP-001 and DRIP-006 both start on "Virtual card issued". A customer with two cards either has the second journey blocked by re-entry rules, or gets duplicate parallel runs — undefined which. `Card = Active` in an audience is ambiguous when a customer holds several cards.

**Fix.** `journeyKey: 'customer' | 'account' | 'card'`, with any/all quantifiers on card and account filters when the key is customer.

### H7 · Guardrails are two exclusion lists

**`src/wizard/GuardrailsStep.tsx:10`** *(originally cited as `:315` — the file is 54 lines)*

```js
const GUARDRAIL_OPTIONS = ['Do Not Contact (DNC)', 'Non-Performing Assets (NPA)'] as const;
```

**`src/data/graphTypes.ts:196`** — `guardrails?: { dnc: boolean; npa: boolean }`

Absent across the whole module, confirmed by grep: frequency capping, quiet hours or send windows, per-channel consent, pre-send eligibility re-checks (card hotlisted/closed, offer expired), throttling, cross-campaign holdout.

Quiet hours matter specifically for Indian issuers under TRAI promotional-hours rules.

**Fix.**

```ts
guardrails: {
  exclusionLists: ('DNC'|'NPA'|string)[];
  frequencyCap?: { max: number; per: { duration: number; unit: 'days'|'hours' }; scope: 'campaign'|'global' };
  quietHours?: { start: 'HH:mm'; end: 'HH:mm'; tz: string; behavior: 'defer'|'skip' };
  preSendChecks?: DripFilterRow[][];
  onGuardrailHit: 'exit' | 'skipStep';
}
```

### H8 · Analytics guarantees a positive uplift  ✅ **FIXED**

> **Fixed.** Control conversion drawn from its own seed instead of `conversionRate × (0.45–0.70)`, so uplift can land either side.

**`src/data/dripAnalytics.ts:222`**

```js
const controlRate = conversionRate * (0.45 + rand() * 0.25);
```

The control group's conversion is **derived from treatment** at 45–70%. Uplift is positive by construction — the dashboard is structurally incapable of showing that a campaign failed.

Terminal counting also sums per path rather than per run, so a campaign with parallel checkpoints can report more exits than entries.

**Fix.** Derive control conversions from an independent seed and rate. Count terminal states per run. Show a confidence interval, or "insufficient sample".

---

## Medium

### M1 · Branch polarity is stored as display text  ✅ **FIXED**

`'Yes'` / `'No'` / `'Anything else'` strings are the only port identity, consumed by `graphOps.ts:109` reconcile and by analytics. Wait for Event's "event happened" arm is labelled `''` when a status check follows (`campaignReducer.ts:97`). Experiment percentages are parsed back out of labels with a regex.

An import using `"yes"`, a reordered edge list, or a renamed label silently flips routing.

**Fix.** `port: 'yes'|'no'|'event'|'timeout'|'else'|<branchId>` on `DripEdge`; `branchLabel` for display only. Rename Wait for Event's ports to **Event received** / **Timed out**.

> **Fixed.** `port` (`src/data/ports.ts`: next · yes · no · event · timeout · branch · else) is written on every edge the builder creates and carried by all 88 seeded edges. `branchLabel` is display only now: renaming an arm on the canvas cannot change where anyone goes. The three readers that made the text load-bearing were converted — `dcRemoveGoalCheck`'s `=== 'Yes'`, reconcile's catch-all match, and analytics' yes/no regex — and `dcPortOf` derives a port for edges written before this existed, **case-insensitively**, so the audit's own example of an import writing `"yes"` now routes correctly instead of silently flipping. An unknown `port` is refused at import.
>
> **The regex was not only fragile, it was wrong in this repo's own data.** An Experiment's allocation was parsed back out of the edge label with `/\((\d+)%\)/`, so what a campaign reported depended on how its arms happened to be written. DRIP-002's arms read `"50% WhatsApp"` — no parentheses — so its configured 50/50 matched nothing and the campaign was reported on a *random* split, while DRIP-006's `"WhatsApp-first (60%)"` matched and was honoured. Two experiments, same product, two different code paths. Allocation now comes from the owning node's `branches[]`, matched by `branchId` — which neither seeded experiment actually had, and both now do.
>
> **Not done, now a free decision rather than a coupled one:** renaming Wait for Event's displayed arms to "Event received" / "Timed out". The ports already say that; the canvas still reads Yes/No. Changing the words is now purely a copy choice with no routing consequence, which is the point.

### M2 · Wait and Wait for Event have no duration validation  ✅ **FIXED**

> **Fixed.** `dcAddFormValid` now requires `Number(duration) > 0` for both Pause and Wait For Event. Previously Pause was not checked at all.

**`src/reducer/defaultConfig.ts:79`** — `if (t === 'ENTRY_EVENT' || t === 'WAIT_UNTIL') return !!p.eventType;` — event type only, never duration. `PAUSE` has no case at all.

**`src/wizard/NodeForms.tsx:305`** (Pause) and **`:349`** (Wait for Event) — `min={1}` is an HTML hint, and values are stored as strings via `onChange({ duration: e.target.value })`.

Zero, blank or negative means either an instant timeout or a run that waits forever; string durations leak into the backend contract.

**Fix.** Require `Number(duration) > 0` and a unit. Store numbers.

### M3 · Send timing is ambiguous and duplicates Wait

**`src/wizard/NodeForms.tsx:244`**, **`src/reducer/defaultConfig.ts:40`**

`Absolute` holds only a time of day — no day offset, no time zone, no rule for a time already passed today. `relativeAnchor` is stored (seeds use `"Entry"`) but has no field in the form. The Send's own relative delay duplicates the Wait node and bypasses goal checks (C2).

**Fix.** Move delays out of Send into Wait nodes. Give Send `sendWindow?: { at: 'HH:mm'; tz: 'customer'|'issuer' }` with next-occurrence semantics. Remove or expose `relativeAnchor`.

### M4 · Seed data contradicts itself  ✅ **FIXED** (both contradictions; one targeting question stands)

| Issue | Location |
|---|---|
| Label `"Previous step: Clicked?"` over config `"outcome": "READ"` | `seedCampaigns.ts:1038/1041` and `:1332/1335` |
| DRIP-004 goal is `Transaction` (`:854`) but the Wait is on `Outcome Issuance` (`:883`) and exits to `GOAL_EXIT` labelled "Redeemed" — **a non-goal event recorded as goal attainment** | `seedCampaigns.ts:854, :883` |
| DRIP-004's audience has `"conditions": []` — every account, monthly | `seedCampaigns.ts:867` |

**Correction to the original audit.** It also flagged DRIP-006 "Card Issuance to Activation (Set PIN)" against goal "Virtual card activated" as a contradiction. That is a naming question, not a defect — setting a PIN is plausibly part of activation. Dropped.

**Fix.** Correct the seeds. Add a test that rebuilds each node's label from its `_config` and asserts they match.

> **Fixed.** Both contradictions are gone: DRIP-004's goal now names the event its own graph waits for, and the label drift was fixed wholesale — 28 of 94 nodes, not the two spotted here — with `tests/unit/seedLabels.test.ts` rebuilding every node and requiring an exact match. See the seed-defect tables below.
>
> **Still open, as a question rather than a defect:** DRIP-004's audience has no filters, so a reward-expiry campaign targets every account monthly. An audience with no filters targeting everyone is a deliberate, real answer in this builder, so this is not wrong on its own — but for this campaign it almost certainly should narrow to accounts holding points that are about to lapse, and there is no attribute for that today. Same family as the DRIP-004 goal-narrowing question below.

### M5 · Parallel paths don't define terminal scope

`dcCanFanOut` (`src/data/nodeMeta.ts:137`) permits fan-out, but nothing says whether reaching Exit on one parallel path ends the whole run or only that path. Re-entry depends on "finished", so a parallel campaign never clearly finishes.

**Fix.** `terminalScope: 'path' | 'journey'` on Exit and Goal Reached, defaulting to `'journey'` for Goal Reached.

### M6 · Experiment and control inputs are under-validated  ✅ **FIXED** (duplicate labels; the rest stands)

**Correction to the original audit.** It claimed `controlPct` "accepts anything, including negative, over 50". **`src/wizard/BasicDetailsStep.tsx:142`** does bound it:

```jsx
<input type="number" min={0} max={50} value={controlPct} onChange={(e) => onControlPctChange(Number(e.target.value))} />
```

The real gap is narrower: those are HTML attributes with **no submit-time validation**, so a pasted or programmatic value is not re-checked, and an empty field yields `NaN`.

Genuine, and confirmed: **`src/wizard/NodeForms.tsx:542` and `:545`** both derive variant labels from `String.fromCharCode(65 + branches.length)`, so removing a variant and adding another produces **duplicate labels**. `dcAddFormValid` checks only that percentages total 100 (`defaultConfig.ts:85`), so `[120, -20]` passes.

No randomisation unit or stickiness is defined for either control or variants, which matters once re-entry is on.

**Fix.** Validate `controlPct` on submit. Require each variant 1–99 with unique labels. Add `assignment: { unit: journeyKey; sticky: true }` and a per-variant success metric.

> **Fixed: the duplicate labels.** `dcNextVariantLabel`/`dcNextBranchLabel` (`src/reducer/defaultConfig.ts`) name a new arm against the names already taken rather than against the arm count, so A/B/C minus B plus one is B again, not a second C. Both Experiment and Branch were affected — Branch had the same bug with "Branch N". A renamed arm frees its name; past Z the fallback is "Variant n", never a duplicate.
>
> **`controlPct` is now checked at submit too**, with M7's own setup rules — a whole number between 0 and 50, so a paste, a restored draft or an emptied field reading as `NaN` no longer passes.
>
> **Still open:** per-variant percentages are only checked as a total, so a 100/0 split passes with an arm nobody ever reaches, and there is still no assignment unit or stickiness. The latter belongs with H6's journey key, since "what is a variant sticky to" and "what is a run keyed to" are the same question.

### M7 · Scope and schedule are unvalidated  ✅ **FIXED** (the checks; `onEnd` is a decision, below)

- **`src/wizard/BasicDetailsStep.tsx`** permits "all programs" before an issuer is chosen
- Issuer with zero programs and the toggle off still submits (`DripBuilder.tsx:264`)
- Start and end dates have no ordering, past-date or time-zone checks, and no rule for customers mid-journey at `endDate`
- **`src/data/sharedConstants.ts:715`** — `dcAppEventsForPrograms(_programs)` is a stub; the underscore-prefixed parameter is unused, so `applyToAllPrograms` is ignored

**Fix.** Add to `dcValidateCampaign`. Add `onEnd: 'drain' | 'exitAll'`.

> **Fixed: the checks.** `dcValidateSetup` is part of the same submit gate as the journey, so everything the gate refuses now comes from one list. It requires a name and an issuer; refuses an issuer with no programs and the all-programs toggle off (a complete, valid campaign addressed to nobody — every one of this suite's own wizard flows was in that state, which is how it was found); bounds the control group at a whole 0–50, which the input's `min`/`max` never did for a paste, a restored draft or an emptied field reading as `NaN`; and refuses an end date before the start or already in the past.
>
> **A start date in the past is deliberately not flagged.** Editing a campaign that began last month is the ordinary case and the builder cannot tell that apart from a typo. Timezones are untouched for the same reason the audit raised them: this app has no timezone model, a date is a bare calendar day, and comparing the strings is exactly as precise as the data is.
>
> **Name and issuer moved INTO the validator** from a ternary chain inside the Builder's own render — the same split brain C3 fixed for node config, one rule in the gate and another in a component.
>
> **The seeds are now held to these rules too**, which is what a fixture should mean. All six named an issuer with no programs; they are marked as applying to all programs, which is what an issuer-wide demo campaign actually is.
>
> **Still open, and a decision rather than a fix:** `onEnd: 'drain' | 'exitAll'` — what happens to customers mid-journey when the campaign ends. Letting them finish is the industry default; a hard stop is the right answer when an offer legally expires. Both are defensible, which is why it is not being guessed at here. `dcAppEventsForPrograms` also remains the documented stub it always was.

### M8 · Nothing prevents the entry event being the goal event  ✅ **FIXED**

Entry · Event = "Virtual card activated" with Goal = "Virtual card activated" means every customer has already converted on entry. No warning exists.

**Fix.** Lint for entry event equal to goal event, and for a goal already satisfied by the entry filters.

> **Fixed, both halves, by one comparison.** The submit gate refuses a campaign whose Entry · Event already satisfies the goal, judged by the same `dcEventMeetsGoal` the waits use (renamed from `dcWaitMeetsGoal` when it gained this second reader). That covers the audit's second half for free: it is not a name match but a predicate test, so an entry carrying the goal's own conditions is refused too, and a BROADER entry is correctly allowed — entering on any transaction while aiming for one over ₹5,000 is a real campaign.
>
> It blocks rather than warns, because there is no honest reading of a campaign where the funnel reads 100% on arrival: no message in it can have caused anything, and the goal measures nothing. The message names both ways out — narrow the goal, or start on an earlier event.

### M9 · Import validates almost nothing  ✅ **FIXED**

**`src/data/ingestCampaign.ts:102`**

```js
if (!parsed?.root || typeof parsed.root.nodes !== 'object' || !Array.isArray(parsed.root.edges)) {
```

No node-type validation, no edge-target checks, no `rootId` membership check, no cycle detection. An unknown `type` crashes anything indexing `DC_NODE_META[type]`; nodes in a cycle are silently dropped by analytics because their in-degree never reaches zero.

**Fix.** Validate on import, quarantine invalid parts, report errors.

> **Fixed.** `graphIntegrityError` (`src/data/ingestCampaign.ts`) now rejects, naming the offending step or connection: an empty file, a node whose own `id` disagrees with the key it is filed under (the canvas resolves handles and counts by `node.id` while edges and layout resolve by key, so the two disagreeing renders arrows attached to nothing), an unknown node type, a missing or dangling `rootId`, an edge from or to a step that is not in the file, an edge with no id, and two edges sharing one id (branches reconcile by edge id, so a duplicate makes two arms the same arm). `to: null` stays legal — that is an open slot.
>
> **Deliberately not the submit gate.** An import lands as a DRAFT and opens straight in the builder, where `dcValidateCampaign` is already on screen listing what is unfinished. Rejecting a file for an open branch would refuse the normal case. The split is: integrity is what no drawer can repair, completeness is what the gate already reports.
>
> Cycle detection was not added. Nothing in the audit's claim was reproducible here — analytics walks from the root rather than by in-degree — and a cycle is a legitimate shape the builder itself cannot currently create.

---

## Low

### L1 · Stale copy

- **`src/data/typeSub.ts:18`** — Goal Check reads *"(system-generated, not addable)"*, but it is addable and the picker shows this text
- **`src/data/typeSub.ts:7`** — *"Cohort snapshot"* even for a repeating schedule
- Header comments disagree with the current five-step flow: `BasicDetailsStep.tsx:1` says "1 of 3", `ReviewStep.tsx:1` says "4 of 4", `DripBuilder.tsx:1-3` says "3 steps"

### L2 · Goal step marked incomplete when no goal is set

**`src/wizard/DripBuilder.tsx:311`** marks `goalDefinition` incomplete unless `goal.eventType` exists, despite the step saying not every campaign needs one.

### L3 · Goal Reached arm can be rewired to a Send

Removing the Goal Reached exit reverts the arm to an open slot (`graphOps.ts:49`), allowing a Send on the already-converted path. Consider restricting that arm to terminal nodes.

### L4 · Goal Check label breaks for multi-value goals

**`src/reducer/campaignReducer.ts:92`** — `` label: `${statusAttr} = ${goalCond.value}?` `` renders "undefined" when the goal uses `values[]`. The canvas usually masks this by recomputing, but the stored label is wrong.

### L5 · No snapshot-vs-live semantics on conditions

Nothing says whether a condition reads the value at entry or at evaluation. AJO and Braze distinguish entry properties from live profile attributes.

**Fix.** `valueAt: 'entry' | 'evaluation'` on `DripFilterRow`.

---

## Seed defects found by the new validation

None of these were found by reading. All four surfaced once `dcValidateCampaign` and `dcGoalWiringIssues` existed, which is the argument for building checks rather than reviewing data.

| Campaign | Defect | Resolution |
|---|---|---|
| DRIP-001/2/4/5/6 | 15 zero-delay goal checkpoints | Converted to waits on the goal; absorbed Pauses keep their durations |
| DRIP-003 | Four Conditions used `operator: "IS"`, the retired Completed/Not Completed choice the code refuses to guess at | Migrated to *is at least 100%* |
| DRIP-003 | Those same four pointed at `MS-1001`, from a catalogue that no longer exists | Repointed to real `MO-*` entries, time-matched to each tier |
| DRIP-004 | Goal said `Transaction`; the graph waits for `Outcome Issuance` and exits to Goal Reached | Goal corrected to what the graph measures |

A second pass, once every label was rebuilt from its own `_config`, found **28 of 94 nodes stating something their config did not say** — the canvas and the drawer disagreeing, with nothing to catch it:

| Campaign | Drift | Resolution |
|---|---|---|
| DRIP-005/006 | Two Conditions read *"Previous step: Clicked?"* over an outcome of `READ`, and the send before each is WhatsApp, which has no `CLICKED` status at all | Rebuilt from the config: *"Previous message outcome is any of READ?"* |
| DRIP-003 | The four milestone checks still read the invented spend ladder deleted on 2026-10-23, though their configs had been migrated to real offers | Rebuilt: *"Monthly Spend Milestone is at least 100%?"* and the other three |
| DRIP-001/002/005/006 | Twelve sends carried a channel or a bare time in `meta`, from before Send grew its own per-fact rows — dead text the card never reads | Blanked; the card renders channel, template and timing from `_config` |
| DRIP-002/006 | Both experiments' allocation lines were hand-written: one less specific than its config, one past the 24-character rule that keeps a long allocation off the canvas | Rebuilt from the branches |
| DRIP-001 | Three Goal Reached exits read "Activated" while their own `reason` field said "Virtual card activated" | Label follows the field the drawer owns |
| DRIP-001 | An Exit carried a sub-line ("No activation after 3 attempts") that no form can produce | Blanked |
| DRIP-004 | A Wait for Event read "Redeemed?" while its config narrows nothing | Rebuilt as "Outcome Issuance" |

`tests/unit/seedLabels.test.ts` now rebuilds all 94 and requires an exact match, so this class cannot return silently.

**One seed-design question this raised, left open rather than guessed:** DRIP-004 ("Reward Points Expiry Reminder") has a goal of `Outcome Issuance` with no conditions, so any outcome issuance counts as redemption. Its exits say "Redeemed". Narrowing the goal to `Outcome Status = Redeemed` is probably what it means, but it would change what every wait in that campaign listens for, so it is a decision rather than a correction.

## What is left

**Next:** M3 (Send's own relative delay duplicates the Wait node and bypasses the goal checks) and M5 (a parallel path has no terminal scope, so "finished" is undefined for a fan-out campaign). M5 is partly answered already: a campaign now stops everyone at its end date, and the same question — what ends a *run* — is H6's.

**One decision left, not a fix,** and it needs an answer before any code: H6's journey key — what one run is keyed to, customer, account or card — which H5, H7 and M6's variant stickiness all hang off.

**Decided 2026-11-26:** `onEnd` is a hard stop. At the end date the campaign stops and anyone part-way through the journey stops with it. Stated on Basic Details and in the campaign's own read-back; no configuration, because there is one behaviour.

**Then H5, H6 and H7 together** — re-entry, journey key and guardrails are one question: what is a journey run keyed to, and when is it finished. H6 is a decision rather than a fix.
