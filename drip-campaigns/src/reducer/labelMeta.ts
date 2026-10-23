// Ported from journeysnudgesemi/emi-conversions-prototype.html
// (dcCondSummary, dcDecisionBranchSummary, dcGoalLabel, dcOrdinal,
// dcRecurrenceLabel, dcRecomputeLabelMeta).
import type { DripGoal, DripGoalCondition, DripTxnHistoryCriteria } from '../data/graphTypes';
import type { DcNodeType } from '../data/nodeMeta';
import { TXN_NONE, appEventLabel, dcCardEventPhrase, dcNormalizeOperator, dcValidEventType, milestoneOfferName } from '../data/sharedConstants';
import { dcAppDetailPhrase, dcBranchWhatOf, dcCompleteFilters, dcFilterSentence, dcFiltersOf, dcMilestoneValue } from '../data/filters';

// Short readable summary of a condition array for a node's meta line —
// "Amount = 2000, MCC = 5411" rather than making a reviewer open the
// drawer again to see what was actually configured. Handles both a plain
// scalar .value and a .values array (multiSelect) — without the latter, a
// Split whose only condition is a multiSelect attribute would silently
// summarize to an empty string, since .value is never set on those rows.
export function dcCondSummary(conditions: DripGoalCondition[] | undefined): string {
  return (conditions || [])
    .filter((c) => c.attribute && ((c.values && c.values.length) || c.value))
    .map((c) => {
      if (c.values && c.values.length) return `${c.attribute} any of ${c.values.join('/')}`;
      if (c.operator === 'Between') return `${c.attribute} between ${c.value} and ${c.value2 || '?'}`;
      return `${c.attribute} ${c.operator === 'Not Equals' ? '≠' : c.operator === 'Equals' ? '=' : c.operator || '='} ${c.value}`;
    })
    .join(', ');
}

// Readable canvas summary for a transaction-history condition — same
// collapse convention as dcCondSummary: 0 or 1 filters stay readable,
// 2+ collapse to a count so the card never grows to fit raw filter
// expressions.
export function dcTxnHistorySummary(t: DripTxnHistoryCriteria | undefined): string {
  if (!t) return 'Transaction history';
  const verb = t.existence === 'none' ? 'No transaction' : 'A transaction';
  const filters = (t.filters || []).filter((c) => c.attribute);
  const filterText = filters.length === 1 ? ` (${dcCondSummary(filters)})` : filters.length > 1 ? ` matching ${filters.length} filters` : '';
  return `${verb}${filterText} in ${t.lookbackDuration ?? '?'} ${t.lookbackUnit ?? 'days'}`;
}

export interface DecisionBranch {
  id?: string;
  label: string;
  operator: string;
  value?: string;
  value2?: string;
  values?: string[];
  // Milestone arms only: whether the typed progress is a percent or a
  // rupee amount.
  valueUnit?: 'percent' | 'rupees';
  // App activity arms only: that event's details, for this arm.
  details?: Record<string, string>;
}
export interface DecisionSplitConfig {
  what?: { group: string; field: string };
  branches: DecisionBranch[];
  // Read by dcBranchWhatOf for campaigns saved before the one-row rewrite.
  source?: string;
  attribute?: string;
  milestoneBenefitId?: string;
}

// "Previous step outcome" moved from a single exact-match value to a set
// (any selected status qualifies) — this derives the effective selection
// from either shape, so an old saved journey with only the singular
// value/outcome field still behaves exactly as it did (a set of one).
export function dcSelectedMulti(single: string | undefined, multi: string[] | undefined): string[] {
  if (multi && multi.length) return multi;
  return single ? [single] : [];
}

// Short readable summary of one Decision Split branch's own condition —
// used both for its edge's branchLabel on the canvas and the node's own
// meta line. "Previous step outcome" branches have no operator concept
// (always a status-set match), everything else mirrors dcCondSummary's
// operator formatting.
export function dcDecisionBranchSummary(p: DecisionSplitConfig, b: DecisionBranch): string {
  const what = dcBranchWhatOf(p);
  if (what.group === 'Previous message') {
    const sel = dcSelectedMulti(b.value, b.values);
    return sel.length === 0 ? '(unset)' : sel.length === 1 ? sel[0] : `${sel.length} outcomes`;
  }
  if (what.group === 'Milestone') {
    const v = (x: string | undefined) => dcMilestoneValue(x, b.valueUnit) || '?';
    if (b.operator === 'is between') return `${v(b.value)}–${v(b.value2)}`;
    const symbol: Record<string, string> = { 'is more than': '>', 'is at least': '≥', 'is less than': '<', 'is at most': '≤' };
    return `${symbol[b.operator] || b.operator || ''} ${v(b.value)}`.trim();
  }
  if (what.group === 'Transactions') return b.operator === TXN_NONE ? 'none' : 'exists';
  if (what.group === 'App activity') {
    // The event is already the node's own label, so an arm chip carries
    // only what differs between arms: its detail, direction and window.
    const detail = dcAppDetailPhrase({ field: what.field, details: b.details });
    const n = Number(b.value || 0);
    return `${detail ? `${detail}, ` : ''}${b.operator || ''} in ${b.value || '?'} ${n === 1 ? 'day' : 'days'}`.trim();
  }
  // An edge chip has no room for a whole sentence, so the comparison is
  // shortened to a symbol. The row and Review still read in full words.
  const op = dcNormalizeOperator(b.operator);
  if (op === 'is between') return `${b.value || '?'}–${b.value2 || '?'}`;
  if (op === 'is more than') return `> ${b.value || '?'}`;
  if (op === 'is at least') return `≥ ${b.value || '?'}`;
  if (op === 'is less than') return `< ${b.value || '?'}`;
  if (op === 'is at most') return `≤ ${b.value || '?'}`;
  if (op === 'is not') return `≠ ${b.value || '?'}`;
  if (op === 'is any of') {
    const sel = dcSelectedMulti(b.value, b.values);
    return sel.length === 0 ? '(unset)' : sel.length === 1 ? sel[0] : `${sel.length} values`;
  }
  return b.value || '(unset)';
}

// Goal used to be a free-text string — no actual event behind it. Now
// {eventCategory, eventType} or null (a milestone campaign legitimately
// has no single shared goal — its checkpoints are independent).
export function dcGoalLabel(g: DripGoal | null | undefined): string | null {
  if (!g || !g.eventType) return null;
  // An event the category no longer lists reads as no goal at all, rather
  // than naming something that does not exist any more.
  const head = dcCardEventPhrase(g.eventType, g.cardDetails) || dcValidEventType(g.eventCategory, g.eventType);
  if (!head) return null;
  const cond = dcCondSummary(g.conditions);
  return cond ? `${head} (${cond})` : head;
}

export function dcOrdinal(n: number | string): string {
  const num = Number(n);
  const s = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

export interface ScheduledEntryConfig {
  recurrenceType: 'Monthly' | 'Weekly' | 'Daily';
  dayOfMonth: string;
  weekInterval: string;
  dayOfWeek: string;
  dayInterval: string;
  timeOfDay: string;
}
export function dcRecurrenceLabel(p: ScheduledEntryConfig): string {
  const base =
    p.recurrenceType === 'Weekly'
      ? `Every ${p.weekInterval} week${Number(p.weekInterval) === 1 ? '' : 's'} on ${p.dayOfWeek}`
      : p.recurrenceType === 'Daily'
        ? `Every ${p.dayInterval} day${Number(p.dayInterval) === 1 ? '' : 's'}`
        : `${p.dayOfMonth === 'last' ? 'Last day' : dcOrdinal(p.dayOfMonth)} of every month`;
  return p.timeOfDay ? `${base} at ${p.timeOfDay}` : base;
}

// Recomputes only label+meta for a node's config — never touches
// children/edges, unlike the add-node flow (which also builds
// auto-children for brand new nodes). Editing must never regenerate a
// subtree; whatever's already built under a node stays exactly as it was.
// `p` is intentionally loosely typed (Record<string, any>) — each node
// type's pendingConfig shape is its own thing, defined in defaultConfig.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Entry · Audience keeps showing only recurrence on the canvas: filters are
// configuration detail, and the canvas is an execution map.
export function dcRecomputeLabelMeta(type: DcNodeType, p: any, goal: DripGoal | null): { label: string; meta: string } {
  if (type === 'ENTRY_SEGMENT') {
    // Canvas-vs-drawer principle: the canvas is an execution map, not a
    // configuration database (node-design refinement pass) — entity and
    // eligibility conditions are real configuration detail, so they stay
    // in the drawer. Recurrence is the one P1 fact worth a glance (does
    // this re-fire on its own, or run once?); a non-repeating segment
    // gets no meta line at all rather than a sentence restating "this is
    // a static snapshot," which the absence of a recurrence line already
    // implies.
    return { label: p.cohortDesc, meta: p.repeat ? dcRecurrenceLabel(p) : '' };
  }
  if (type === 'ENTRY_EVENT') {
    // Conditions are configuration detail (P2, drawer-only) — only the
    // event category (P1) earns a glance on the canvas. A card event's own
    // detail is part of which event this is, so it rides on the label.
    const card = dcCardEventPhrase(p.eventType, p.cardDetails);
    return { label: card || dcValidEventType(p.eventCategory, p.eventType) || 'Event Trigger', meta: p.eventCategory };
  }
  if (type === 'SEND') {
    // meta is deliberately unused for Send's own canvas rendering —
    // channel, template, timing, and fallback each get their own
    // dedicated row with its own icon, derived straight from _config at
    // render time (toFlowElements.ts), not flattened into one string
    // here (node-design refinement pass). Still returned as '' rather
    // than removed from this function's total Record, matching every
    // other node type's shape.
    return { label: p.name, meta: '' };
  }
  if (type === 'PAUSE') return { label: `Wait ${p.duration} ${p.unit}`, meta: '' };
  if (type === 'WAIT_UNTIL') {
    // Event category and conditions are P2/unclassified configuration
    // detail — only the timeout (P1) earns a canvas line alongside the
    // event type itself.
    const card = dcCardEventPhrase(p.eventType, p.cardDetails);
    return { label: card || dcValidEventType(p.eventCategory, p.eventType) || 'Wait for Event', meta: `Timeout after ${p.duration} ${p.unit}` };
  }
  if (type === 'SPLIT') {
    // A Condition has no "Goal reached" basis anymore (Phase 1) — it's
    // always a user-defined question, never a stand-in for the one
    // campaign goal (that's GOAL_CHECK's job, a distinct node type that
    // carries no condition config of its own at all — see below).
    //
    // One complete filter gets to be the label itself, as a real business
    // question. Two or more collapse to a count (Phase 1 §9: counts, not
    // joined expressions), which is the fix for the literal bug a joined
    // multi-condition string produced on canvas.
    const rows = dcCompleteFilters(dcFiltersOf('SPLIT', p));
    if (rows.length === 0) return { label: 'Custom condition', meta: '' };
    if (rows.length === 1) return { label: dcFilterSentence(rows[0]) + '?', meta: '' };
    return { label: 'Custom condition', meta: `${rows.length} filters` };
  }
  if (type === 'DECISION_SPLIT') {
    const what = dcBranchWhatOf(p);
    const label =
      what.group === 'Previous message'
        ? 'Previous message outcome'
        : what.group === 'Milestone'
          ? milestoneOfferName(what.field) || 'Milestone'
          : what.group === 'Transactions'
            ? 'Transactions'
            : what.group === 'App activity'
              ? appEventLabel(what.field) || 'App activity'
              : what.field || 'Branch';
    return { label, meta: `${p.branches.length} branch${p.branches.length === 1 ? '' : 'es'} + catch-all` };
  }
  if (type === 'RANDOM_SPLIT') {
    // Count always; the per-branch allocation only tags along when it's
    // short enough not to become the same "long expression on canvas"
    // problem Phase 1 §9 exists to prevent (a 2-way 50/50 test reads
    // fine inline, a 6-variant test would not).
    const allocation = p.branches.map((b: { label: string; pct: number }) => `${b.label} ${b.pct}%`).join(' / ');
    const countLabel = `${p.branches.length} variant${p.branches.length === 1 ? '' : 's'}`;
    return { label: p.name, meta: allocation.length <= 24 ? `${countLabel} — ${allocation}` : countLabel };
  }
  // GOAL_CHECK carries no `_config` at all (always null) — nothing to
  // recompute FROM, so its question is derived live from the campaign's
  // current Goal every time. That's what makes editing the Goal update
  // every existing Goal Check's label for free, with no second copy of
  // the goal stored on any node.
  if (type === 'GOAL_CHECK') return { label: (dcGoalLabel(goal) || 'Goal') + '?', meta: '' };
  if (type === 'GOAL_EXIT' || type === 'EXIT') return { label: p.reason, meta: '' };
  return { label: '', meta: '' };
}
