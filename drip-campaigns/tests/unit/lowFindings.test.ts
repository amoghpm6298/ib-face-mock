// The audit's Low findings: copy that had stopped being true, a step the
// rail called unfinished when it was optional, a converted path that could
// stop being counted as converted, and a label that printed "undefined".
import { describe, expect, it, beforeEach } from 'vitest';
import type { DripGoal, DripGraph } from '../../src/data/graphTypes';
import { DC_TYPE_SUB } from '../../src/data/typeSub';
import { DC_STEP_TYPES } from '../../src/data/nodeMeta';
import { dcResetIdCounters } from '../../src/reducer/idGen';
import { dcConfirmAddNode, dcValidateCampaign, dcRemoveGoalCheck } from '../../src/reducer/campaignReducer';
import { dcDefaultConfig } from '../../src/reducer/defaultConfig';

describe('L1 — the picker describes what it offers', () => {
  it('Goal Check no longer calls itself unaddable, in the list that offers it', () => {
    expect(DC_STEP_TYPES).toContain('GOAL_CHECK');
    expect(DC_TYPE_SUB.GOAL_CHECK).not.toMatch(/not addable|system-generated/i);
    expect(DC_TYPE_SUB.GOAL_CHECK).toBe('Has the campaign goal been achieved?');
  });

  it('an audience entry is not called a snapshot, since it can repeat', () => {
    expect(DC_TYPE_SUB.ENTRY_SEGMENT).not.toMatch(/snapshot/i);
    expect(DC_TYPE_SUB.ENTRY_SEGMENT).toMatch(/repeating schedule/);
  });
});

describe('L4 — a goal that matches a set of statuses', () => {
  beforeEach(() => dcResetIdCounters());

  // EMI_STATUS_CHANGED is the one event with a promoted status attribute, so
  // this is the path that builds a question out of the goal's own condition.
  const multiGoal: DripGoal = {
    eventCategory: 'EMI Events',
    eventType: 'EMI_STATUS_CHANGED',
    conditions: [{ attribute: 'New Status', operator: 'is any of', values: ['Successful', 'Partially Successful'] }],
  };
  function waitOnGoal(goal: DripGoal) {
    let g: DripGraph = { nodes: {}, edges: [], rootId: null };
    g = dcConfirmAddNode(g, 'ENTRY_EVENT', { ...dcDefaultConfig('ENTRY_EVENT', null), eventCategory: 'Journey Events', eventType: 'Pageload' }, { kind: 'root' }, goal);
    const cfg = { ...dcDefaultConfig('WAIT_UNTIL', null), eventCategory: 'EMI Events', eventType: 'EMI_STATUS_CHANGED', duration: 3, unit: 'days', conditions: goal.conditions };
    return dcConfirmAddNode(g, 'WAIT_UNTIL', cfg, { kind: 'growLeaf', nodeId: g.rootId! }, goal);
  }

  it('reads both values instead of printing "undefined"', () => {
    const g = waitOnGoal(multiGoal);
    const check = Object.values(g.nodes).find((n) => n.type === 'GOAL_CHECK')!;
    expect(check.label).toBe('New Status = Successful or Partially Successful?');
    expect(check.label).not.toContain('undefined');
  });

  it('and so does the exit built beneath it', () => {
    const g = waitOnGoal(multiGoal);
    const exit = Object.values(g.nodes).find((n) => n.type === 'EXIT')!;
    expect(exit.label).toContain('Successful or Partially Successful');
    expect(exit.label).not.toContain('undefined');
  });

  it('a single-value goal still reads exactly as it did', () => {
    const single: DripGoal = { ...multiGoal, conditions: [{ attribute: 'New Status', operator: 'is', value: 'Successful' }] };
    const g = waitOnGoal(single);
    const check = Object.values(g.nodes).find((n) => n.type === 'GOAL_CHECK')!;
    expect(check.label).toBe('New Status = Successful?');
  });
});

describe('L3 — a converted path that stops being counted as converted', () => {
  beforeEach(() => dcResetIdCounters());
  const GOAL: DripGoal = { eventCategory: 'Card Events', eventType: 'Virtual card activated', conditions: [] };

  function campaignWithGoalCheck() {
    let g: DripGraph = { nodes: {}, edges: [], rootId: null };
    g = dcConfirmAddNode(g, 'ENTRY_EVENT', { ...dcDefaultConfig('ENTRY_EVENT', null), eventCategory: 'Journey Events', eventType: 'Pageload' }, { kind: 'root' }, GOAL);
    return dcConfirmAddNode(g, 'PAUSE', { duration: 2, unit: 'days' }, { kind: 'growLeaf', nodeId: g.rootId! }, GOAL);
  }
  const messages = (g: DripGraph) => dcValidateCampaign(g, GOAL).map((i) => i.message).join(' | ');

  it('says nothing while the Yes arm still ends in Goal Reached', () => {
    expect(messages(campaignWithGoalCheck())).not.toMatch(/never reaches Goal Reached/);
  });

  // Replaces the Goal Reached on the Yes arm with whatever is built next.
  function strippedGoalExit(g: DripGraph) {
    const goalExit = Object.values(g.nodes).find((n) => n.type === 'GOAL_EXIT')!;
    const arm = g.edges.find((e) => e.to === goalExit.id)!;
    const next = { ...g, nodes: { ...g.nodes }, edges: g.edges.map((e) => (e.id === arm.id ? { ...e, to: null } : e)) };
    delete next.nodes[goalExit.id];
    return { graph: next, armId: arm.id };
  }

  it('names it once the Goal Reached exit is replaced by a plain Exit', () => {
    const { graph, armId } = strippedGoalExit(campaignWithGoalCheck());
    const g = dcConfirmAddNode(graph, 'EXIT', { reason: 'Done' }, { kind: 'edge', edgeId: armId }, GOAL);
    expect(messages(g)).toMatch(/never reaches Goal Reached/);
  });

  it('allows a message after converting, as long as the path still ends in Goal Reached', () => {
    const { graph, armId } = strippedGoalExit(campaignWithGoalCheck());
    const send = { ...dcDefaultConfig('SEND', null), name: 'Well done', account: 'IBL-Karix-Onb', templateId: 'CT-3313' };
    // The Send's own auto-inserted wait on the goal carries a Goal Reached
    // under it, so the path arrives at one again — and the check stays quiet.
    const g = dcConfirmAddNode(graph, 'SEND', send, { kind: 'edge', edgeId: armId }, GOAL);
    expect(messages(g)).not.toMatch(/never reaches Goal Reached/);
  });

  it('ignores a Goal Check whose Yes arm is still an open slot — already reported as unfinished', () => {
    let g = campaignWithGoalCheck();
    const goalExit = Object.values(g.nodes).find((n) => n.type === 'GOAL_EXIT')!;
    g = dcRemoveGoalCheck(g, Object.values(g.nodes).find((n) => n.type === 'GOAL_CHECK')!.id);
    expect(Object.values(g.nodes).some((n) => n.id === goalExit.id)).toBe(false);
  });
});
