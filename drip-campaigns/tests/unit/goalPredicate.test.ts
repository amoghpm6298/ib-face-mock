// H3 — a Wait for Event may only exit straight to Goal Reached when its own
// predicate MEANS the goal, not merely when it shares the goal's event.
//
// Matching category and type alone is what the reducer used to check. With a
// goal of "Transaction, amount is at least ₹5,000", a wait on "Transaction"
// with no filters fires on a ₹50 coffee, and every one of those was recorded
// as a conversion. A false Goal Reached is the one error analytics can never
// recover from afterwards — it is indistinguishable from a real one.
import { describe, expect, it, beforeEach } from 'vitest';
import type { DripGoal, DripGraph } from '../../src/data/graphTypes';
import { dcResetIdCounters } from '../../src/reducer/idGen';
import { dcConfirmAddNode, dcEventMeetsGoal } from '../../src/reducer/campaignReducer';
import { dcDefaultConfig } from '../../src/reducer/defaultConfig';

const BIG_TXN: DripGoal = {
  eventCategory: 'Transaction Events',
  eventType: 'Transaction',
  conditions: [{ attribute: 'Transaction Amount', operator: 'is at least', value: '5000' }],
};
const wait = (over: Record<string, unknown> = {}) => ({
  ...dcDefaultConfig('WAIT_UNTIL'),
  eventCategory: 'Transaction Events',
  eventType: 'Transaction',
  duration: 3,
  unit: 'days',
  conditions: [],
  ...over,
});

describe('does this wait mean the goal?', () => {
  it('no, when it shares the event but carries none of the goal\'s conditions — the bug', () => {
    expect(dcEventMeetsGoal(wait(), BIG_TXN)).toBe(false);
  });

  it('yes, when it states the same condition', () => {
    expect(dcEventMeetsGoal(wait({ conditions: BIG_TXN.conditions }), BIG_TXN)).toBe(true);
  });

  it('yes, when it is narrower — extra conditions are AND\'d, so they only match fewer people', () => {
    const narrower = wait({ conditions: [...BIG_TXN.conditions, { attribute: 'Transaction Status', operator: 'is', value: 'APPROVED' }] });
    expect(dcEventMeetsGoal(narrower, BIG_TXN)).toBe(true);
  });

  it('no, when the condition is on the right attribute but a different value', () => {
    expect(dcEventMeetsGoal(wait({ conditions: [{ attribute: 'Transaction Amount', operator: 'is at least', value: '50' }] }), BIG_TXN)).toBe(false);
  });

  it('no, when the comparison differs', () => {
    expect(dcEventMeetsGoal(wait({ conditions: [{ attribute: 'Transaction Amount', operator: 'is at most', value: '5000' }] }), BIG_TXN)).toBe(false);
  });

  it('reads a legacy operator spelling as the same comparison, not a mismatch', () => {
    // A campaign saved before the wording pass stores "Greater than or equal
    // to" where today's UI writes "is at least". Same question.
    const legacyGoal: DripGoal = { ...BIG_TXN, conditions: [{ attribute: 'Transaction Amount', operator: 'Greater than or equal to', value: '5000' }] };
    expect(dcEventMeetsGoal(wait({ conditions: BIG_TXN.conditions }), legacyGoal)).toBe(true);
  });

  it('reads a single stored value as a one-item set, as everything else here does', () => {
    const multi: DripGoal = { ...BIG_TXN, conditions: [{ attribute: 'Transaction Status', operator: 'is any of', values: ['APPROVED'] }] };
    expect(dcEventMeetsGoal(wait({ conditions: [{ attribute: 'Transaction Status', operator: 'is any of', value: 'APPROVED' }] }), multi)).toBe(true);
  });

  it('no, for a different event entirely, however many conditions line up', () => {
    expect(dcEventMeetsGoal(wait({ eventType: 'Virtual card activated', eventCategory: 'Card Events', conditions: BIG_TXN.conditions }), BIG_TXN)).toBe(false);
  });

  it('no, when the goal names a scoping field the wait leaves blank', () => {
    const scoped: DripGoal = { eventCategory: 'Offer Events', eventType: 'Outcome Issuance', conditions: [], offerName: 'Welcome Offer' };
    const w = wait({ eventCategory: 'Offer Events', eventType: 'Outcome Issuance', offerName: '' });
    expect(dcEventMeetsGoal(w, scoped)).toBe(false);
    expect(dcEventMeetsGoal({ ...w, offerName: 'Welcome Offer' }, scoped)).toBe(true);
  });

  it('no, when the goal names a card detail the wait leaves blank', () => {
    const scoped: DripGoal = { eventCategory: 'Card Events', eventType: 'Card hotlisted', conditions: [], cardDetails: { 'Hotlist reason': 'Damaged' } };
    const w = wait({ eventCategory: 'Card Events', eventType: 'Card hotlisted' });
    expect(dcEventMeetsGoal(w, scoped)).toBe(false);
    expect(dcEventMeetsGoal({ ...w, cardDetails: { 'Hotlist reason': 'Damaged' } }, scoped)).toBe(true);
  });

  it('an empty detail on the goal means any value, so it constrains nothing', () => {
    const loose: DripGoal = { eventCategory: 'Card Events', eventType: 'Card hotlisted', conditions: [], cardDetails: { 'Hotlist reason': '' } };
    expect(dcEventMeetsGoal(wait({ eventCategory: 'Card Events', eventType: 'Card hotlisted' }), loose)).toBe(true);
  });

  it('no goal at all is never met', () => {
    expect(dcEventMeetsGoal(wait(), null)).toBe(false);
  });
});

describe('what the builder wires off a Wait for Event', () => {
  beforeEach(() => dcResetIdCounters());

  // Nothing about the goal any more. A wait used to shortcut to a Goal
  // Reached step when its predicate met the goal, and insert a Goal Check
  // when it was broader. Conversion is a campaign setting now, evaluated
  // everywhere rather than where a node happens to sit, so a wait wires
  // neither: both arms are left open for the author.
  function graphWithWait(waitCfg: Record<string, unknown>, goal: DripGoal | null) {
    let g: DripGraph = { nodes: {}, edges: [], rootId: null };
    g = dcConfirmAddNode(g, 'ENTRY_EVENT', { ...dcDefaultConfig('ENTRY_EVENT'), eventCategory: 'Journey Events', eventType: 'Pageload' }, { kind: 'root' }, goal);
    return dcConfirmAddNode(g, 'WAIT_UNTIL', waitCfg, { kind: 'growLeaf', nodeId: g.rootId! }, goal);
  }
  const typesIn = (g: DripGraph) => Object.values(g.nodes).map((n) => n.type);

  it('a wait that means the goal wires no goal step at all', () => {
    const g = graphWithWait(wait({ conditions: BIG_TXN.conditions }), BIG_TXN);
    expect(typesIn(g)).not.toContain('GOAL_CHECK');
    expect(g.edges.filter((e) => e.to === null)).toHaveLength(2);
  });

  it('a wait broader than the goal wires no goal step either', () => {
    const g = graphWithWait(wait(), BIG_TXN);
    expect(typesIn(g)).not.toContain('GOAL_CHECK');
  });

  it('an event with several outcomes still gets its outcome Condition — that was never about the goal', () => {
    // EMI_STATUS_CHANGED fires the same event for Successful, Failed,
    // Expired and Cancelled, so "it happened" is not an answer on its own.
    const g = graphWithWait(wait({ eventCategory: 'EMI Events', eventType: 'EMI_STATUS_CHANGED' }), null);
    expect(typesIn(g)).toContain('SPLIT');
    const split = Object.values(g.nodes).find((n) => n.type === 'SPLIT')!;
    expect(g.edges.filter((e) => e.from === split.id).map((e) => e.branchLabel).sort()).toEqual(['Other outcome', 'Success outcome']);
  });

  it('and an unambiguous event just leaves both arms open', () => {
    const g = graphWithWait(wait({ eventCategory: 'Card Events', eventType: 'Virtual card activated' }), null);
    expect(typesIn(g)).not.toContain('SPLIT');
    expect(g.edges.filter((e) => e.to === null).map((e) => e.port).sort()).toEqual(['event', 'timeout']);
  });
});
