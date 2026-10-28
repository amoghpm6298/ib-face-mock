// Everything that turns a stored config into filter rows, and a filter row
// into a sentence. One module so the drawer, the canvas label and Review can
// never disagree about what a row means.
import type { DripFilterRow, DripGoalCondition, DripTxnHistoryCriteria } from './graphTypes';
import {
  ELIGIBILITY_META,
  MILESTONE_OFFERS,
  appEventById,
  appEventLabel,
  programOfferName,
  TXN_EXISTS,
  TXN_NONE,
  PREV_MESSAGE_FIELD,
  dcFilterAttrMeta,
  dcFormatValue,
  dcNormalizeOperator,
  milestoneOfferName,
  resolveEntryEventAttrSource,
} from './sharedConstants';

export function dcDefaultFilterRow(): DripFilterRow {
  return { group: 'Account', field: '', operator: '' };
}
export function dcDefaultTxnForRow(): DripTxnHistoryCriteria {
  return { filters: [], lookbackDuration: 90, lookbackUnit: 'days', existence: 'exists' };
}

// --- reading stored config -------------------------------------------------
//
// A campaign saved before the rewrite has no `filters`. Rather than migrate
// the stored data in place, the old shape is read into rows on the way out,
// so an untouched campaign keeps working and a saved one writes the new
// shape. Nothing is dropped: every old source and every old entity block has
// a group it maps onto.

function condToRow(group: string, c: DripGoalCondition): DripFilterRow {
  return { group, field: c.attribute || '', operator: dcNormalizeOperator(c.operator), value: c.value, value2: c.value2, values: c.values };
}

function entityGroupToRows(g: any): DripFilterRow[] {
  if (!g) return [];
  if (g.entity === 'Transaction') {
    return [
      {
        group: 'Transactions',
        field: '',
        operator: g.existence === 'none' ? TXN_NONE : TXN_EXISTS,
        txn: {
          filters: g.conditions || [],
          lookbackDuration: g.lookbackDuration ?? 90,
          lookbackUnit: g.lookbackUnit ?? 'days',
          existence: g.existence ?? 'exists',
        },
      },
    ];
  }
  if (g.entity === 'Milestone') return [milestoneRowFrom(g.milestone)];
  return (g.conditions || []).map((c: DripGoalCondition) => condToRow(g.entity, c));
}

// The four invented spend-ladder benefits were removed outright. A campaign
// still pointing at one opens with its offer CLEARED rather than silently
// remapped onto a different offer, which would quietly change who the
// campaign targets. The threshold the manager typed is kept, so only the
// offer has to be picked again.
const LEGACY_MILESTONE_OPS: Record<string, string> = {
  // The Completed / Not Completed choice is gone, so it resolves to no
  // comparison at all rather than to a guessed threshold.
  IS: '',
  GT: 'is more than',
  GTE: 'is at least',
  GTE_PCT: 'is at least',
  LT: 'is less than',
  LTE: 'is at most',
  LTE_PCT: 'is at most',
  BETWEEN: 'is between',
};
function milestoneRowFrom(m: { benefitId?: string; operator?: string; value?: string; value2?: string } | undefined): DripFilterRow {
  const known = m?.benefitId && MILESTONE_OFFERS.some((o) => o.id === m.benefitId);
  // 'IS' was the Completed/Not Completed choice, which no longer exists, so
  // it resolves to no comparison rather than to a guessed threshold.
  const operator = m?.operator ? LEGACY_MILESTONE_OPS[m.operator] ?? m.operator : '';
  return { group: 'Milestone', field: known ? m!.benefitId! : '', operator, value: m?.value, value2: m?.value2, valueUnit: 'percent' };
}

function txnRowFrom(t: DripTxnHistoryCriteria | undefined): DripFilterRow {
  // A legacy config that named this source but stored no criteria is
  // incomplete, not a 90-day default. dcDefaultTxnForRow is for new rows the
  // user adds, where a starting window is helpful.
  const txn = t ?? { filters: [], lookbackDuration: 0, lookbackUnit: 'days' as const, existence: 'exists' as const };
  return { group: 'Transactions', field: '', operator: txn.existence === 'none' ? TXN_NONE : TXN_EXISTS, txn };
}

export function dcFiltersOf(type: string, p: any): DripFilterRow[] {
  if (!p) return [];
  // A row saved under the retired Entry event group opens with its what
  // cleared, left in place to be picked again.
  if (Array.isArray(p.filters)) return p.filters.map((r: DripFilterRow) => (r.group === 'Entry event' ? { ...r, group: '', field: '' } : r));
  if (type === 'ENTRY_SEGMENT') {
    const primary = { entity: p.entity, conditions: p.conditions, lookbackDuration: p.lookbackDuration, lookbackUnit: p.lookbackUnit, existence: p.existence, milestone: p.milestone };
    return [primary, ...(p.extraEntityGroups || [])].flatMap(entityGroupToRows);
  }
  if (type === 'SPLIT') {
    switch (p.customSource) {
      case 'Previous step outcome': {
        const values = p.outcomes && p.outcomes.length ? p.outcomes : p.outcome ? [p.outcome] : [];
        return [{ group: 'Previous message', field: PREV_MESSAGE_FIELD, operator: 'is any of', values }];
      }
      case 'Transaction history':
        return [txnRowFrom(p.txnHistory)];
      case 'Milestone':
        return [milestoneRowFrom(p.milestone)];
      case 'Entry event attribute':
        // The Entry event group is gone: the entry event is settled on the
        // entry step. Such a row opens with its what cleared and stays in
        // place, keeping whatever comparison and value were typed.
        return (p.customConditions || []).map((c: DripGoalCondition) => ({ ...condToRow('Entry event', c), group: '', field: '' }));
      default:
        return (p.customConditions || []).map((c: DripGoalCondition) => condToRow('Account', c));
    }
  }
  return [];
}

// Branch shares one question across its arms, so it reads a single row's
// what rather than a list.
export function dcBranchWhatOf(p: any): { group: string; field: string } {
  if (!p) return { group: 'Account', field: '' };
  if (p.what && p.what.group) return p.what;
  switch (p.source) {
    case 'Previous step outcome':
      return { group: 'Previous message', field: PREV_MESSAGE_FIELD };
    case 'Entry event attribute':
      // Same rule on a Branch: the what clears and the arms stay.
      return { group: '', field: '' };
    case 'Milestone': {
      // Same rule as a Condition row: a removed benefit clears rather than
      // remapping onto a different offer, which would quietly change who
      // every arm routes.
      const known = p.milestoneBenefitId && MILESTONE_OFFERS.some((o) => o.id === p.milestoneBenefitId);
      return { group: 'Milestone', field: known ? p.milestoneBenefitId : '' };
    }
    default:
      return { group: 'Account', field: p.attribute || '' };
  }
}

// --- completeness ----------------------------------------------------------
//
// An incomplete row is simply ignored: it never reaches a sentence, a canvas
// label or Review. It does not block saving, because a half-typed row is a
// normal intermediate state, not an error to shout about.

export function dcFilterRowComplete(row: DripFilterRow | undefined): boolean {
  if (!row || !row.group) return false;
  if (row.group === 'App activity') {
    // Details are optional throughout: an empty one means any value.
    return !!row.field && !!row.operator && Number(row.value) > 0;
  }
  if (row.group === 'Transactions') return !!row.operator && Number(row.txn?.lookbackDuration) > 0;
  if (row.group === 'Previous message') return !!(row.values && row.values.length);
  if (row.group === 'Milestone') {
    if (!row.field || !row.operator) return false;
    return row.operator === 'is between' ? !!row.value && !!row.value2 : !!row.value;
  }
  if (!row.field || !row.operator) return false;
  const meta = dcFilterAttrMeta(row.group, row.field);
  if (meta?.type === 'multiSelect' || meta?.type === 'smartTag') return !!(row.values && row.values.length);
  if (row.operator === 'is between') return !!row.value && !!row.value2;
  return !!row.value;
}

export function dcCompleteFilters(rows: DripFilterRow[] | undefined): DripFilterRow[] {
  return (rows || []).filter((r) => dcFilterRowComplete(r));
}

// --- app activity ----------------------------------------------------------

// The filled-in details of an app-activity row, as they read in a sentence.
// Only the details the chosen event actually has are considered, so a value
// left over from a different event can never leak into the sentence.
export function dcAppDetailPhrase(row: { field?: string; details?: Record<string, string> }): string {
  const event = appEventById(row.field);
  if (!event?.details?.length) return '';
  return event.details
    .map((kind) => (kind === 'offer' ? programOfferName(row.details?.offer) : ''))
    .filter(Boolean)
    .join(', ');
}

// Changing the event drops any detail the new event does not have, rather
// than carrying a stale value under a question that no longer asks it.
export function dcDetailsForEvent(eventId: string, details: Record<string, string> | undefined): Record<string, string> {
  const kinds = appEventById(eventId)?.details || [];
  const next: Record<string, string> = {};
  for (const k of kinds) if (details?.[k]) next[k] = details[k];
  return next;
}

// Changing the campaign's program clears an app-activity filter whose event
// the new program does not emit. The row is LEFT IN PLACE with its event
// cleared, so it is visibly waiting to be picked again rather than silently
// vanishing along with the rest of what was configured on it.
export function dcClearFiltersForEvents(rows: DripFilterRow[] | undefined, availableEventIds: string[]): DripFilterRow[] {
  return (rows || []).map((r) => (r.group === 'App activity' && r.field && !availableEventIds.includes(r.field) ? { ...r, field: '', details: {} } : r));
}

// --- sentences -------------------------------------------------------------

// A typed milestone threshold reads as a percent by default, or as a rupee
// amount when the row is switched to one.
export function dcMilestoneValue(raw: string | undefined, unit: 'percent' | 'rupees' | undefined): string {
  const v = (raw ?? '').toString().trim();
  if (!v) return '';
  if (unit === 'rupees') {
    const n = Number(v);
    return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN')}` : `₹${v}`;
  }
  return `${v}%`;
}

function valuePhrase(row: DripFilterRow): string {
  const meta = dcFilterAttrMeta(row.group, row.field);
  if (meta?.type === 'multiSelect' || meta?.type === 'smartTag') return (row.values || []).join(', ');
  if (row.operator === 'is between') return `${dcFormatValue(meta, row.value)} and ${dcFormatValue(meta, row.value2)}`;
  return dcFormatValue(meta, row.value);
}

export function dcFilterSentence(row: DripFilterRow): string {
  if (!row) return '';
  if (row.group === 'Transactions') {
    const txn = row.txn ?? dcDefaultTxnForRow();
    const count = (txn.filters || []).filter((f) => f.attribute).length;
    const matching = count ? ` matching ${count} ${count === 1 ? 'filter' : 'filters'}` : '';
    // Reads as a sentence rather than echoing the dropdown wording, which
    // would give "A matching transaction exists matching 2 filters".
    const head = row.operator === TXN_NONE ? 'No transaction' : 'A transaction';
    return `${head}${matching} in the last ${txn.lookbackDuration} ${txn.lookbackUnit}`;
  }
  if (row.group === 'App activity') {
    // "Verify OTP happened in the last 1 day", or with a detail filled in,
    // "Offer clicked, Welcome Offer, happened in the last 7 days".
    const label = appEventLabel(row.field) || 'App activity';
    const detail = dcAppDetailPhrase(row);
    const n = Number(row.value || 0);
    return `${label}${detail ? `, ${detail},` : ''} ${row.operator || ''} in the last ${row.value || ''} ${n === 1 ? 'day' : 'days'}`.replace(/\s+/g, ' ').trim();
  }
  if (row.group === 'Previous message') {
    return `Previous message outcome is any of ${(row.values || []).join(', ')}`;
  }
  if (row.group === 'Milestone') {
    const name = milestoneOfferName(row.field) || 'Milestone';
    const amount = (v: string | undefined) => dcMilestoneValue(v, row.valueUnit);
    const val = row.operator === 'is between' ? `${amount(row.value)} and ${amount(row.value2)}` : amount(row.value);
    return `${name} ${row.operator || ''} ${val}`.replace(/\s+/g, ' ').trim();
  }
  return `${row.field} ${row.operator} ${valuePhrase(row)}`.replace(/\s+/g, ' ').trim();
}

// Review and the saved campaign show one sentence per filter, in the order
// they were added.
export function dcFilterSentences(rows: DripFilterRow[] | undefined): string[] {
  return dcCompleteFilters(rows).map((r) => dcFilterSentence(r));
}

// Entry · Event and Wait for Event narrow on their own event's attributes,
// which are not filter rows and so never passed through dcFiltersOf — it
// answers for ENTRY_SEGMENT and SPLIT and returns nothing for anything
// else. The result was that a real narrowing ("Transaction Amount is more
// than 5000") showed nowhere: not on Review, not in the step panel.
export function dcEventConditionSentences(type: string, p: any): string[] {
  if (type !== 'ENTRY_EVENT' && type !== 'WAIT_UNTIL') return [];
  const { entity, lockedAttr } = resolveEntryEventAttrSource(p?.eventCategory ?? null, p?.eventType ?? null);
  if (!entity && !lockedAttr) return [];
  return (p?.conditions || [])
    .filter((c: DripGoalCondition) => (lockedAttr || c.attribute) && c.operator)
    .map((c: DripGoalCondition) => {
      const field = lockedAttr || c.attribute;
      const meta = entity ? ELIGIBILITY_META[entity]?.[c.attribute] ?? null : null;
      const op = dcNormalizeOperator(c.operator);
      const value =
        meta?.type === 'multiSelect' || meta?.type === 'smartTag'
          ? (c.values || []).join(', ')
          : op === 'is between'
            ? `${dcFormatValue(meta, c.value)} and ${dcFormatValue(meta, c.value2)}`
            : dcFormatValue(meta, c.value);
      return `${field} ${op} ${value}`.replace(/\s+/g, ' ').trim();
    })
    .filter((t: string) => t.split(' ').length > 2);
}

// Everything a step has to say, whichever shape it keeps it in. One entry
// point so Review and the step panel cannot show different things.
export function dcStepSentences(type: string, p: any): string[] {
  const rows = dcFilterSentences(dcFiltersOf(type, p));
  return rows.length ? rows : dcEventConditionSentences(type, p);
}

// One short line for a canvas card, which has no room for a list.
export function dcFiltersLabel(rows: DripFilterRow[] | undefined): string {
  const done = dcCompleteFilters(rows);
  if (!done.length) return '';
  if (done.length === 1) return dcFilterSentence(done[0]);
  return `${done.length} filters`;
}

export { ELIGIBILITY_META };
