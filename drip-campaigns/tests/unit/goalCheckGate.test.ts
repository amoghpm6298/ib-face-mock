// Commit 3 — a Goal Check that cannot fire.
//
// Exit on conversion and a Goal Check contradict each other: anyone who
// converts has already left the journey, so the check's Yes arm is a path
// nobody takes. The campaign reads as though it branches on conversion and
// does not, which is why this blocks rather than warns.
import { describe, expect, it, beforeEach } from 'vitest';
import type { DripGoal, DripGraph } from '../../src/data/graphTypes';
import { dcResetIdCounters } from '../../src/reducer/idGen';
import { dcConfirmAddNode, dcValidateCampaign, dcRemoveGoalCheck } from '../../src/reducer/campaignReducer';
import { dcDefaultConfig } from '../../src/reducer/defaultConfig';

const GOAL: DripGoal = {
  eventCategory: 'Card Events',
  eventType: 'Virtual card activated',
  conditions: [],
  conversionWindow: { duration: 7, unit: 'days' },
};

function withGoalCheck(goal: DripGoal | null) {
  let g: DripGraph = { nodes: {}, edges: [], rootId: null };
  g = dcConfirmAddNode(g, 'ENTRY_EVENT', { ...dcDefaultConfig('ENTRY_EVENT'), eventCategory: 'Journey Events', eventType: 'Pageload' }, { kind: 'root' }, goal);
  const sendP = { ...dcDefaultConfig('SEND'), name: 'Reminder 1', channel: 'WHATSAPP', account: 'IBL-Karix-Onb', templateId: 'CT-3313' };
  g = dcConfirmAddNode(g, 'SEND', sendP, { kind: 'growLeaf', nodeId: g.rootId! }, goal);
  const slot = g.edges.find((e) => e.to === null)!;
  return dcConfirmAddNode(g, 'GOAL_CHECK', null, { kind: 'edge', edgeId: slot.id }, goal);
}
const messages = (g: DripGraph, goal: DripGoal | null) => dcValidateCampaign(g, goal).map((i) => i.message).join(' | ');

describe('the submit gate', () => {
  beforeEach(() => dcResetIdCounters());

  it('names the step the dead Goal Check follows, so it can be found', () => {
    const out = messages(withGoalCheck(GOAL), GOAL);
    expect(out).toMatch(/The Goal Check after "Reminder 1" can never fire/);
    expect(out).toMatch(/turn that off on the Goal step/);
  });

  it('says nothing once exit on conversion is off — then the check is the point', () => {
    const off = { ...GOAL, exitOnConversion: false };
    expect(messages(withGoalCheck(off), off)).not.toMatch(/can never fire/);
  });

  it('says nothing when there is no goal at all', () => {
    expect(messages(withGoalCheck(null), null)).not.toMatch(/can never fire/);
  });

  it('points at the Goal Check itself, so the UI can jump to it', () => {
    const g = withGoalCheck(GOAL);
    const check = Object.values(g.nodes).find((n) => n.type === 'GOAL_CHECK')!;
    const issue = dcValidateCampaign(g, GOAL).find((i) => i.message.includes('can never fire'))!;
    expect(issue.nodeId).toBe(check.id);
  });
});

describe('clearing them from the Goal step', () => {
  beforeEach(() => dcResetIdCounters());

  it('removing a Goal Check keeps whatever was under its No arm', () => {
    let g = withGoalCheck(GOAL);
    const check = Object.values(g.nodes).find((n) => n.type === 'GOAL_CHECK')!;
    const no = g.edges.find((e) => e.from === check.id && e.port === 'no')!;
    g = dcConfirmAddNode(g, 'EXIT', { reason: 'Done' }, { kind: 'edge', edgeId: no.id }, GOAL);
    const exit = Object.values(g.nodes).find((n) => n.type === 'EXIT')!;

    g = dcRemoveGoalCheck(g, check.id);
    expect(Object.values(g.nodes).some((n) => n.type === 'GOAL_CHECK')).toBe(false);
    expect(g.nodes[exit.id]).toBeTruthy();
    // And the campaign it leaves behind is one the gate accepts.
    expect(messages(g, GOAL)).not.toMatch(/can never fire/);
  });
});
