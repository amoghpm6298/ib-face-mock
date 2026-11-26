// Ported from journeysnudgesemi/emi-conversions-prototype.html's
// dcPickType (the default pendingConfig per node type) and dcAddFormValid.
import { EVENT_CATEGORIES } from '../data/sharedConstants';
import type { DripGraph, DripTxnHistoryCriteria } from '../data/graphTypes';
import type { DcNodeType } from '../data/nodeMeta';
import type { DcAddingAt } from './campaignReducer';
import { dcNewBranchId } from './idGen';
import { dcBranchWhatOf, dcCompleteFilterGroups, dcFilterRowComplete, dcFilterGroupsOf } from '../data/filters';

// Shared default for Condition's "Transaction history" source and Entry ·
// Audience's own optional block — same starting shape for both, so neither
// entry point drifts from the other. 90 days / "at least one" is a
// reasonable starting point, not a prescribed dormancy threshold — fully
// editable, and the lookback window must stay issuer-configurable.
export function dcDefaultTxnHistory(): DripTxnHistoryCriteria {
  return { filters: [], lookbackDuration: 90, lookbackUnit: 'days', existence: 'exists' };
}

export function dcDefaultConfig(type: DcNodeType): any {
  const map: Record<DcNodeType, unknown> = {
    ENTRY_SEGMENT: {
      // No filters by default: an audience with none targets everyone.
      // Rows are added one at a time and AND'd together.
      cohortDesc: 'All eligible customers', filters: [],
      repeat: false, recurrenceType: 'Monthly', dayOfMonth: '1', weekInterval: '1', dayOfWeek: 'Monday', dayInterval: '1', timeOfDay: '09:00',
    },
    // journey/batch/offerType/offerName: Journey/Offer Events' own
    // scoping, same optional-field pattern as everything else added this
    // session — blank by default, only ever meaningful for those two
    // categories (see EventScopingFields.tsx), absent on every campaign
    // saved before this existed.
    ENTRY_EVENT: { eventCategory: Object.keys(EVENT_CATEGORIES)[0], eventType: '', conditions: [], journey: '', batch: '', offerType: '', offerName: '' },
    // fallbackChannel '' means no fallback configured — a Send is a
    // single-channel message by default. account/templateId are the
    // primary channel's; fallbackAccount/fallbackTemplateId are a
    // separate pair for the fallback channel, since a template is
    // always locked to one channel and can't be shared across both.
    // No delay fields: a gap before a message is a Wait step, which the
    // canvas shows and which stops when the goal is reached. See
    // data/sendTiming.ts.
    SEND: { name: 'Send Message', channel: 'WHATSAPP', account: '', templateId: '', timing: 'Absolute', absTime: '11:00', fallbackChannel: '', fallbackAccount: '', fallbackTemplateId: '' },
    PAUSE: { duration: 2, unit: 'days' },
    WAIT_UNTIL: { eventCategory: Object.keys(EVENT_CATEGORIES)[0], eventType: '', duration: 7, unit: 'days', conditions: [], journey: '', batch: '', offerType: '', offerName: '' },
    // No `basis` field anymore — a Condition is always a user-defined
    // question now (Phase 1: "Goal reached" moved out entirely into the
    // separate GOAL_CHECK node type, which has no config of its own).
    // outcome (singular) kept only for back-compat with journeys saved
    // before multi-outcome matching — new picks always write `outcomes`.
    SPLIT: { filters: [] },
    DECISION_SPLIT: {
      name: 'Decision', what: { group: 'Account', field: '' },
      branches: [
        { id: dcNewBranchId(), label: 'Branch 1', operator: '', value: '', value2: '', values: [] },
        { id: dcNewBranchId(), label: 'Branch 2', operator: '', value: '', value2: '', values: [] },
      ],
    },
    RANDOM_SPLIT: {
      name: 'Channel test',
      branches: [
        { id: dcNewBranchId(), label: 'A', pct: 50 },
        { id: dcNewBranchId(), label: 'B', pct: 50 },
      ],
    },
    // Never actually rendered as an editable form (see NodeForms.tsx's
    // GoalCheckInfo) — exists only so dcDefaultConfig's Record is total
    // over DcNodeType, and so openEditNode has a type-correct fallback.
    GOAL_CHECK: null,
    EXIT: { reason: 'Sequence exhausted' },
  };
  return map[type];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Same rule as the label function: an imported node may carry no config, or
// only part of one. An incomplete node is simply not valid yet — it must
// never throw, because that would block the very drawer the manager needs in
// order to complete it.
export function dcAddFormValid(t: DcNodeType, p: any): boolean {
  p = p || {};
  // A wait with no duration is not a wait. Both of these used to fall
  // through to `true` — Wait For Event checked only its event, and Pause
  // was not checked at all — so a timeout of 0, blank or negative reached
  // the backend contract, meaning either an instant timeout or a run that
  // waits forever. Durations are also stored as strings by the form, so
  // this coerces rather than comparing a string to a number.
  const positiveDuration = Number(p.duration) > 0 && !!p.unit;
  if (t === 'ENTRY_EVENT') return !!p.eventType;
  if (t === 'WAIT_UNTIL') return !!p.eventType && positiveDuration;
  if (t === 'PAUSE') return positiveDuration;
  if (t === 'SEND') {
    if (!(p.account && p.templateId)) return false;
    if (!p.fallbackChannel) return true;
    return p.fallbackChannel !== p.channel && !!(p.fallbackAccount && p.fallbackTemplateId);
  }
  if (t === 'RANDOM_SPLIT') return (p.branches || []).reduce((s: number, b: { pct: number }) => s + Number(b.pct || 0), 0) === 100;
  if (t === 'DECISION_SPLIT') {
    // One shared question, then every arm needs a complete comparison
    // against it. Each arm is checked as a filter row carrying the shared
    // what, so a Branch arm and an Entry filter are judged by the same rule.
    const what = dcBranchWhatOf(p);
    if (what.group !== 'Transactions' && what.group !== 'Previous message' && !what.field) return false;
    return (
      (p.branches || []).length > 0 &&
      (p.branches || []).every((b: any) =>
        dcFilterRowComplete({ ...what, operator: b.operator, value: b.value, value2: b.value2, values: b.values, details: b.details, txn: p.txn })
      )
    );
  }
  // A Condition has to actually check something — otherwise Yes/No is
  // meaningless. One complete filter row is enough; incomplete rows are
  // ignored here exactly as they are on Review.
  // One finished group is enough — the groups are OR'd, so a second,
  // half-typed alternative does not make the first one meaningless.
  if (t === 'SPLIT') return dcCompleteFilterGroups(dcFilterGroupsOf('SPLIT', p)).length > 0;
  // Entry · Audience stays valid with no filters at all: an audience with
  // none targets everyone, which is a real answer. A half-typed row is a
  // normal intermediate state, so it is ignored rather than blocking.
  if (t === 'ENTRY_SEGMENT') return true;
  return true;
}

// Exit's reason has no smart default today, unlike Goal Reached (which
// auto-fills from the campaign Goal's own label) — it's always the same
// generic 'Sequence exhausted' regardless of context. Derives a real
// starting reason from whichever branch this Exit is being added on
// (e.g. a Condition's "New Status = Failed" Yes arm, or a Branch's
// "Failed" arm), so the canvas shows why instead of a placeholder. Still
// freely editable afterward — this only sets the initial value.
export function dcDefaultExitReason(graph: DripGraph, addingAt: DcAddingAt | null): string {
  const fallback = 'Sequence exhausted';
  if (!addingAt || addingAt.kind !== 'edge') return fallback;
  const edge = graph.edges.find((e) => e.id === addingAt.edgeId);
  if (!edge || !edge.branchLabel) return fallback;
  const src = graph.nodes[edge.from];
  if (!src) return fallback;
  const baseLabel = src.label.replace(/\?$/, '');
  return `${baseLabel} — ${edge.branchLabel}`;
}

// The default name for a NEW arm, on an Experiment ('A', 'B', …) and on a
// Branch ('Branch 1', 'Branch 2', …) — the same two vocabularies this
// file's own seeds above use.
//
// Both forms used to derive it from the arm COUNT, which repeats a name as
// soon as any arm has been removed: take A/B/C, remove B, and the next
// "+ Add variant" is C again. Two arms then carry one name, on the canvas
// and on their edge chips, where the name is the only thing telling them
// apart — and the duplicate persists into the saved campaign, since an
// arm's name is what its edge's branchLabel is set from. The count is not
// the question; "which name is still free" is.
function takenLabels(branches: { label?: string }[]): Set<string> {
  return new Set(branches.map((b) => String(b?.label ?? '').trim().toUpperCase()).filter(Boolean));
}

export function dcNextVariantLabel(branches: { label?: string }[]): string {
  const taken = takenLabels(branches);
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    if (!taken.has(letter)) return letter;
  }
  // A 27-variant experiment is not a real thing, but an unlovely name is
  // still better than a duplicate one.
  return `Variant ${branches.length + 1}`;
}

export function dcNextBranchLabel(branches: { label?: string }[]): string {
  const taken = takenLabels(branches);
  // With n arms, one of "Branch 1".."Branch n+1" is always free.
  for (let n = 1; n <= branches.length + 1; n++) {
    if (!taken.has(`BRANCH ${n}`)) return `Branch ${n}`;
  }
  return `Branch ${branches.length + 1}`;
}
