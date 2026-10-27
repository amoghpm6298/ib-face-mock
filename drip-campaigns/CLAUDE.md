# drip-campaigns — Journey Builder React port

Source of truth for this specific React app (`ib-face-mock/drip-campaigns`),
the React/Vite port of the original plain-HTML Drip Campaigns prototype that
still lives in `journeysnudgesemi`. That folder's own `CLAUDE.md` documents
the *original* prototype's history — this file documents the port's own,
separate history going forward. Early phase work (Phase 0 data/reducer port
through Phase 5 cutover, the Phase 2 visual-design-system pass, the 3→4-step
wizard rebuild) is in the git log as its own commits; this file picks up
from the round below.

## 2026-10-08 — Channel Failover merge, canvas node-design refinement (P0/P1/P2), 4-step rail, width tuning, goal-check bug fix

A long, iterative round driven by direct screenshot feedback, several
distinct pieces:

**Channel Failover folded into Send.** It used to be its own chained node
type (`CHANNEL_FAILOVER`) — now it's an optional `fallbackChannel` on
`SEND` itself (same send, not a separate step), removed from `DcNodeType`
entirely. The Send card shows the primary channel's icon plus, only when a
fallback is configured, the fallback channel's own icon in the same row
(tooltips: `"{channel} · Primary channel"` / `"{channel} · Fallback if
{primary} delivery fails"`) — no channel name as text anywhere on the card.
Migrated the 2 real seed instances by folding one into its preceding Send's
`fallbackChannel` and removing the other as purely redundant with the plain
Send already next to it.

**Canvas node-design refinement — the big one.** Established and applied a
hard rule: *the canvas is an execution map, not a configuration database*.
Every field on every node type was classified P0 (essential, canvas)/P1
(useful, canvas if it genuinely helps)/P2 (config detail, drawer-only), and
the canvas was stripped down to match:
- Entry·Audience: recurrence only (nothing if not repeating) — entity +
  conditions dropped.
- Entry·Event: event category only — conditions dropped.
- Send: step name, template name (own icon, no "Template:" prefix, dropped
  if identical to the step name), timing (clock icon, 12-hour "11:00 AM"
  for absolute / "X days after {anchor}" for relative — no more bare
  ambiguous "11:00"), fallback as its own separated row — account dropped
  entirely.
- Wait for Event: resized `compact → standard`; timeout only, category +
  conditions dropped.
- Condition: kept as-is after an explicit correction — a single *simple*
  condition still gets a real human-readable summary ("Status = Active?"),
  only 2+/complex conditions collapse to "Custom condition" + count. Never
  renders raw operators/values regardless of count; height stays bounded
  (1 condition and 5 conditions render at the same height).
- System-generated badge and Goal Check's "Remove goal check" action:
  de-emphasized from filled colored pills to plain colored text, no
  background — still full-strength color (not disabled-looking), just not
  shouting.
- Reused-node badge: "Reused in N places" → compact "↗ N" + tooltip.

**Top-right is reserved exclusively for the hover remove "✕."** Previously
Entry's START badge and Send's fallback icon were both pushed to the card's
right edge via `margin-left:auto`, which visibly collided with the hover
remove button on short labels (e.g. "ENTRY · EVENT"). Fixed at the shared
card component level, not per-node: all content now flows left-aligned/
inline, and any card that can show the remove action reserves a small fixed
gutter in its identity row at all times (`.dc-node-card.has-remove
.dc-node-type { padding-right: 16px }`) so nothing can ever land under it,
hover or not.

**Node width.** All node types already shared one `DC_CARD_W` constant feeding
dagre (compact/standard only ever differed by padding/min-height) — went
186px (too narrow, routinely truncated) → 440px (too wide, canvas felt
sparse) → **400px**, the final value, picked by visually validating a dense
real campaign at each step.

**Creation-flow rail.** Replaced the single-row horizontal breadcrumb with a
persistent left rail (modeled directly on this product's own Nudges/Batch/
Incentive wizards) across all 4 steps, Builder included: Back link → title
(folded "New/Edit Campaign" into the one group label, dropped the separate
line that was duplicating it) → numbered-circle stepper with a connecting
line, filled-blue circle + white checkmark when done. Added a 4th step,
**Review**, after Builder — a plain read-back (Campaign/Scope/Experimentation/
Schedule/Goal/Journey) with Save as Draft/Submit for Approval, which moved
here from Builder's old header. Footer CTAs on Basic Details/Goal/Review are
sticky to the viewport bottom and right-aligned. Removed "Skip to Builder";
"Continue to Goal" is now always enabled (not gated on a filled-in name).
Goal's own intentional empty-state gate ("Define a goal" button before the
form appears) was removed too — the form is always there now, leaving Event
Type unset still means no goal, same semantics as before.

**Real bug fix, not cosmetic:** Wait for Event's auto-insert used to wire
its Yes branch straight to a "Goal Reached" node for any *unambiguous*
event (no promoted status attribute, e.g. `Transaction`, `Card Activated`)
— unconditionally, even with **no campaign Goal defined at all**. Surfaced
by the user directly asking "have not defined a goal but how is this
showing Goal Reached?" on a real screenshot. Fixed to require the same
symmetry the sibling status-attribute branch already had: only wire to Goal
Reached when a real Goal is defined *and* it's specifically this event;
otherwise the Yes branch stays open, same as every other "don't guess" case
in that function.

Verified throughout: `tsc --noEmit` clean, unit tests (73 → 75 after the
goal-check regression coverage), e2e tests (26/26 throughout, several
selector/flow updates for the removed Skip-to-Builder and the renamed
fallback DOM classes), clean production build, and real Playwright
screenshot verification at every step (not just test-suite green) — this
whole round was driven by the user reviewing actual rendered screenshots,
not spec compliance alone.

## 2026-10-08 (cont'd) — Re-entry + Guardrails, Basic Details IA cleanup, copy density pass

**Re-entry**, on Basic Details: a one-time gate, distinct from Guardrails
below — checked only when a customer finishes the journey (reaches Exit or
Goal Reached), not on every node. Modeled as `allowReEntry: boolean` +
`reEntryCooloffDuration`/`reEntryCooloffUnit` on `DripCampaign`, reusing
Pause's own `duration`+`unit` shape. Off by default; cool-off of 0 means
immediate re-entry once enabled.

**Guardrails**, a new 5th step (Builder → Guardrails → Review): DNC and NPA
exclusion lists, modeled as `guardrails: { dnc: boolean; npa: boolean }`,
both on by default. Checked continuously at every node — the opposite
execution model from Re-entry's one-time gate, which is why they're two
separate concepts rather than one "exclusions" section. Campaign-priority
/ cross-campaign arbitration (drop a lower-priority campaign when a
customer qualifies for two at once) was discussed and deliberately pushed
to backlog — it needs a cross-campaign evaluation engine this app doesn't
have; per-campaign config can't honestly solve it.

**Basic Details Issuer/Program redesign**, iterated twice in one session
before landing: first pass moved Program(s) to a closed-by-default
`MultiSelectDropdown` (reusing the component already built for Conditions'
multi-select attributes); the user then pointed at a screenshot of the
Nudges wizard's own Issuer/Program layout and asked for that instead —
Issuer dropdown → new **"Apply to all current and future programs"**
toggle (`applyToAllPrograms: boolean` on `DripCampaign`, ported
`.toggle-row`/`.toggle` CSS from the Nudges prototype) → Program as
inline toggle chips (reverted to `ChipPicker`), dimmed and showing "All
programs selected" once the toggle is on. Also removed every
`wiz-group-label` section heading on Basic Details ("Campaign Details",
"Scope", "Experimentation", "Re-entry", "Schedule") per direct request —
fields now flow directly, grouped only by spacing.

**Removed a redundant "Clear Goal" link** on the Goal step — the adjacent
Event Type dropdown already has a "No goal — leave unset" option that
does the same thing; a second control for the same action was pointless
UX clutter, caught by direct user review.

**Copy density pass, app-wide**: several hint/sub-text strings across
Basic Details, Goal Definition, Conditions, Guardrails, and the node
config forms (Pause, Send fallback, Decision/Random Split, mid-chain
insert) were long em-dash-joined compound sentences — flagged directly
("these are v dense copies"). Rewritten throughout as short, complete
sentences with no em-dash joins. This is now a standing rule for all
future copy in this app, not just a one-time cleanup.

Verified: `tsc --noEmit` clean, unit tests (75/75 throughout), e2e tests
(26/26 — 2 of them needed a `Continue to Guardrails` click inserted ahead
of their existing `Continue to Review` click, since Guardrails now sits
between Builder and Review), clean production build, and Playwright
screenshot verification of every visual change (toggle on/off states,
chip selection, dimmed Program picker).

## 2026-10-08 (cont'd) — Condition/Branch gap fixes; re-entry + repeating-audience spec

A pass driven by a built node-reference doc (an Artifact — every node's
config fields, dropdown values, and outputs, read directly off
`defaultConfig.ts`/`nodeMeta.ts`/`sharedConstants.ts`) surfacing real
gaps once everything was written down in one place:

**Condition (SPLIT) now actually validates.** It previously had no entry
in `dcAddFormValid` at all — you could save a Yes/No fork that checked
nothing (no outcome picked, zero conditions). Now requires a real
`outcome`, 1+ `customConditions`, or (new) a defined campaign Goal,
depending on source.

**Condition gained a 4th source: "Goal."** Previously there was no way
to manually check "has this customer achieved the campaign goal?"
anywhere except via the auto-generated, non-removable-content
`GOAL_CHECK` node that only ever appears right after a Send/Pause.
Picking "Goal" as a Condition's source checks the same thing manually,
anywhere in the graph, blocked if no campaign Goal is defined yet.

**Branch (DECISION_SPLIT) now properly supports multiSelect/smartTag/list
attributes.** Its own per-branch value field was a separate, incomplete
implementation that silently fell through to a plain text input for
those types (e.g. "Engagement Tier"), while Condition's equivalent
(`ConditionRows.tsx`'s `ValueField`, now exported) handled them properly
via a real checkbox picker. Branch now reuses that same component, plus
the matching "Any of" operator auto-fill multiSelect needs. The
`dcAddFormValid` check for Branch was also fixed to recognize a
multiSelect branch's `values[]` as a filled-in value, not just `value`
(it previously always rejected multiSelect branches as incomplete).

**"Previous step outcome" now accounts for a Send's fallback channel.**
Previously it only ever looked at the primary channel
(`previousStepChannel` in `DripBuilder.tsx` returned a bare `Channel`),
even though a fallback channel could be the one that actually delivered.
Now carries both (`PrevStepSend = { channel, fallbackChannel }` in
`sharedConstants.ts`), and `deliveryStatusOptionsForSend` merges both
channels' delivery-status vocabularies — the field label reads e.g.
"(WhatsApp + SMS fallback)" when one's configured.

Verified: `tsc --noEmit` clean, unit tests (75/75), e2e tests (26/26),
clean production build, and live Playwright verification of all four
fixes (disabled/enabled Add Step states, the merged-channel outcome
label, the Goal source's info text, and a real checkbox picker for
Engagement Tier on a Branch).

**Re-entry × repeating Entry · Audience — the combined eligibility rule
(spec only, nothing to implement — this app has no execution engine):**
these are two independent flags (`repeat` on Entry · Audience; `allowReEntry`
+ cool-off on the campaign) with no code connecting them, which is a real
gap the moment a real backend executes this. The agreed rule, for any
audience pull (first run or a scheduled repeat): a customer is eligible
to enter if (1) they currently match the entry's entity + conditions,
**and** (2) they have no currently-active, unfinished run of this same
campaign — this part is a hard rule, not configurable, regardless of
Re-entry's setting, since nothing should ever double-enter someone who's
mid-journey — **and** (3) either they've never been through this
campaign before, or their last run finished (reached Exit or Goal
Reached) **and** `allowReEntry` is true **and** at least the cool-off
duration has passed since that finish. Rule 2 and rule 3 are both
needed: rule 2 alone doesn't cover someone who's already finished and
rule 3 alone doesn't stop a parallel duplicate entry for someone still
running.

## 2026-10-09 — Four-campaign gap analysis; multi-outcome matching; Goal Check live sync

Driven by a formal spec evaluating whether the existing node system could
represent four real campaigns (Activation, Budget Optimisation, Dormant
Reactivation, Spend Milestone) without expanding the node taxonomy.

**Gap analysis first, per the spec's own Step 1.** Most of the four
campaigns turned out to already be buildable with existing nodes —
notably, every Spend Milestone condition example (spend progress < 80%,
between 0–20%, engagement = E or HE, combined with AND) maps directly
onto two attributes that already existed — `Milestone Progress %`
(number, Between) and `Engagement Tier` (multiSelect, "Any of") — with
zero code changes required. Two real gaps were found and fixed (below);
a third was confirmed as a genuine, unbuilt capability and documented
rather than built, per explicit instruction not to introduce new
snapshotting/attribute-storage infrastructure in this pass.

**Fix 1 — "Previous step outcome" now matches a set of statuses, not
one.** Both Condition and Branch previously only let you pick a single
exact delivery status (`outcome: string` / per-branch `value: string`).
Budget Optimisation's "Email was not delivered" needs several distinct
statuses (NOT_DELIVERED, HARD_BOUNCE, SPAM, SUPPRESSED...) to count as
one match — impossible before this fix. Both now use a real multiSelect
(`outcomes: string[]` on Condition, `values: string[]` per branch on
Decision Split, both reusing `MultiSelectDropdown`), with "any selected
status qualifies" semantics. Back-compat preserved via a new
`dcSelectedMulti(single, multi)` helper in `labelMeta.ts` — an old saved
journey with only the singular `outcome`/`value` field is read as a
1-item set, so nothing breaks on reload (verified directly: the two seed
campaigns with `"outcome": "READ"` still work unmodified). Canvas labels
collapse multi-outcome selections to "N outcomes" the same way multi-
condition Splits already collapse to "Custom condition" + count.

**Fix 2 — Goal Check no longer goes stale when the campaign Goal is
edited.** Previously a Goal Check's displayed question was set once at
node-creation time and never recomputed — editing the Goal afterward
left every existing Goal Check showing the old question. `goal` is now
threaded all the way into canvas rendering (`ToFlowOptions.goal` in
`toFlowElements.ts`, through `DripCanvas`, `BuilderStep`, and both
read-only view paths — `DripView.tsx` and `DripAnalytics.tsx`), and a
Goal Check's label is always recomputed live from it
(`dcGoalLabel(opts.goal) + '?'`), never read from the node's own stored
label. One source of truth for "what is the goal," not two — verified
live: changing the Goal from Pageload to Button Click updated an
already-built Goal Check's label on canvas with no node edit at all, and
the same applies when reopening an already-saved campaign. Goal
Reached's own `reason` text is deliberately NOT part of this — it's a
one-time editable default (same pattern as Exit), not a live display,
unaffected by this change.

**Documented, not built — entry-time snapshot vs. live-at-evaluation
attribute values.** No field anywhere distinguishes whether a condition
should read an attribute's value as it was at journey entry versus its
live value when the condition runs (Spend Milestone needs exactly this:
engagement fixed at entry, spend progress re-checked at Day 10/15/20/25).
Real gap, left undocumented nowhere — now written up as a known
limitation in the Node Reference, not implemented, since building it
would mean inventing snapshotting infrastructure this app doesn't have
and was explicitly told not to add.

**Documented, not assumed — two attribute-mapping questions this
codebase cannot answer on its own.** `ELIGIBILITY_META` (the only
definition of `Milestone Progress %` and `Engagement Tier` anywhere in
this repo) carries just a name, UI input type, and options — no
computation logic or data dictionary backs "progress toward the
milestone, as a %" or "classified from the previous month's spend."
Likewise nothing ties `Engagement Tier = Dormant` / `Account Status =
Dormant` to "hasn't transacted in 3+ months," and there's no "time since
last transaction" attribute to express that directly. Both flagged
explicitly in the Node Reference as unverified assumptions rather than
silently treated as confirmed — this app has no backend to check them
against.

Verified throughout: `tsc --noEmit` clean, unit tests (75/75), e2e tests
(26/26, unchanged — no existing coverage touched this), clean production
build, and live Playwright verification of both fixes (multi-outcome
picker selecting HARD_BOUNCE + SOFT_BOUNCE → canvas shows "Previous
step: 2 outcomes?"; Goal Check's label updating live after a Goal edit).
Node Reference artifact updated to reflect all of the above, including a
new "Known limitations" section.

## 2026-10-09 — Transaction history condition (the proposed capability, now built)

Implemented the "Transaction history" condition source the Node Reference
had been documenting as a proposed capability — the gap blocking both
halves of Dormant Reactivation (entry eligibility and the post-entry
Goal). Builder-only, same honesty scope as everything else here: this
lets someone accurately express "no/any qualifying transaction in the
last N days," it does not make the builder evaluate real transaction
history — nothing here runs.

**New shared type**, `DripTxnHistoryCriteria` in `graphTypes.ts` —
`{ filters: DripGoalCondition[]; lookbackDuration: number; lookbackUnit:
'days'|'hours'; existence: 'exists'|'none' }` — one shape, two entry
points, so neither can drift from the other.

**New shared component**, `TxnHistoryFields.tsx` — reuses the existing
`ConditionRows` against the `Transaction` entity (no duplicate filter
builder), a duration+unit pair matching Pause's own shape, and an
explicit two-option existence select ("At least one matching transaction
exists" / "No matching transaction exists" — never a vague label).

**Condition (SPLIT)**: new `customSource` option "Transaction history",
binary like every other Condition source — deliberately not added to
Branch, which is N-way. Canvas label follows the same collapse
convention as every other Condition source: 0-1 filters stay readable
("A transaction (Transaction Status any of APPROVED) in 14 days?"), 2+
collapse to a count ("...matching 2 filters...").

**Entry · Audience**: new optional "Also require transaction history"
toggle-row block, below the existing entity/condition fields, off by
default. AND'd with the existing conditions, not a replacement — the
toggle's own hint text states this explicitly. Existing entity/condition
behavior is completely untouched when the toggle is off.

**Validation**: lookback duration > 0 is the only requirement — filters
are optional (0 filters is a meaningful "any transaction at all, in this
window" question on its own). Entry · Audience's block is only validated
once its toggle is on, mirroring Condition's own optional sources.

**Backward compatibility**: every old saved campaign simply lacks
`txnHistory`/`txnHistoryEnabled` on its nodes' `_config` — both call
sites default defensively (`p.txnHistory ?? dcDefaultTxnHistory()`), and
Entry · Audience's validity check short-circuits on the absent/falsy
`txnHistoryEnabled` flag. No migration needed, same pattern used for
every other optional field added this session (Re-entry, Guardrails,
Goal source, multi-outcome matching).

Verified: `tsc --noEmit` clean, unit tests (82/82, 7 new — source
selection, both existence modes, 1-filter/2+-filter label collapsing,
lookback validation on both entry points, and the explicit backward-
compat case of a config object missing the field entirely), e2e tests
(28/28, 2 new — the full Condition flow through to a real Yes/No canvas
fork, and Entry · Audience's independent toggle + save/reopen
persistence round-trip), clean production build, and live Playwright
screenshots of both UI surfaces.

**Not done, deliberately**: no backend query, event subscription,
polling, transaction ingestion, or runtime suppression of future sends —
none of that exists in this app and none was added. The lookback window
and qualifying-transaction definition remain business decisions, now
genuinely configurable per campaign rather than blocked on a missing
UI capability.

## 2026-10-09 (cont'd) — ConditionsSection hides for unsupported event categories; Journey/Offer Events narrowing gap confirmed against the original prototype

Flagged directly off a real screenshot: Goal Definition (and Entry ·
Event / Wait for Event) showed a dead-end "Conditions (optional)" label
plus "Only Transaction and EMI Events support narrowing by attribute
today" for Journey/Offer/Card Events — a label and a hint pointing at
nothing, for every event category except the two that actually render
`ConditionRows`. `ConditionsSection` (`ConditionRows.tsx`) now returns
`null` outright when no entity resolves, instead of that empty-state
block. `GoalDefinitionStep.tsx`'s wrapping "Goal Conditions" section
label is now also conditional on the same entity check, so it doesn't
hang on screen with nothing under it. `NodeForms.tsx`'s two bare call
sites (Entry · Event, Wait for Event) needed no change — they already
render `ConditionsSection` without an external label wrapper, so a
`null` return cleanly removes the whole block.

**Checked directly against `journeysnudgesemi/emi-conversions-prototype.html`
(the original plain-HTML prototype's "event-based nudges" feature,
not this app) per a direct question**: Journey Events and Offer Events
*do* support condition narrowing there — just via a different mechanism
than Transaction/EMI Events, which is why nothing carried over. Journey/
Offer Events use a **single locked attribute per event type**
(`EVENT_ATTR_BY_TYPE`: `Journey Progress`→Status, `Pageload`→Page Name,
`Button Click`→Button Name, `Outcome Issuance`→Outcome Status) with a
free-text operator + value, plus separate category-level scoping fields
shown above it (Journey + Batch for Journey Events; Offer Type + Offer
Name for Offer Events) — never the generic multi-attribute entity-based
`condRow()`/`ConditionRows` builder, which that file reserves
specifically for Transaction/EMI Events ("unlike Journey/Offer Events,
each [Transaction/EMI] genuinely needs multiple independent filterable
attributes... instead of one locked attribute"). None of this — the
locked-attribute map or the scoping fields — exists anywhere in this
port's `sharedConstants.ts`.

**Decision, explicitly confirmed**: hide the dead-end block now (done,
above); treat porting the locked-attribute narrowing pattern for
Journey/Offer Events as a separate, deliberate follow-up, not bundled
into this fix — it touches four call sites (Goal, Entry · Event, Wait
for Event, Condition's "Entry event attribute" source) and introduces a
second condition paradigm alongside the existing entity-based one, not
a one-line change.

Verified: `tsc --noEmit` clean, unit tests (82/82, unaffected — no test
asserted the removed hint text), e2e tests (28/28, unaffected), and live
Playwright screenshots of the Goal step for both Journey Events (block
now fully absent) and Transaction Events (unaffected, `ConditionRows`
plus "+ Add condition" still render exactly as before).

## 2026-10-09 (cont'd) — Entry · Audience: additional entity-scoped filters ("Account = Dormant AND Card = Active")

Direct question, reasoned through before building: why couldn't
Transaction history just be another Entity option, and why couldn't
Entry · Audience combine conditions across more than one entity (e.g.
Account **and** Card) in one audience? Two different answers:

**Transaction history staying separate is correct, not arbitrary.**
Account/Card/Customer conditions are one-row-per-member attribute
matches ("this Account's Status = Dormant"); a transaction isn't 1:1
with a customer that way — it's an existence-over-many-records question
("does a matching transaction exist in the last N days"). Folding it
into the entity+conditions shape would mean the same mechanism quietly
means two different things depending on what you picked — the kind of
confusion already flagged for the Dormant-attribute gap in Known
Limitations. This part of the design holds.

**But only supporting one entity at a time was a real, un-defended gap.**
"Account = Dormant AND Card = Active" is a completely plausible segment
and the data model genuinely couldn't express it — Entry · Audience only
ever had one `entity` + one `conditions[]`. Two redesigns were discussed:
a bigger unified `groups[]` model (every filter, including Transaction
history, becomes one item in one repeatable AND'd list — more correct
long-term, but real migration + UI rebuild), and a smaller one (keep
today's primary `entity`/`conditions` and the existing `txnHistoryEnabled`/
`txnHistory` toggle exactly as they are, just add a repeatable list of
*more* entity-scoped blocks alongside them). User chose the smaller one.

**Implemented**: `DripEntityConditionGroup` (`graphTypes.ts`) — `{entity,
conditions}`, the same shape the primary block already uses. `ENTRY_SEGMENT`'s
default config gained `extraEntityGroups: []` (`defaultConfig.ts`). A new
shared `EntityConditionBlock` component in `NodeForms.tsx` renders one
Entity-select + `ConditionRows` pair — used for both the existing primary
block (unchanged logic, no removal affordance) and each entry in
`extraEntityGroups` (independently removable via the same `.cond-remove`
"✕" convention used for branches/conditions elsewhere). "+ Add another
entity filter" appends a new group (seeded with one blank condition row,
same convention as the primary); each group's own Entity switch clears
its own conditions on change (same stale-value-type fix already applied
to Branch's attribute switch). A hint line states the AND semantics
explicitly: "Every filter here is AND'd together — a customer must match
all of them."

**No new validation** — extra groups are exactly as lenient as the
primary block already was (zero conditions is harmless, not required);
`dcAddFormValid` needed no changes.

**Backward compatibility**: every existing saved campaign simply lacks
`extraEntityGroups` on its `ENTRY_SEGMENT` node's `_config` — read
defensively as `p.extraEntityGroups || []` at the only read site. No
migration, same pattern as every other optional field added this
session.

Verified: `tsc --noEmit` clean, unit tests (85/85, 3 new — default
shape, extra groups surviving `dcConfirmAddNode` untouched and staying
out of canvas meta, and the explicit legacy-config-missing-the-field
case), e2e tests (29/29, 1 new — add a primary Account/Dormant block,
add a second Card/Active block via "+ Add another entity filter", save,
reopen, confirm both survived), clean production build, and live
Playwright screenshots of the exact "Card.Status=Active AND
Account.Status=Dormant" example confirming it holds before and after
save/reopen.

**Left for later, explicitly**: the bigger unified `groups[]` redesign
(which would also let Transaction history itself repeat, e.g. "a deposit
in 30 days AND no withdrawal in 90 days" as two separate groups) remains
on the table as a deliberate follow-up, not bundled into this smaller
fix.

## 2026-10-09 (cont'd) — Journey/Offer Events narrowing, ported: locked-attribute conditions + scoping fields

Ported the locked-attribute mechanism the previous entry documented as a
confirmed gap — Journey/Offer Events can now be narrowed on Goal
Definition, Entry · Event, Wait for Event, and Condition/Branch's "Entry
event attribute" source, the same four places Transaction/EMI Events'
entity-based narrowing already worked.

**New constants, `sharedConstants.ts`**, all sourced directly from
`journeysnudgesemi/emi-conversions-prototype.html`'s separate
event-based-nudges feature (its `EVENT_TRIGGER` step), not this app's own
original Drip Campaigns prototype — that one fell back to `condRow()`'s
generic free-text-attribute path for these categories instead (its own
`DC_EVENT_ENTITY` comment: "Journey/Offer/Card Events have no such entity
yet... so they fall back to a plain text attribute name"). The richer
mechanism below is the one confirmed specifically against the
event-based-nudges wizard, per direct instruction to check that feature:
- `EVENT_ATTR_BY_TYPE` — one locked attribute per event type, not a full
  entity attribute set: `Journey Progress`→Status, `Pageload`→Page Name,
  `Button Click`→Button Name, `Outcome Issuance`→Outcome Status.
- `LOCKED_ATTR_OPERATORS` — `Equals · Not Equals · Greater than · Less
  than · Is`, the exact operator list that source uses for this pattern
  (a different, shorter list than the entity-based one).
- `BATCH_OPTIONS` — Journey Events' own scoping select, newly ported
  (`JOURNEY_OPTIONS` was already ported and reused as-is).
- `OFFER_TYPE_OPTIONS` — Offer Events' own scoping select. The real,
  reused constant from elsewhere in the same source file — its
  `EVENT_TRIGGER` step's own inline Offer Type list (`['CVP','Campaign',
  'Merchant']`) is a separate, shorter, inconsistently-named stub that
  was never wired to this constant, so this port uses the real one
  instead of replicating the stub.
- **Offer Name has no real catalog anywhere in that source** — its
  `EVENT_TRIGGER` step hardcodes exactly one example
  (`'Festive EMI Push'`) and nothing else. `IBL_CAMPAIGNS` elsewhere in
  the same file looks adjacent but is unrelated demo-data-generation
  filler for an EMI-conversions analytics table (its own comment: "kept
  realistic-length... so Nudge → Conversion's pagination actually has
  something to page through in the demo"), not a verified list of real
  offer names for this feature. Presenting it as one would have been
  inventing a catalog that was never actually built. Offer Name is a
  free-text field here for that reason, not a constrained select.
- `resolveEntryEventAttrSource(eventCategory, eventType)` — centralizes
  "what does this entry's event actually resolve to" into one function,
  reused by `ConditionsSection`/`SplitForm`/`DecisionSplitForm` so they
  can't resolve it differently. Exactly one of `{entity, lockedAttr}` is
  ever non-null: Transaction/EMI Events resolve a real entity (unchanged,
  existing path); Journey/Offer Events resolve a locked attribute once
  their `eventType` is known; anything else (Card Events, or no
  `eventType` picked yet) resolves neither.

**Card Events confirmed as a genuine gap in the source itself, not just
this port** — checked directly before building anything. The
event-based-nudges `EVENT_TRIGGER` step's own `entityForCat` is a 2-way
ternary (`eventCategory==='Transaction Events' ? 'Transaction' :
'EMI Request'`) with no Card Events branch at all, even though Card
Events is routed into the same code path via its `isNew` flag — a latent
bug in the source, not something to silently copy. This app's own
`DC_EVENT_ENTITY` comment already said as much ("Journey/Offer/Card
Events have no such entity yet"). Card Events still resolves to nothing
on both axes (no entity, no locked attribute) and `ConditionsSection`
still renders nothing for it — unchanged, deliberately.

**Data model**: `DripGoal` (`graphTypes.ts`) gained four optional fields
— `journey?`, `batch?`, `offerType?`, `offerName?` — same pattern as
every other optional addition this session. `ENTRY_EVENT`/`WAIT_UNTIL`'s
default configs (`defaultConfig.ts`) gained the identical four fields on
their own untyped `_config`, blank by default.

**New shared component**, `EventScopingFields.tsx` — one component, three
call sites (Goal Definition, Entry · Event, Wait for Event), so Journey's
Journey+Batch selects and Offer's Offer Type+Offer Name fields can't
drift between them. Renders nothing for any other category.

**`ConditionRows`/`ConditionsSection` extended, not duplicated** — both
gained an optional `lockedAttribute` prop alongside the existing
`entity` prop. When set: the attribute cell renders as a disabled,
pre-filled input instead of a picker or the free-text fallback; operator
options come from `LOCKED_ATTR_OPERATORS`; every row's attribute is
force-set to the current locked value on every edit (`setRow` always
merges `{attribute: lockedAttribute}` into any patch when locked) — the
same "re-sync on every write" fix as the original prototype's own
`d.triggerConditions[0].attribute = lockedAttr` force-overwrite, just
done through the normal `onChange` flow instead of a render-time side
effect, so a row stays correct if `eventType` changes after rows already
exist (Pageload → Button Click relocks "Page Name" rows to "Button
Name" the next time any field on them is touched).

**`entryEventType` threaded alongside `entryEventCategory`** —
`DripBuilder.tsx` gained a parallel `entryEventType` state (same
derivation: read straight from the entry node's own `label`, since an
`ENTRY_EVENT`'s label IS its eventType per `dcRecomputeLabelMeta` — same
reasoning `entryEventCategory` already used reading `meta`, extended
here rather than invented fresh), threaded through `AddEditDrawer.tsx`'s
`NodeForm` to `SplitForm`/`DecisionSplitForm`. Needed because the locked
attribute depends on the specific event type, not just the category —
Journey Events alone has three event types, each locking a different
attribute. `confirmEditNode` doesn't refresh this state (same existing
asymmetry `entryEventCategory` already had — not fixed here, out of
scope for this pass).

**Branch (DECISION_SPLIT)** gets the identical locked-attribute
capability Condition does — same `resolveEntryEventAttrSource`, same
`LOCKED_ATTR_OPERATORS`, same free-text `ValueField` fallback (already
correct for a `null` `attrMeta`, needed no changes). No new Branch-
specific scoping UI — Branch only ever needed the one condition-shaped
piece, not the Journey/Batch/Offer Type/Offer Name selects, which belong
to the Entry/Wait-for-Event node that already fixed those. `p.attribute`
is force-set to the locked value the moment Source is switched to
"Entry event attribute" (inside that select's own `onChange`, mirroring
the original prototype's force-overwrite approach) — `dcAddFormValid`
and `dcRecomputeLabelMeta`'s canvas label both needed zero changes, since
both already read `p.attribute` as the one source of truth and it's now
always correctly populated in this mode.

**Validation**: no new validation logic anywhere. `dcAddFormValid`'s
existing SPLIT fallback (`customConditions.some(c => c.attribute)`)
already covers the locked-attribute case correctly, since every row's
`attribute` is always non-empty once added. Its existing DECISION_SPLIT
check (`attribute` populated + every branch filled in) already covers
Branch's locked-attribute case the same way. ENTRY_EVENT/WAIT_UNTIL's
existing check (`eventType` only) was already correct and untouched —
conditions, locked or otherwise, were never required for those two types.
Scoping fields and locked-attribute conditions are fully optional
everywhere, consistent with every other condition list in this app (0
rows is a meaningful state on its own, same precedent as Transaction
history's own filters).

**Backward compatibility**: every old saved Goal/`ENTRY_EVENT`/
`WAIT_UNTIL` simply lacks `journey`/`batch`/`offerType`/`offerName` —
read defensively (`value.journey || ''`, etc.) everywhere, no migration.

**A real, pre-existing test-infrastructure bug surfaced and fixed along
the way**: `addEntryEvent`'s shared e2e helper (`builder.spec.ts`) and
two inline duplicates of the same pattern (`canvas-layout.spec.ts`,
`app-flow.spec.ts`) all assumed Event Type sits at a fixed select index
(1) inside the Entry · Event drawer. Journey/Offer Events now insert
their own scoping selects between Event Category and Event Type, which
silently shifted that index and broke roughly half the existing e2e
suite on the first full run after this change (not a product
regression — confirmed directly via screenshots that the new select
order is correct) — all three now resolve the right select by its own
field label instead of position, immune to however many fields a
category inserts before it.

Verified: `tsc --noEmit` clean, unit tests (93/93, 11 new — constant/
resolver coverage for every category including the Card Events gap,
Condition and Branch building real graphs off a locked attribute via
`dcConfirmAddNode`, confirmation that `dcAddFormValid` needed zero new
logic for either node type, and backward-compat/optionality checks for
Goal/`ENTRY_EVENT`/`WAIT_UNTIL`), e2e tests (31/31, 3 new — Goal
Definition's full Journey Events flow through save/reopen, Condition off
a Journey Events entry, Branch off an Offer Events entry — plus the
three index-based test fixes above), clean production build, and live
Playwright screenshots of every new surface (Goal's scoping fields and
locked-attribute row, Entry · Event's Offer Type/Offer Name fields, a
real Condition Yes/No fork reading "Outcome Status = Redeemed?", and a
real 2-branch Branch reading "Button Name" with "Apply Now"/"Learn
More"/catch-all).

**Not done, deliberately**: Card Events narrowing was not built — it
isn't real in the source this was ported from either (see above), so
building it here would mean inventing a mechanism from nothing rather
than porting one. No backend validation of which journeys/batches/offer
types/offer names are real in production — these are the same UI-picker
option lists the rest of this app's `ELIGIBILITY_META`/`EVENT_CATEGORIES`
already are, not verified against a live source of truth.

## 2026-10-09 (cont'd) — Transaction becomes a real Entity choice on Entry · Audience, not a separate toggle

The "smaller" multi-entity design from the previous round kept
Transaction-history as a separate toggle, outside the new
`extraEntityGroups` list, on the claim that it couldn't share the
entity+conditions shape at all. Directly challenged, twice, in
conversation — first on "why can't Transaction just be an entity," then
again on "why does it need a different 'kind' even in a unified list."
Both times the honest answer was: it doesn't. Reconsidered from
scratch rather than defended:

- Transaction's own attributes (Transaction Type, Status, Amount, MCC,
  Initiated By) already exist in `ELIGIBILITY_META` and already render
  through the same `ConditionRows` every other entity uses — nothing
  new needed there.
- The only things Transaction needs that Customer/Account/Card don't
  are a lookback window and an existence direction — not a different
  shape, just three more optional fields, meaningful only when
  `entity === 'Transaction'` and silently unused otherwise.

**Implemented**: `DripEntityConditionGroup` (`graphTypes.ts`) gained
`lookbackDuration?`, `lookbackUnit?`, `existence?` — same shape for the
primary block and every `extraEntityGroups` entry. `ENTITY_OPTIONS`
(`NodeForms.tsx`) gained `'Transaction'` as a real fourth choice.
`EntityConditionBlock` renders the usual Entity select + Conditions,
then — only when the chosen entity is `'Transaction'` — a `Filters`
label instead of `Conditions` (same `ConditionRows`, same component,
just relabeled since "filters" reads more naturally for a transaction)
and `TxnLookbackFields` underneath (Lookback duration/unit + Match
exists/none), extracted out of `TxnHistoryFields.tsx` into its own
reusable piece so Condition's existing "Transaction history" source
(a separate, mutually-exclusive `customSource` picker, not a repeatable
list, deliberately untouched this round) keeps working unchanged.

**Retired entirely**: the "Also require transaction history" toggle
row, and `txnHistoryEnabled`/`txnHistory` on `ENTRY_SEGMENT`'s config.
Replaced outright rather than kept alongside, per explicit instruction
— nothing has reached clients or even tech yet, so there was no reason
to carry a deprecated parallel path. No seed campaign used the old
fields, so nothing needed migrating.

**Validation**: `dcAddFormValid`'s `ENTRY_SEGMENT` check now walks the
primary block plus every `extraEntityGroups` entry, requiring a
positive `lookbackDuration` only for whichever ones have
`entity === 'Transaction'` — everything else needs no such check, same
leniency as before.

**What this quietly also fixes**: because the list was already
repeatable, a campaign can now express two independent transaction
checks in one Entry · Audience node (e.g. a deposit in 30 days AND no
withdrawal in 90 days, as two separate `extraEntityGroups` entries,
both with `entity: 'Transaction'`) — the exact gap the "repeat
Transaction-history on its own" option from the previous round would
have solved, now solved for free by the more general fix instead.

Verified: `tsc --noEmit` clean, unit tests (98/98, 3 new — Transaction's
lookback validation on the primary block and independently per extra
group, and persistence of its lookback/existence fields through
`dcConfirmAddNode` while coexisting with another entity in
`extraEntityGroups`), e2e tests (32/32 — the old toggle-specific test
rewritten for the new Entity = Transaction flow, every other test
including the Account+Card multi-entity one unaffected), clean
production build, and a live Playwright screenshot confirming Filters +
Lookback + Match render correctly under Transaction and combine with a
second Account entity block via the existing "+ Add another entity
filter" link.

## 2026-10-10 — Milestone Progress %/Engagement Tier removed outright
(confirmed fabricated); real replacement traced in ironbank-face-main
and built as a new Milestone condition across Entry/Condition/Branch

**Removal, on explicit instruction ("remove made up altogether from
everywhere").** An audit of `ELIGIBILITY_META`'s provenance (prompted by
"how did u get these dropdown values?") traced every Customer/Account/
Card attribute to the real `eligibilityTotalList` in ironbank-face-main's
`smartNudgesConstants.ts` — except two: `Milestone Progress %` and
`Engagement Tier`, added to `Account` earlier purely to give a Spend
Milestone campaign something to branch on, with zero backing in that
constant or anywhere else. Removed from both `ELIGIBILITY_META` copies
(this app's `sharedConstants.ts` and the original
`journeysnudgesemi/emi-conversions-prototype.html` it was ported from),
with every test/doc reference swapped to real attributes instead
(`Transaction Amount`, `Account.Status = Dormant`) rather than left
pointing at something that no longer exists.

**Real replacement, traced directly in ironbank-face-main, not
invented.** User asked "check original ib-face in nudges where this
promotional nudge sits — see what happens when there is a milestone
offer coming in the dropdown." Found: a "Promotional Nudge" scopes its
*entire* User Base eligibility to one `MILESTONE` entity
(`eligibilityTypeList`'s `PROMOTION` case) — not an attribute layered
onto Customer/Account/Card, the *whole* eligibility mechanism for that
nudge type. `createEligibilityComponent.js`'s own Milestone-specific
branches: pick one already-configured milestone benefit live via
`BenefitInput` (`isMilestone:true`), then either an `IS` check
(Completed/Not Completed — picking either auto-sets `value:"100"`,
preserved as-is even though it's arguably a real-app quirk, not
"fixed") or a numeric/percentage comparator from the real 8-value
`deliveryValueListSuperSet` (`GT`/`GTE`/`LT`/`LTE`/`BETWEEN`/`GTE_PCT`/
`LTE_PCT`/`IS`) against that benefit's progress.

**Scope widened twice more by the user, each a real, confirmed fit, not
scope creep**: "this can even come in entry right?" — confirmed yes,
and the *more* canonical placement, since the real form uses Milestone
as the entire Promotional-Nudge eligibility, not an add-on. "It should
be in branch as well na?" — confirmed yes, since the percentage
operators only earn their keep with more than two outcomes (banding
progress into tiers), which only Branch's N-way routing can express.

**Built**: one shared `MilestoneConditionFields`/`MilestoneValueField`
component (`src/wizard/MilestoneFields.tsx`), a new
`DripMilestoneCondition` shape (`graphTypes.ts`:
`{benefitId, operator, value, value2?, statusChoice?}`), a static
illustrative `MILESTONE_BENEFITS` list (4 entries) and the real 8-value
`MILESTONE_OPERATORS` vocabulary (`sharedConstants.ts`) — wired into
three places:
- **Entry · Audience** — `Milestone` as a 5th `entity` option
  (`ENTITY_OPTIONS`), `EntityConditionBlock` branches to
  `MilestoneConditionFields` instead of `ConditionRows` when picked.
  `conditions[]` simply unused for this entity, same "extra optional
  fields, not a different shape" precedent Transaction's own lookback/
  existence already established.
- **Condition (SPLIT)** — `Milestone` as a 5th `customSource`, stored on
  a new `p.milestone` field, same Yes/No shape every other source uses.
- **Branch (DECISION_SPLIT)** — `Milestone` as a 4th `source`: one
  benefit picked once (`milestoneBenefitId`), then each branch
  independently picks its own operator/value against that same benefit
  — the real use case for the percentage operators (e.g. `≤ 25%` →
  "needs a nudge", `25–75` → "on track", `Completed` → "reward now").
  Switching source to Milestone resets every existing branch's operator
  to `IS`, same "stale operator from a different vocabulary" reset the
  Attribute picker already does on a real attribute change.

`dcMilestoneSummary`/`dcDecisionBranchSummary` (`labelMeta.ts`) produce
real canvas labels ("Spend ₹75,000 in first 120 days — Completed?",
"≥ 75%", "25–75"), not raw operator dumps.
`dcMilestoneConditionValid`/`dcAddFormValid` (`defaultConfig.ts`)
require a real benefit + complete value before Add Step enables,
checking both the generic `'Between'` and Milestone's own real
`'BETWEEN'` spelling.

**DRIP-003 (Spend Milestone Rewards) rebuilt** around the real
mechanism: each of its 4 independent checkpoints (Month 1/3/6/12) went
from a flat `Wait → Send → Exit` to `Wait → Condition (Milestone:
Tier-N benefit, Is Completed?) → Yes: Send reward + Exit "Reward
sent"; No: Exit "Milestone not reached"` — verified via real headless-
Chrome interaction (canvas labels render correctly for all 4 tiers, the
edit drawer correctly pre-fills Source/Benefit/Condition/Value for the
Tier 1 node).

**Verified**: `tsc --noEmit` clean, unit tests (107/107, 9 new — SPLIT's
Milestone validity/Yes-No-pair/summary across operators, DECISION_SPLIT's
benefit requirement/BETWEEN-spelling/real edge labels, ENTRY_SEGMENT's
per-block Milestone validity including inside `extraEntityGroups`), e2e
tests (35/35, 3 new — Condition's Milestone source incl. the operator-
switch value-widget change, Entry · Audience's Milestone-entity
Add-Step gating, Branch's per-branch Milestone operators), clean
production build.

**Both artifacts updated and republished**: Node Reference gained a new
shared "Milestone condition" section (mirroring the existing
Transaction-history/Locked-attribute condition sections), a Milestone
entity card in Attributes by entity, updated config tables for all
three node types, and the Spend Milestone use-case card rewritten from
"not currently buildable" to describe the real, built solution. Product
Overview's three matching config tables updated in the same simple-
sentence style, no artifact left out of sync.

## 2026-10-11 — Parallel paths: the one campaign shape the builder
couldn't make, found by actually attempting the build

**Prompted by "the seeded data is fine but will we able to replicate it
via the create wizard? hv u ran that test?"** — a fair challenge. The
Milestone work had been verified in isolation (field by field, drawer by
drawer), but never by building DRIP-003's actual *shape* through the UI.
Attempting it found a real wall.

**The audit, widened on request** ("not just drip-003; check all our use
cases so we have the full picture"): all 6 seed campaigns checked
structurally (find every node with >1 outgoing edge whose type isn't a
real split type), plus the 4 real campaign specs. **9 of 10 buildable;
one gap, appearing twice — D. Spend Milestone ≡ DRIP-003, so really one
gap.**

**The gap** (`layoutGraph.ts`): `growSlotIds` was only computed for nodes
with ZERO outgoing edges, so a plain node got one "+" and lost it forever
once used. The multi-edge types (Condition/Branch/Experiment/Goal Check/
Wait for Event) are all *routing* — one customer takes exactly one path.
None did *fan-out* — one customer takes every path, which is what "four
independent checkpoints" means. Convergence wasn't an escape either:
"Connect to an Existing Step" had been deliberately removed during the
React port.

**The finding that set the scope**: the reducer ALREADY supported
fan-out — verified by running three `growLeaf` calls on one node and
getting three correct independent children. Pure UI-affordance gap, not
a data-model one.

**One rule, three readers** (`nodeMeta.ts`: `dcIsRoutingNode` /
`dcCanFanOut`). Derived from node type, never stored per edge, because
three things must never disagree about it: whether the canvas offers
"+ Parallel path", whether an edge's label is inline-editable, and
whether analytics divides arrivals or passes the full count. A stored
flag could drift from the node's actual type; a derived rule can't.

**Built:**
- **"+ Parallel path"** — hover-revealed on any fan-out-capable node that
  *already has* a child (with zero children the ordinary "+" slot is the
  one obvious way to add the first; two controls for one action is just
  noise). Targets the existing `growLeaf`, so zero reducer change.
- **Inline path naming** — new `dcRenameEdge`, click-to-edit on the edge
  chip. Offered only where a node genuinely has >1 path: a lone linear
  connector is already unambiguous. **Caught this one from a
  screenshot** — the first cut put a "+ Name" prompt on nearly every
  connector in the campaign, which was real visual noise, not a
  theoretical worry. Never offered on a routing node: those labels belong
  to its own `branches[]`/fixed Yes-No, and a second owner would mean the
  next drawer save silently overwrote what was typed on canvas.
- **Analytics counting fix** — a real correctness bug this surfaced, and
  one I'd initially missed when calling the change "just a button."
  `dripAnalytics` divided arrivals whenever a node had several children:
  right for routing, wrong for fan-out. Four parallel checkpoints are
  each reached by *everyone* who entered, not a quarter each. Left
  unfixed, every fan-out campaign would have under-reported each path's
  reach by its own path count.

**Verified by building DRIP-003's full shape through the real UI** — all
four tiers via "+ Parallel path", each `Wait → Condition (Milestone) →
Yes: Send + Exit / No: Exit`, then naming all four paths. Result: 21
node cards (exactly matching the hand-authored seed's 21), 0 open
branches, labels exactly `["Month 1","Month 3","Month 6","Month 12"]`
and nothing else on the canvas, zero console errors.

**Tests**: unit 110→112 (fan-out siblings-not-a-chain, `dcRenameEdge`
trimming + sibling isolation, the routing/fan-out rule itself, plus two
analytics tests asserting fan-out paths each carry ~the full count while
a routing node's still sum to its arrivals); e2e 35→37 (the real
"+ Parallel path" flow incl. its absence at zero children, and that a
lone linear connector is never offered a name). Both suites green, clean
build. **Two of my own test assertions were wrong and the tests caught
them** — a Pause's dangling open slot isn't "no outgoing edge," and path
counts must be compared against the entry node's own arrivals, not the
campaign total (the entry holds some back as still-in-sequence).

**Honest limit, documented in both artefacts rather than glossed**: the
data model has no path limit, but the canvas does in practice — four
parallel paths a few steps deep already needs panning at a normal window
size, and much past six would be hard to take in even with zoom and the
minimap. Hit this during verification: the 4th tier's card landed under
the left rail at a 1680px viewport.

**Artefact IA fix, from "didnt we make changes here? we were going to
have multi entiy na"** — `extraEntityGroups[]` *was* documented, just
last in the table, after the recurrence fields, so it read as missing.
Both artefacts' Entry · Audience tables reordered to group all the "who
qualifies" fields together (entity, conditions, milestone, transaction
lookback, extra entity filters) ahead of the "when does it re-run" ones.
Row counts checked before/after (12 and 8) to confirm the reorder lost
nothing. A real lesson: a capability buried at the bottom of a config
table reads as absent, and "it's in there, scroll down" is the wrong
answer.

**Follow-up, same day — the parallel-path labels looked broken.** User
screenshot: two named fan-out paths whose connector lines read as a
severed box rather than a labeled line. Reproduced the exact shape
headlessly and measured rather than guessing from the image — the chips
themselves were fine (96px, correct padding/background), so the chip
wasn't the fault. The real cause was *placement*: a label sat at the
path's geometric midpoint, and because fan-out children are spread wide
apart, a smooth-step path between them has a long horizontal run with
its midpoint right in the middle of it. The chip's opaque fill then cut
the connector in half. Routing labels (Yes/No, branch arms) never showed
this because those are short near-vertical drops, where a chip correctly
reads as sitting *on* the line.

Fixed by anchoring a parallel path's name just above the step it leads
to instead of the midpoint — which also states the truer thing: the name
belongs to the path arriving at that step. Scoped to fan-out labels only
(`anchorToTarget = !!onRename`); routing labels keep the midpoint, so
the long-standing chip-overlap layout tests are unaffected (verified —
all 6 seed campaigns still pass). 112 unit / 37 e2e green, clean build.

**Lesson, consistent with this file's own layout-debugging history:**
"looks broken" in a canvas screenshot is a geometry question, not a
styling one. Measuring the element first ruled out the obvious suspect
(the chip) in one step and pointed straight at where it was positioned.

## 2026-10-12 — Goal Check becomes addable by hand; Condition's "Goal"
source removed. One question, one node type.

**Prompted by two questions on the taxonomy card** ("we have the system
evaluation only as auto-insert; we should hv it in drawer as well? or is
that goal reached is?", then "should we remove goal from condition and hv
it outside? and is 'goal reached' needed then?"). The first answer was
"nothing's missing, Condition's Goal source is the manual route" — true,
but checking the code properly for the second question showed that answer
was papering over a real flaw.

**The flaw, verified in the reducer, not assumed.** The same question —
has the campaign Goal been achieved? — was answerable two ways that built
*different graphs*:
- auto `GOAL_CHECK` (campaignReducer L61-65): creates the check AND wires
  Yes → Goal Reached.
- Condition with `customSource: 'Goal'` (L126-137): creates the check and
  leaves BOTH arms open.
Two node types, two shapes, two canvas appearances, for one question —
decided purely by how it got added. "Goal" was also the odd one out among
Condition's sources: the other five all ask about the customer or the last
message; this one asked about the campaign.

**Decided: remove the source, make the node addable.** Checked first that
nothing depended on it — zero seed campaigns, zero tests used
`customSource: 'Goal'` — so no migration. `GOAL_CHECK` joins the Decisions
group (it forks Yes/No exactly like Condition and Branch; "System
Evaluation" as a category retires, since it's no longer system-only). A
hand-added one builds the identical node and the identical wiring, with
one deliberate difference: it isn't flagged `autoGenerated`, so it carries
no "System step — Customize" badge, which would be nonsense on something
explicitly asked for. Disabled in the picker with a stated reason while no
Goal exists — same shape of gate Goal Reached already had.

**Goal Reached stays, and the reasoning matters**: it isn't a check, it's
the finish line. Goal Check asks; Goal Reached records, and analytics
needs that split (reachedGoal vs exitedWithoutGoal). It also has an
independent use the Goal Check route can't cover — declaring "landing on
this Branch arm *is* success" with no check at all.

**Two real bugs this surfaced, both caught by the tests rather than
inspection:**
1. **A duplicated type list that had silently drifted.** `DripBuilder`
   kept its own hand-maintained `ALL_STEP_TYPES` alongside nodeMeta's
   `DC_STEP_TYPES`. Adding GOAL_CHECK to the shared one did nothing —
   the tile never rendered, because the picker read the local copy.
   Deleted the duplicate and pointed it at `DC_STEP_TYPES`. One list,
   one place.
2. **The Goal Check drawer had no confirm button.** Its footer was
   Close-only, correct back when the node could only ever be *viewed*
   (clicked on an already-inserted one), wrong the moment it could be
   added. Gated on `isEditing` instead of on the type.

**Dead code removed rather than silenced**: `dcAddFormValid`'s `goal`
param, `SplitForm`'s `goal` prop and `NodeForm`'s pass-through all became
genuinely unused once the Goal source went. Deleted the params instead of
underscore-prefixing them — the build's `noUnusedParameters` caught all
three.

**Verified**: 117 unit (5 new — hand-added Goal Check wires Yes→Goal
Reached like the auto one, its question derives live from the Goal, it
isn't flagged autoGenerated, Condition rejects a legacy 'Goal' source,
both types still in the Add Step list), 39 e2e (2 new — the tile is
enabled and builds the right shape with a Goal set, and is present-but-
disabled without one), clean build. Both artefacts updated: taxonomy card,
index table, node card, glossary, and Condition's source list; the
System Evaluation category is gone from both.

**Process note**: my first answer to the first question was "nothing's
missing." It was literally true and still the wrong answer — the
capability existed but via a second mechanism that behaved differently.
Worth remembering that "can the user do X?" and "is there exactly one
coherent way to do X?" are different questions, and only the second one
catches this class of problem.

## 2026-10-12 (cont'd) — One icon per node type, not per category

User, on the Add Step picker: "can we see if we can keep icons unique —
colour scheme can be same for a section." Correct, and it exposed that
the original rule had backfired. `DC_CATEGORY_ICON` gave one glyph per
category on the stated reasoning that per-type icons would be icon
overload (Phase 2 §10) — but inside a category that left the rows
visually identical: Wait and Wait for Event both a clock, Condition and
Branch both the same fork, Entry · Audience and Entry · Event both a
flag. In a picker that lists them as adjacent rows, the glyph carried no
information at all, which is the opposite of restraint.

Replaced with `DC_NODE_ICON`, keyed by node type. Colour still comes from
the category (`.icon-box.{cat}`), so a section still reads as one family
— only the glyph differentiates within it, which is exactly what was
asked for. Send was already the precedent: it had long overridden its
category icon with a per-channel one, so "a more specific glyph where
it's more informative" was the real rule all along.

New glyphs, each chosen for a semantic difference rather than just
looking different: Entry · Audience → `users` (a named group of people)
vs Entry · Event → `flag` (something firing); Wait → `clock` (time
passing) vs Wait for Event → `bolt` (the thing being awaited —
deliberately not a clock variant, since a clock with a small badge is
unreadable at ~13px).

**Caught and fixed my own first attempt before shipping.** Condition and
Branch initially differed only by an extra output dot (2-way vs 3-way) —
semantically honest, but invisible at the size these actually render,
reproducing the very problem being fixed. Redrew them to differ in
overall SHAPE, which survives at 13px: Condition is a two-way Y (a
question with two answers), Branch is a trunk with stacked arms (a list
of routes). Verified by screenshotting the real picker, not by reasoning
about the path data.

Verified: 117 unit, 39 e2e, clean build — no test touched icons, so the
suite passing confirms this changed presentation only.


## The Campaign Designer has moved out — 2026-10-22

The agentic Campaign Designer lived in this folder for a while and does not
any more. It is its own repository:
**https://github.com/amoghpm6298/campaign-designer-ag**, branch
`designer-standalone`, where the designer is the root rather than a
subdirectory. Its history and standing design decisions are in that repo's
`server/CLAUDE.md`.

**Why it left.** Nothing in this builder imported it, and it could not be
deployed with this app in any case: the agent's API is served by a Vite
DEV-SERVER plugin, so the static Vercel build published a designer whose
first message always failed. The only thing tying them together was a build
script that copied one into the other's output.

**What went with it:** `server/`, `src/designer/`, `src/designer-app/`,
`agent-proto/`, `eval/`, `designer.html`, `vite.designer.config.ts`, the
agent docs, and 55 of the 58 unit test files. `src/data/knowledgeShape.ts`
and `src/data/conditionValidation.ts` went too — both existed only so the
agent's server could share them, and nothing here read either one.

**THE ONE THING TO KNOW IF YOU CHANGE THE CAMPAIGN MODEL.** The designer
carries its OWN COPY of this app's reducer, canvas, node drawer and campaign
types — about 4,900 lines across 26 files — because it builds campaigns
through `dcConfirmAddNode` and draws them with `DripCanvas`. That was a
deliberate choice (2026-10-22) over a shared dependency, on the grounds that
this builder has been stable since 12 October while all the work has been on
the agent. The cost is real and is stated rather than hidden: **a change to
`campaignReducer`, `graphTypes`, `sharedConstants`, `nodeMeta`,
`defaultConfig`, `idGen`, `DripCanvas` or `AddEditDrawer` here does not reach
the designer.** If this builder starts moving again, that copy has to be
reconciled, or the designer's central claim — that it produces the same kind
of object a person would build by hand — stops being true.

## 2026-10-23 — One filter row everywhere: what, comparison, value

Entry · Audience, Condition and Branch each used to ask a different
question before you could state a filter. Entry asked for an Entity,
Condition asked for a Source, Branch asked for a Source and then an
Attribute — three controls for one job, and which filters you could reach
depended on which one you picked. All three now take the same row: **what,
comparison, value**, with the "what" coming from one grouped list.

**The list, in order**: Account, Card, Customer, Transactions, Milestone,
then Entry event and Previous message on Condition and Branch only. There
is no Source control and no Entity control left anywhere.

**Transactions, Milestone, Entry event and Previous message are groups in
that list, not a second kind of form.** They keep the questions they always
asked — Transactions is still fields + exists/none + a lookback (its fields
nest under the row they belong to), Milestone is still one benefit and a
progress comparison (the benefit *is* the what, so it stopped being a
separate control), Previous message is still the previous send's outcome
including a fallback channel. Nothing was dropped.

**Four new Account filters**, listed ahead of the six that were already
there: Current OS amount, Current limit, Assigned limit (the sanctioned
limit, deliberately *not* the unused limit, named in full so the picker
can't blur them), and Utilization. `AttrMeta` gained `unit`, which only
affects display: `20000` is stored and reads as `₹20,000`, `70` reads as
`70%`.

**Comparison wording is now one vocabulary.** Numbers get is / is more than
/ is at least / is less than / is at most / is between. Everything else is
lowercased to match, so a row reads as a sentence and Review repeats it
word for word. Milestone keeps its real operator codes (IS/GT/GTE_PCT/…
from the real Promotional Nudge form) and only borrows the wording; the two
percent codes are told apart by a "(%)" marker in the dropdown and by the
percent sign on the value.

**Three questions were genuinely ambiguous in the brief and were asked
rather than guessed**, because each would have meant hours of rework:
1. *Branch.* It routes N ways on one question, so "add more rows, all AND'd"
   does not fit it. Decided: Branch shares **one** row's what across its
   arms, and each arm keeps its own comparison and value. Entry and
   Condition keep the repeatable AND'd list.
2. *Entry event attribute.* The group list did not include it, but the brief
   also said not to drop any existing filter. Decided: it becomes a sixth
   group, after Milestone and before Previous message, and appears only when
   entry is an Event Trigger and that event resolves something (Card Events
   still resolve neither, so the group is absent rather than empty).
3. *Wording.* The operator list said "is greater than or equal to" while an
   example sentence said "is at least". Decided: "is at least" / "is at
   most", in the dropdown and in Review both, so the two never diverge.

**Nothing migrates on disk.** `dcFiltersOf` reads the new shape when there
is one and the old entity blocks / sources when there isn't, so an untouched
campaign opens with its filters already listed as rows and only writes the
new shape once saved. Old operator spellings map through `LEGACY_OPERATORS`,
so a saved "Greater than or equal to" still reads "is at least". The six
seed campaigns are all still on the old shape and are covered by a test that
walks every seeded node and asserts each sentence is real.

**Validation changed on purpose.** An incomplete row is ignored: it reaches
no sentence, no canvas label and no Review, and it does not block saving,
because a half-typed row is a normal intermediate state. Entry · Audience
therefore never blocks at all — an audience with no filters targets
everyone, which is a real answer. Condition still needs one complete row,
since a Yes/No fork that checks nothing is meaningless. Branch needs a what
plus a complete comparison on every arm, checked by the *same*
`dcFilterRowComplete` an Entry row is checked by, so the two cannot drift.

**Four near-duplicate branch renderers collapsed into one.** Decision Split
had a separate block for Previous-step-outcome, locked-attribute, Milestone
and entity-attribute sources, each re-implementing label + operator + value +
insert + catch-all. One shared what plus one arm list replaced all four, and
`dcMilestoneConditionValid` went with them — Milestone completeness is now
the same rule every other row uses.

**Review and the saved campaign both read the filters back**, one sentence
per filter in the order added, from one shared `FilterReadback`. Review had
never shown conditions at all before this.

**A real React bug caught before it shipped**: the comparison cell
auto-filled a single-option vocabulary by calling `onPatch` *during render*,
which is a side effect in render and an infinite-loop risk. Moved to the
pick handler.

**A verification note worth keeping**: `npx tsc --noEmit` checks nothing in
this repo. The root `tsconfig.json` is solution-style with `files: []`, so
the command exits clean no matter what is broken. The real check is
`tsc -b` (what `npm run build` runs) or `tsc -p tsconfig.app.json --noEmit`.
Several "clean" typechecks early in this round were meaningless because of
it.

Verified: 133 unit (119 → 133, a new `filters.test.ts` covering group order
and placement, the four money filters leading Account, the comparison
vocabulary, unit formatting, the spec's own example sentences, incomplete
rows being ignored, and legacy configs for all three node types), 40 e2e
(10 rewritten for the new UI plus a new walkthrough of the brief's own
verification steps: two Account money filters on entry, the same one on a
Condition, Card/Customer/Previous-message present there, Previous message
absent on Entry, and both sentences read back on Review after save and
reopen), clean production build.

## 2026-10-23 (cont'd) — The milestone filter was wrong: it is an offer plus
a threshold, not a named spend ladder

The four benefits behind the Milestone filter — "Spend ₹25,000 in first 30
days" and three like it — were invented. They baked a target amount and a
day count into the *name*, which is the offer's own configuration, not its
identity. Removed outright, not renamed.

**What a milestone filter actually is**: an offer the program already has,
then a threshold the manager types.
- **Offer** — `MILESTONE_OFFERS`, one place, standing in for whatever the
  program has configured. Names carry no amount and no day count. The list
  is legitimately empty for a program with none, and the picker omits the
  group entirely in that case rather than being filled with an invented
  rule — an empty group reads as a dead end.
- **Comparison** — the same words as every other number filter: is more
  than, is at least, is less than, is at most, is between. No bare "is":
  progress is a threshold question.
- **Progress** — a number the manager types, as a **percent by default**,
  switchable to a rupee amount on the same row. "Is at least 100%" is how
  completed is expressed, so the Completed / Not Completed dropdown is
  gone, and with it `statusChoice`, `MILESTONE_OPERATORS`' eight codes,
  `MilestoneFields.tsx` and `dcDefaultMilestone`.

**Old campaigns open with the offer cleared, never remapped.** A saved
filter pointing at one of the four removed benefits keeps the threshold the
manager typed and loses only the offer, so they pick a real one. Silently
mapping those names onto a different offer would quietly change who the
campaign targets. The same rule applies on Branch, where one remapped offer
would redirect every arm. The old operator codes do map (GTE → is at least,
GTE_PCT → is at least, and so on) since those are the same questions in new
words; `IS` resolves to **no** comparison rather than a guessed threshold,
because the question it asked no longer exists.

The six seed campaigns all still carry the old benefits, so DRIP-003's
milestone checks now open with their offers cleared. That is the intended
behaviour and is what the seed test asserts: no sentence anywhere still
reads "Spend ₹…".

**On a Branch** the offer is chosen once and each arm carries its own
comparison and value, plus the catch-all — the shared-what shape from the
previous round, unchanged. Edge chips shorten to `≥ 80%` / `< 40%`, with the
unit following whichever the arm is set to.

Verified: 131 unit (the milestone block rewritten: the invented names are
absent from the offer list, a removed benefit clears on both Condition and
Branch, the old Completed choice resolves to no comparison, percent is the
default and rupees reads as ₹, is between needs both bounds and carries the
unit on each, a row with no offer is ignored, and a two-arm Branch against
one offer), 40 e2e (the three milestone specs rewritten to pick a real
offer, set 80%, switch to a rupee amount, and route two arms at ≥ 80% and
< 40%), clean build.

## 2026-10-23 (cont'd) — App activity: something the customer did, or did
not do, in the app

A sixth group on the same filter row, not a new source control. A row reads
as one sentence: "Verify OTP happened in the last 1 day", or with a detail
filled in, "Offer clicked, Welcome Offer, happened in the last 7 days".

**The event control is a search, not a dropdown.** Forty seeded events
across Authentication, Cards, Payments and Offers make that obvious rather
than theoretical. Each entry keeps the RAW name the app fires and a short
label a manager reads; the search matches **both**, and the closed field
shows **only** the label. New `SearchSelect` component — built rather than
reusing `MultiSelectDropdown`, which is a checkbox list with no search and
the wrong shape for "pick one out of forty", though it borrows its chrome so
the two read as one family.

**Session id, account id, customer id, card id and the raw timestamps are
absent on purpose.** They identify an occurrence; nobody filters on them, so
they are not events and not details either. A test asserts none of them ever
appears as a detail kind.

**Details follow the event.** `details` on an event lists only what it
actually carries — Offer clicked has Offer, Verify OTP and Enter OTP have
none and show no extra field. A detail left empty means any value, so the
offer list carries an explicit "Any offer" entry rather than leaving blank
ambiguous. Changing the event drops any detail the new one does not have
(`dcDetailsForEvent`), so a value can never leak under a question that no
longer asks it.

**Offers are their own short stand-in list** (`PROGRAM_OFFERS`), names only,
no amounts and no day counts. Deliberately NOT the removed spend ladder, and
separate from `MILESTONE_OFFERS`, which is a different thing.

**Direction and window are both the manager's.** happened / did not happen,
and a whole number of days typed, defaulting to 7 on a new row but fixed at
nothing.

**On a Branch the event is chosen once** and each arm sets its own
direction, window and details — so two arms can name two different offers
against the one event. Arms start blank, the same as every other group's
arms, which is why an arm's direction has to be picked rather than assumed.

**Changing the program clears an event the new program does not emit**
(`dcPruneGraphForEvents`). The ROW stays, with its direction and window
intact and its event blank, because those were real choices and a row
visibly waiting to be re-picked beats one that silently vanished. Lives in
`reducer/programChange.ts` rather than `data/filters.ts` because it also
recomputes the affected node's canvas label, and labelMeta already depends
on filters — putting it in filters would have made that circular.

**Honest limit worth stating**: the stand-in catalogue is the same for every
program, so `dcAppEventsForPrograms` currently returns the whole list
whatever is passed. The clearing rule is real and wired to the program
picker, and is unit-tested against an explicitly restricted event set, but
it cannot fire from the UI until real per-program events exist. That one
function is the single place to narrow when they do.

Verified live, 0 console errors: 40 events listed, typing "otp" narrows to
four and shows short labels only, searching the raw name
("Authentication Transaction Success") finds Continue after OTP, Verify OTP
shows no Offer field and Offer clicked does, and the entry filter reads back
as "Offer clicked, Welcome Offer, happened in the last 7 days" on Review
both before and after save/reopen. 140 unit (9 new), 42 e2e (2 new: the
search/details/round-trip walkthrough and the two-arm Branch), clean build.

## 2026-10-23 (cont'd) — Campaign words on Account and Card, a Card controls
group, and a real Card Events list

**Names are the campaign's, not the column's.** Current OS amount, Current
limit, Assigned limit and Utilization stay exactly as they are, with what
each one means written down beside it: amount owed now, the limit in force
now, the sanctioned limit, and current outstanding over current limit as a
whole percent. Current limit is a separate filter from Assigned limit and
from Total Account Balance, which is not here at all. A current limit of 0
matches nothing — there is no percentage of zero. The prototype computes
none of this.

**Added**: Interest as a rupee amount, and eSign completed / eNACH completed
as yes or no, where Yes means the stored status is success.

**Yes/no filters read Yes and No**, on the row and on Review. Rather than a
new type, `bool` itself now renders that way, so every existing yes/no field
on Card gained it too. A campaign saved when these stored `true`/`false`
still reads correctly — the formatter maps them. Two-valued fields offer one
comparison, because "is not Yes" is just "is No" and offering both is a
choice with nothing behind it.

**Card keeps everything it had** and gains Hotlisted, Hotlist reason (a
choice, Damaged, compared with is and is not), First transaction done, First
purchase done, First repayment done, PIN set and Primary card.

**New Card controls group**, sitting next to Card because it is the same
card. Four channels — Domestic chip, contactless, online, card swipe — each
with the channel itself and its three limits. One row is one channel and one
thing about it: `Domestic online is turned on`, or `Domestic online daily
limit is ₹10,000`. The channel's own on/off is its own row; a limit row only
matches when that limit is turned on. The amount already spent against a
limit is deliberately absent — nobody filters on it. The `onoff` type exists
so the row reads as a sentence instead of "... is Yes".

**Card Events replaced.** Card Issued / Card Activated / Card Loaded / Card
Inactive are gone; ten real ones take their place. Two of them carry
details: Card hotlisted a reason, Card control updated a channel, what
changed, and a rupee amount when what changed is a limit. They read as one
sentence — "Card hotlisted, Damaged", "Card control updated, Domestic
online, turned on", "Card control updated, Domestic online, daily limit
₹10,000". An empty detail means any value and is simply absent from the
sentence.

The detail sets are registered **into `ELIGIBILITY_META` keyed by the event
name**, so every existing attribute path works on them unchanged — the
condition rows, the value widgets, and the Entry event group on Condition
and Branch, which now offers exactly that event's details and nothing else.
A card event with no details resolves nothing and the group stays hidden, as
it always did for Card Events.

**Removed event names clear rather than repoint.** `dcValidEventType` reads
a stored type that its category no longer lists as unset, which is what
blanks the four old names anywhere they were saved while leaving the row in
place. Nothing is pointed at a substitute: Card Loaded and Card Inactive
have no successor and get none. The two sample campaigns that entered on
Card Issued and completed on Card Activated were hand-edited in the seed
data to Virtual card issued and Virtual card activated, which is the one
place a rename was intended.

Verified live, 0 console errors: the Event Type list is exactly the ten new
names with none of the four old ones; PIN set shows no detail block and Card
control updated does; two entry filters read back as "Domestic online is
turned on" and "Domestic online daily limit is ₹10,000"; a Card control
updated entry reads "Card control updated, Domestic online, turned on" on
canvas before and after save/reopen; and the Card Activation Reminder sample
opens on Virtual card issued with the goal Virtual card activated. 153 unit
(13 new), 45 e2e (3 new), clean build. App activity untouched.

## 2026-10-23 (cont'd) — The Campaign Designer's residue removed from the app

`200175e` moved the Campaign Designer out to its own repo, but a few things
it had added to files the manual builder shares survived the removal:

- `DripAgentMessaging` in `graphTypes.ts`
- `AgentMessagingPanel` and its mount at the bottom of the Send form
- `.agent-msg` / `.agent-msg-dl` in `index.css`
- a carry-forward exception in `dcConfirmEditNode` that preserved
  `agentMessaging` across an edit, which existed only to stop that panel
  being wiped
- two comments explaining a rule by what the agent's capability tool needed

All gone. The reducer's rule is back to the simple one it should be: the
form owns every field it renders, its config replaces the old one wholesale,
and a stale value no form owns is a bug rather than a feature. These are
different products and the app should carry nothing of the other one.

Left alone: two mentions of the *propensity* agent in `tokens.css`, which
are about where this app's visual design came from, not the Campaign
Designer.

Verified: 153 unit, 45 e2e, clean build — nothing referenced any of it.

## 2026-10-27 — The entry event stops being a filter, and a milestone offer
is searched rather than listed

**The Entry event group is gone from Condition and Branch.** The event and
its details belong to the entry step, where the manager says who starts; a
later condition or branch does not ask about that same event again. Removing
the group took the whole prop chain with it — `entryEventCategory` and
`entryEventType` threaded from `DripBuilder` through `AddEditDrawer` into
both forms, and `FilterContext` itself, which existed only to carry them.
`resolveEntryEventAttrSource` stays: Entry · Event, the Goal and Wait for
Event still use it to render their own condition rows and card-event
details. It just no longer feeds a filter menu.

**A saved row that was an Entry event filter opens with its what cleared and
stays in place**, keeping whatever comparison and value were typed. Three
paths needed it: a stored `filters` row carrying the retired group, the
legacy `customSource: 'Entry event attribute'` on a Condition, and the
legacy `source` on a Branch, where the arms stay and only the shared what
clears. Nothing is repointed at another group.

**The milestone offer is a search.** Fifty seeded offers make a dropdown
unscannable, so the menu carries one Milestone choice and the offer is
picked by typing — the same shape the app event already uses, with the
offer sitting in the row's own block and the comparison and typed threshold
staying on the row. An empty result says "No offer matches that."; the
closed field shows the offer name and nothing else; and with no offers
configured the Milestone choice is omitted entirely.

Names carry no amount and no day count, asserted by a test rather than
trusted — the check is for digits and for "N days", not the substring
"day", because Birthday Spend Milestone is a legitimate name. Welcome
Milestone, Quarterly Spend Milestone and Annual Fee Waiver Milestone are
kept among the fifty.

A saved offer no longer in the list already cleared the offer and kept the
threshold, from the round that removed the invented spend ladder; that rule
now covers fifty names instead of three. On a Branch the offer is chosen
once by the same search, and each arm keeps its own threshold.

Verified live, 0 console errors: a Condition's what menu lists Account,
Card, Card controls, Customer, Transactions, Milestone, App activity and
Previous message — no Entry event — with exactly one Milestone entry; the
offer search lists 50 and narrows to one on "welcome"; a nonsense query says
no offer matches; the closed field reads "Welcome Milestone"; and Review
reads "Welcome Milestone is at least 100%" before and after save and reopen.
152 unit, 45 e2e, clean build. App activity and the campaign view untouched.

## 2026-10-27 (cont'd) — The campaign view rebuilt: three tabs, a read-only
step panel, and the journey as the funnel

**Three tabs, always.** Basic Details, Campaign, Analytics. Analytics used
to be hidden on a campaign that had never run, which reads as a missing
feature rather than an empty one; it is now always there and says plainly
that the campaign hasn't run yet.

**Basic Details** is the setup read back: name and description, issuer and
whether it applies to all programs or the chosen ones, the control group,
re-entry (not allowed, or allowed after the cool-off that was set), start
and end — or that it starts once approved — the goal, and the two
guardrails, each on or off with the note that they are checked at every step
and a match skips the rest of the journey. When neither is on it says no
exclusion lists are applied.

**Campaign** is the journey, and clicking a step opens it read-only in a
panel beside it. It does not start a new version and does not open the
editor: looking at a live campaign is not the same act as changing one. The
panel is one component shared with Analytics, so the two cannot describe the
same step differently.

**Analytics keeps the journey as the funnel.** Each step carries one count —
how many reached it — and a wait adds how many of those are still sitting
there. A step that divides people writes the split on its arrows and nowhere
else, as a plain count beside the arm's own name ("No 11,344", "Yes 1,333").
A straight arrow carries nothing, because there is no split to describe, and
neither do the arms of a fan-out, where everyone follows every arm and the
full count already sits on each step. The old `23% · 8.4k` edge label is
gone.

Two totals above it: entered with held-back beside it, and the messaged
group's goal result beside the held-back group's. The held-back figure is
illustrative, from the same seeded sequence, at 45-70% of the messaged rate
and floored so it can never tie. The conversion-rate and still-in-sequence
tiles are gone.

**Clicking an arrow follows that path** — everything off it fades to 0.3, and
a short list reads the path from the start, through the chosen arrow, to
where it ends, with each count. It stops at the next fork, where the arrow
stops saying where anyone went. "Whole journey" brings the rest back.

**Two real bugs this surfaced, both only findable in a real browser:**

1. **A read-only card could not be clicked at all.** React Flow drops
   pointer-events on nodes it considers non-selectable, and
   `elementsSelectable` was tied to `editable`. Every click went to the pane
   behind the card. This repo's own notes already listed that gotcha as one
   only real-DOM tests catch, and it caught it again.
2. **The journey opened with its start off-screen.** A zoom floor stopped the
   words disappearing on a long campaign, but `fitView` still CENTRES what
   does not fit, which pushed the first card above the frame. Measured
   rather than guessed: when the content is taller than the frame, the view
   anchors to the top instead. The start card now sits 25px inside the frame
   at 13px type.

**One thing the brief asked for that the app cannot show.** "Open a draft and
confirm Analytics says there is nothing to show yet" — a draft row opens the
*builder*, not the view, which is how a campaign is edited and was out of
scope to change. The never-run state is reachable and verified on a campaign
that does open the view: either PENDING_REVIEW campaign. Flagged rather than
quietly changing navigation to make the check pass.

Verified live on Card Activation Reminder, 0 console errors: three tabs; the
goal, the 10% control group and the guardrail line on Basic Details; a
send's channel, account, template and timing in the panel on Campaign;
Entered 14,323 / held back 1,592 and Reached the goal 5,446 / held back 323
on Analytics; no "%" on any arrow; the No arrow fading the rest and listing
the wait and the next reminder; and "Whole journey" restoring it. 162 unit
(10 new, including the fan-out arm rule the one fan-out campaign is a draft
and cannot demonstrate), 48 e2e (4 new), clean build.

**Four existing e2e tests had to change, and one of them was passing
vacuously.** Three asserted the old view — an Analytics tab absent on a
draft, KPI tiles, the canvas on landing — and were rewritten for the new
one. The fourth is the real lesson: the branch-label overlap regression
tests click a campaign row and measure chip positions, and once the view
landed on Basic Details there were zero chips to measure, so "no two chips
overlap" passed with nothing on screen. They now open the Campaign tab
first, except for the DRAFT row, which goes straight to the builder and has
no tabs at all.

**And one regression I introduced, caught by those same tests**: the inline
`opacity: 1` I put on every edge label to support fading beat
`.dc-branch-label-bare`'s own rule, which is what keeps an unlabeled builder
connector invisible until hover. The inline value is now set only when the
label is actually dimmed.
