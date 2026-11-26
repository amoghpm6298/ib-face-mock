// M1 — an edge's identity is its port, not the words printed on it.
//
// `'Yes'` / `'No'` / `'Anything else'` used to BE the wiring: reconcile found
// the catch-all by matching its display text, removing a Goal Check found its
// arms with `=== 'Yes'`, and analytics decided a fork was a yes/no pair and
// read an experiment's allocation with regexes over the label. So an import
// writing `"yes"`, or anyone renaming an arm, re-routed the campaign.
import { describe, expect, it, beforeEach } from 'vitest';
import type { DripGoal, DripGraph } from '../../src/data/graphTypes';
import { dcPortOf, dcIsPort, DC_PORTS } from '../../src/data/ports';
import { dcResetIdCounters } from '../../src/reducer/idGen';
import { dcConfirmAddNode, dcConfirmEditNode, dcRemoveGoalCheck, dcRenameEdge } from '../../src/reducer/campaignReducer';
import { dcDefaultConfig } from '../../src/reducer/defaultConfig';
import { DRIP_CAMPAIGNS } from '../../src/data/seedCampaigns';
import { generateDripAnalytics } from '../../src/data/dripAnalytics';

const GOAL: DripGoal = { eventCategory: 'Card Events', eventType: 'Virtual card activated', conditions: [] };

describe('reading an edge\'s meaning', () => {
  it('uses the stored port when there is one, whatever the label says', () => {
    expect(dcPortOf({ branchLabel: 'Anything at all', branchId: undefined, port: 'timeout' })).toBe('timeout');
  });

  it('falls back to the label for an edge written before ports existed', () => {
    expect(dcPortOf({ branchLabel: 'Yes', branchId: undefined, port: undefined })).toBe('yes');
    expect(dcPortOf({ branchLabel: 'No', branchId: undefined, port: undefined })).toBe('no');
    expect(dcPortOf({ branchLabel: 'Anything else', branchId: undefined, port: undefined })).toBe('else');
    expect(dcPortOf({ branchLabel: '', branchId: undefined, port: undefined })).toBe('next');
  });

  it('reads a lower-case "yes" as yes — the audit\'s own example of silently flipped routing', () => {
    expect(dcPortOf({ branchLabel: 'yes', branchId: undefined, port: undefined })).toBe('yes');
    expect(dcPortOf({ branchLabel: '  NO  ', branchId: undefined, port: undefined })).toBe('no');
  });

  it('treats a legacy edge carrying a branch id as a branch arm', () => {
    expect(dcPortOf({ branchLabel: 'WhatsApp (50%)', branchId: 'b1', port: undefined })).toBe('branch');
  });

  it('treats a freely named path as a plain continuation, not a polarity', () => {
    expect(dcPortOf({ branchLabel: 'Month 1', branchId: undefined, port: undefined })).toBe('next');
  });

  it('rejects a value that is not a port', () => {
    expect(dcIsPort('sideways')).toBe(false);
    for (const p of DC_PORTS) expect(dcIsPort(p)).toBe(true);
  });
});

describe('what the builder writes', () => {
  beforeEach(() => dcResetIdCounters());

  function build(type: Parameters<typeof dcConfirmAddNode>[1], cfg: Record<string, unknown>, goal: DripGoal | null = GOAL) {
    let g: DripGraph = { nodes: {}, edges: [], rootId: null };
    g = dcConfirmAddNode(g, 'ENTRY_EVENT', { ...dcDefaultConfig('ENTRY_EVENT', null), eventCategory: 'Journey Events', eventType: 'Pageload' }, { kind: 'root' }, goal);
    return dcConfirmAddNode(g, type, cfg, { kind: 'growLeaf', nodeId: g.rootId! }, goal);
  }

  it('gives every edge it creates a port', () => {
    const g = build('PAUSE', { duration: 2, unit: 'days' });
    expect(g.edges.length).toBeGreaterThan(0);
    for (const e of g.edges) expect(dcIsPort(e.port)).toBe(true);
  });

  it('names a Wait for Event\'s arms by what they mean, not by the Yes/No it displays', () => {
    const g = build('WAIT_UNTIL', { ...dcDefaultConfig('WAIT_UNTIL', null), eventCategory: 'Card Events', eventType: 'Virtual card activated', duration: 3, unit: 'days' });
    const waitId = Object.values(g.nodes).find((n) => n.type === 'WAIT_UNTIL')!.id;
    const outs = g.edges.filter((e) => e.from === waitId);
    expect(outs.map((e) => e.port).sort()).toEqual(['event', 'timeout']);
    // And the canvas says the same thing in words. The rename was only
    // possible as a copy change BECAUSE the ports carry the meaning: these
    // two assertions are now independent, where before the second one was
    // the wiring.
    expect(outs.map((e) => e.branchLabel).sort()).toEqual(['Event received', 'Timed out']);
  });

  it('gives a Goal Check yes and no, and an Experiment\'s arms branch ports', () => {
    const pause = build('PAUSE', { duration: 1, unit: 'days' });
    const check = Object.values(pause.nodes).find((n) => n.type === 'GOAL_CHECK')!;
    expect(pause.edges.filter((e) => e.from === check.id).map((e) => e.port).sort()).toEqual(['no', 'yes']);

    const exp = build('RANDOM_SPLIT', { ...dcDefaultConfig('RANDOM_SPLIT', null) });
    const node = Object.values(exp.nodes).find((n) => n.type === 'RANDOM_SPLIT')!;
    const arms = exp.edges.filter((e) => e.from === node.id);
    expect(arms.length).toBe(2);
    for (const a of arms) {
      expect(a.port).toBe('branch');
      expect(a.branchId).toBeTruthy();
    }
  });

  it('gives a Branch\'s catch-all its own port, so renaming it cannot turn it into an arm', () => {
    const cfg = {
      ...dcDefaultConfig('DECISION_SPLIT', null),
      what: { group: 'Account', field: 'Current limit' },
      branches: [{ id: 'b1', label: 'High', operator: 'is at least', value: '100000', values: [] }],
    };
    const g = build('DECISION_SPLIT', cfg);
    const node = Object.values(g.nodes).find((n) => n.type === 'DECISION_SPLIT')!;
    const ports = g.edges.filter((e) => e.from === node.id).map((e) => e.port);
    expect(ports).toContain('else');
    expect(ports).toContain('branch');
  });
});

describe('renaming cannot re-route', () => {
  beforeEach(() => dcResetIdCounters());

  it('a renamed arm keeps its port, so nothing downstream changes meaning', () => {
    let g: DripGraph = { nodes: {}, edges: [], rootId: null };
    g = dcConfirmAddNode(g, 'ENTRY_EVENT', { ...dcDefaultConfig('ENTRY_EVENT', null), eventCategory: 'Journey Events', eventType: 'Pageload' }, { kind: 'root' }, GOAL);
    g = dcConfirmAddNode(g, 'PAUSE', { duration: 1, unit: 'days' }, { kind: 'growLeaf', nodeId: g.rootId! }, GOAL);
    const check = Object.values(g.nodes).find((n) => n.type === 'GOAL_CHECK')!;
    const yes = g.edges.find((e) => e.from === check.id && e.port === 'yes')!;

    const renamed = dcRenameEdge(g, yes.id, 'Converted!');
    const after = renamed.edges.find((e) => e.id === yes.id)!;
    expect(after.branchLabel).toBe('Converted!');
    expect(after.port).toBe('yes');
    // And removing the check still finds its arms, which is the operation
    // that used to depend on the label reading exactly "Yes".
    const collapsed = dcRemoveGoalCheck(renamed, check.id);
    expect(Object.values(collapsed.nodes).some((n) => n.type === 'GOAL_CHECK')).toBe(false);
  });

  it('a renamed catch-all survives a Branch edit instead of being deleted as a stray arm', () => {
    let g: DripGraph = { nodes: {}, edges: [], rootId: null };
    g = dcConfirmAddNode(g, 'ENTRY_EVENT', { ...dcDefaultConfig('ENTRY_EVENT', null), eventCategory: 'Journey Events', eventType: 'Pageload' }, { kind: 'root' }, null);
    const cfg = {
      ...dcDefaultConfig('DECISION_SPLIT', null),
      what: { group: 'Account', field: 'Current limit' },
      branches: [{ id: 'b1', label: 'High', operator: 'is at least', value: '100000', values: [] }],
    };
    g = dcConfirmAddNode(g, 'DECISION_SPLIT', cfg, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const node = Object.values(g.nodes).find((n) => n.type === 'DECISION_SPLIT')!;
    const catchAll = g.edges.find((e) => e.from === node.id && e.port === 'else')!;
    g = dcRenameEdge(g, catchAll.id, 'Everyone else');

    // Edit the node: add a second arm. The catch-all must still be the
    // catch-all, and must not be swept up as an arm with no branch.
    const edited = dcConfirmEditNode(g, node.id, 'DECISION_SPLIT', {
      ...cfg,
      branches: [...cfg.branches, { id: 'b2', label: 'Low', operator: 'is at most', value: '1000', values: [] }],
    }, null);
    const after = edited.edges.filter((e) => e.from === node.id);
    expect(after.filter((e) => e.port === 'else')).toHaveLength(1);
    expect(after.find((e) => e.port === 'else')!.branchLabel).toBe('Everyone else');
    expect(after.filter((e) => e.port === 'branch')).toHaveLength(2);
  });
});

describe('analytics reads the allocation from the experiment, not from its labels', () => {
  it("DRIP-002's configured 50/50 is honoured — its arms read \"50% WhatsApp\", which the old regex never matched", () => {
    const c = DRIP_CAMPAIGNS.find((x) => x.id === 'DRIP-002')!;
    const node = Object.values(c.root!.nodes).find((n) => n.type === 'RANDOM_SPLIT')!;
    const arms = c.root!.edges.filter((e) => e.from === node.id);
    const data = generateDripAnalytics(c);
    const pcts = arms.map((e) => data.metrics.edgeCounts[e.id].pct);
    expect(pcts).toEqual([50, 50]);
  });

  it("DRIP-006's 60/40 is honoured too", () => {
    const c = DRIP_CAMPAIGNS.find((x) => x.id === 'DRIP-006')!;
    const node = Object.values(c.root!.nodes).find((n) => n.type === 'RANDOM_SPLIT')!;
    const arms = c.root!.edges.filter((e) => e.from === node.id);
    const data = generateDripAnalytics(c);
    expect(arms.map((e) => data.metrics.edgeCounts[e.id].pct)).toEqual([60, 40]);
  });
});

describe('every seeded edge states what it means', () => {
  it('all of them carry a real port', () => {
    for (const c of DRIP_CAMPAIGNS) {
      if (!c.root) continue;
      for (const e of c.root.edges) {
        expect({ id: `${c.id}/${e.id}`, port: dcIsPort(e.port) }).toEqual({ id: `${c.id}/${e.id}`, port: true });
      }
    }
  });

  it('an experiment arm carries the branch id its allocation is read by', () => {
    for (const c of DRIP_CAMPAIGNS) {
      if (!c.root) continue;
      for (const n of Object.values(c.root.nodes)) {
        if (n.type !== 'RANDOM_SPLIT' && n.type !== 'DECISION_SPLIT') continue;
        for (const e of c.root.edges.filter((x) => x.from === n.id && dcPortOf(x) === 'branch')) {
          expect(e.branchId).toBeTruthy();
        }
      }
    }
  });
});
