// Ported scenario-for-scenario from this feature's original real-browser
// Playwright matrix (test_drip_full_matrix.js / test_drip_matrix_part2.js
// / verify_insert_branch.js, run against the plain-HTML prototype). Those
// scripts needed a real browser only because the logic lived inside
// onclick-string handlers mutating a global object — now that it's a pure
// reducer, the exact same scenarios run as fast, browser-free unit tests.
import { beforeEach, describe, expect, it } from 'vitest';
import { dcPortOf } from '../../src/data/ports';
import type { DripGraph, DripGoal } from '../../src/data/graphTypes';
import { dcResetIdCounters } from '../../src/reducer/idGen';
import { dcGraphHasOpenBranches } from '../../src/reducer/graphOps';
import { dcConfirmAddNode, dcConfirmEditNode, dcRemoveEdge, dcRemoveGoalCheck, dcRenameEdge, type DcAddingAt, dcReconcileGoal, dcValidateCampaign } from '../../src/reducer/campaignReducer';
import { dcDefaultConfig, dcAddFormValid } from '../../src/reducer/defaultConfig';
import { resolveEntryEventAttrSource, EVENT_ATTR_BY_TYPE, MILESTONE_OFFERS, dcFilterOptionGroups } from '../../src/data/sharedConstants';
import { dcMilestoneSummary } from '../../src/reducer/labelMeta';
import { dcBranchWhatOf, dcFilterRowComplete, dcFilterSentence, dcFilterSentences, dcFiltersOf } from '../../src/data/filters';
import { dcCanFanOut, dcIsRoutingNode, DC_STEP_TYPES } from '../../src/data/nodeMeta';

const EMPTY_GRAPH: DripGraph = { nodes: {}, edges: [], rootId: null };
// A real goal — the auto goal-check Split after Send/Pause is only
// inserted when one is actually defined (a goal-less campaign gets a
// plain open slot instead, since there'd be nothing real to check).
const TEST_GOAL: DripGoal = { eventCategory: 'Card Events', eventType: 'Virtual card activated', conditions: [] };

function addEntryEvent(graph: DripGraph, overrides: Record<string, unknown> = {}): DripGraph {
  const p = { ...dcDefaultConfig('ENTRY_EVENT'), eventCategory: 'Journey Events', eventType: 'Pageload', ...overrides };
  return dcConfirmAddNode(graph, 'ENTRY_EVENT', p, { kind: 'root' }, null);
}

beforeEach(() => {
  dcResetIdCounters();
});

describe('Entry nodes', () => {
  // Node-design refinement pass: canvas = execution map, drawer = config
  // database. Eligibility conditions are real configuration detail (P2),
  // so a Segment's meta line never repeats them — the condition itself
  // still lives in _config, just not rendered on the card.
  it('Entry Segment meta omits condition detail — conditions stay in _config, not on canvas', () => {
    const p = { ...dcDefaultConfig('ENTRY_SEGMENT'), conditions: [{ attribute: 'Status', operator: 'Equals', value: 'Active' }] };
    const g = dcConfirmAddNode(EMPTY_GRAPH, 'ENTRY_SEGMENT', p, { kind: 'root' }, null);
    expect(g.rootId).toBeTruthy();
    const root = g.nodes[g.rootId!];
    expect(root.type).toBe('ENTRY_SEGMENT');
    expect(root.meta).toBe('');
    expect((root._config as { conditions: unknown[] }).conditions).toHaveLength(1);
  });

  it('Entry Event sets the root', () => {
    const g = addEntryEvent(EMPTY_GRAPH);
    expect(g.rootId).toBeTruthy();
    expect(g.nodes[g.rootId!].type).toBe('ENTRY_EVENT');
  });

  it('Entry Segment with repeat on shows only the recurrence in meta — no entity, no condition detail', () => {
    const p = { ...dcDefaultConfig('ENTRY_SEGMENT'), repeat: true, entity: 'Account', conditions: [{ attribute: 'Status', operator: 'Equals', value: 'Active' }] };
    const g = dcConfirmAddNode(EMPTY_GRAPH, 'ENTRY_SEGMENT', p, { kind: 'root' }, null);
    const root = g.nodes[g.rootId!];
    expect(root.meta).toContain('every month');
    expect(root.meta).not.toContain('Account');
    expect(root.meta).not.toContain('Status');
    expect(root.meta).not.toContain('undefined');
  });
});

// Conversion is a campaign setting now, so none of these steps grows a goal
// node any more. What each one does grow is the plain open slot that says
// "something comes next, and you choose it".
describe('Send, Pause and Wait grow nothing of their own', () => {
  it('a Send gets one open slot, with or without a goal', () => {
    for (const goal of [TEST_GOAL, null]) {
      dcResetIdCounters();
      let g = addEntryEvent(EMPTY_GRAPH);
      const sendP = { ...dcDefaultConfig('SEND'), name: 'Msg1', channel: 'WHATSAPP', account: 'IBL-Karix-Onb', templateId: 'CT-3313' };
      g = dcConfirmAddNode(g, 'SEND', sendP, { kind: 'growLeaf', nodeId: g.rootId! }, goal);
      const send = Object.values(g.nodes).find((n) => n.type === 'SEND')!;
      expect(Object.values(g.nodes).map((n) => n.type)).toEqual(['ENTRY_EVENT', 'SEND']);
      expect(g.edges.filter((e) => e.from === send.id)).toHaveLength(1);
      expect(g.edges.find((e) => e.from === send.id)!.to).toBeNull();
    }
  });

  it('a Pause gets one open slot, with or without a goal', () => {
    for (const goal of [TEST_GOAL, null]) {
      dcResetIdCounters();
      let g = addEntryEvent(EMPTY_GRAPH);
      g = dcConfirmAddNode(g, 'PAUSE', { duration: 3, unit: 'days' }, { kind: 'growLeaf', nodeId: g.rootId! }, goal);
      expect(Object.values(g.nodes).map((n) => n.type)).toEqual(['ENTRY_EVENT', 'PAUSE']);
      expect(g.edges.filter((e) => e.to === null)).toHaveLength(1);
    }
  });

  it('nothing anywhere auto-inserts a Goal Check', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const sendP = { ...dcDefaultConfig('SEND'), name: 'M', channel: 'WHATSAPP', account: 'IBL-Karix-Onb', templateId: 'CT-3313' };
    g = dcConfirmAddNode(g, 'SEND', sendP, { kind: 'growLeaf', nodeId: g.rootId! }, TEST_GOAL);
    const slot = g.edges.find((e) => e.to === null)!;
    g = dcConfirmAddNode(g, 'PAUSE', { duration: 1, unit: 'days' }, { kind: 'edge', edgeId: slot.id }, TEST_GOAL);
    expect(Object.values(g.nodes).some((n) => n.autoGenerated)).toBe(false);
    expect(Object.values(g.nodes).map((n) => n.type)).not.toContain('GOAL_CHECK');
  });
});

describe('Goal-check removal', () => {
  it('removing a hand-added Goal Check reconnects its parent to whatever the No branch led to', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    g = dcConfirmAddNode(g, 'GOAL_CHECK', null, { kind: 'growLeaf', nodeId: g.rootId! }, TEST_GOAL);
    const check = Object.values(g.nodes).find((n) => n.type === 'GOAL_CHECK')!;
    const noEdge = g.edges.find((e) => e.from === check.id && dcPortOf(e) === 'no')!;
    g = dcConfirmAddNode(g, 'EXIT', { reason: 'Done' }, { kind: 'edge', edgeId: noEdge.id }, TEST_GOAL);
    const exit = Object.values(g.nodes).find((n) => n.type === 'EXIT')!;

    g = dcRemoveGoalCheck(g, check.id);
    expect(Object.values(g.nodes).some((n) => n.type === 'GOAL_CHECK')).toBe(false);
    expect(g.nodes[exit.id]).toBeTruthy();
    expect(g.edges.find((e) => e.from === g.rootId)!.to).toBe(exit.id);
  });
});

describe('Split (Condition) — no "Goal reached" basis anymore', () => {
  it('a user-built Condition never auto-wires its Yes branch to Goal Reached', () => {
    // Previously this exact shape (basis: 'Goal reached') produced an
    // auto GOAL_EXIT under Yes — Phase 1 moved that entirely into the
    // separate GOAL_CHECK type, so a Condition's Yes/No are always both
    // plain open slots, regardless of what it's conditioned on.
    const goal: DripGoal = { eventCategory: 'EMI Events', eventType: 'EMI_STATUS_CHANGED', conditions: [{ attribute: 'New Status', operator: 'Equals', value: 'Successful' }] };
    let g = addEntryEvent(EMPTY_GRAPH);
    const p = { customSource: 'Previous step outcome', outcome: 'Clicked', customConditions: [] };
    g = dcConfirmAddNode(g, 'SPLIT', p, { kind: 'growLeaf', nodeId: g.rootId! }, goal);
    const split = Object.values(g.nodes).find((n) => n.type === 'SPLIT')!;
    const yesEdge = g.edges.find((e) => e.from === split.id && dcPortOf(e) === 'yes')!;
    const noEdge = g.edges.find((e) => e.from === split.id && dcPortOf(e) === 'no')!;
    expect(yesEdge.to).toBeNull();
    expect(noEdge.to).toBeNull();
    expect(Object.values(g.nodes).some((n) => n.type === 'GOAL_EXIT')).toBe(false);
  });

  it('Custom condition split (Account attribute) builds a real Yes/No pair', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const p = { customSource: 'Account attribute', outcome: '', customConditions: [{ attribute: 'Status', operator: 'Equals', value: 'Dormant' }] };
    g = dcConfirmAddNode(g, 'SPLIT', p, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const split = Object.values(g.nodes).find((n) => n.type === 'SPLIT')!;
    expect(split).toBeTruthy();
    expect(g.edges.some((e) => e.from === split.id && dcPortOf(e) === 'yes')).toBe(true);
    expect(g.edges.some((e) => e.from === split.id && dcPortOf(e) === 'no')).toBe(true);
  });

  it('Goal Reached can still be added manually on a Condition branch arm', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const p = { customSource: 'Account attribute', outcome: '', customConditions: [{ attribute: 'Status', operator: 'Equals', value: 'Dormant' }] };
    g = dcConfirmAddNode(g, 'SPLIT', p, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const split = Object.values(g.nodes).find((n) => n.type === 'SPLIT')!;
    const yesEdge = g.edges.find((e) => e.from === split.id && dcPortOf(e) === 'yes')!;
    g = dcConfirmAddNode(g, 'GOAL_EXIT', { reason: 'Reactivated' }, { kind: 'edge', edgeId: yesEdge.id }, null);
    expect(g.nodes[g.edges.find((e) => e.id === yesEdge.id)!.to!].type).toBe('GOAL_EXIT');
  });
});

describe('Transaction history condition', () => {
  it('Condition source "Transaction history" builds a real Yes/No pair', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const p = { customSource: 'Transaction history', txnHistory: { filters: [], lookbackDuration: 90, lookbackUnit: 'days', existence: 'exists' } };
    g = dcConfirmAddNode(g, 'SPLIT', p, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const split = Object.values(g.nodes).find((n) => n.type === 'SPLIT')!;
    expect(split).toBeTruthy();
    expect(g.edges.some((e) => e.from === split.id && dcPortOf(e) === 'yes')).toBe(true);
    expect(g.edges.some((e) => e.from === split.id && dcPortOf(e) === 'no')).toBe(true);
  });

  it('label reflects existence mode and lookback window, with no filters', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const p = { customSource: 'Transaction history', txnHistory: { filters: [], lookbackDuration: 90, lookbackUnit: 'days', existence: 'none' } };
    g = dcConfirmAddNode(g, 'SPLIT', p, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const split = Object.values(g.nodes).find((n) => n.type === 'SPLIT')!;
    expect(split.label).toBe('No transaction in the last 90 days?');
  });

  it('label stays readable for exactly one filter', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const p = {
      customSource: 'Transaction history',
      txnHistory: { filters: [{ attribute: 'Transaction Type', operator: 'Any of', values: ['AUTHORIZE'] }], lookbackDuration: 60, lookbackUnit: 'days', existence: 'exists' },
    };
    g = dcConfirmAddNode(g, 'SPLIT', p, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const split = Object.values(g.nodes).find((n) => n.type === 'SPLIT')!;
    expect(split.label).toBe('A transaction matching 1 filter in the last 60 days?');
  });

  it('2+ filters collapse to a count, same convention as other Condition sources', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const p = {
      customSource: 'Transaction history',
      txnHistory: {
        filters: [
          { attribute: 'Transaction Type', operator: 'Any of', values: ['AUTHORIZE'] },
          { attribute: 'Transaction Status', operator: 'Any of', values: ['APPROVED'] },
        ],
        lookbackDuration: 90,
        lookbackUnit: 'days',
        existence: 'exists',
      },
    };
    g = dcConfirmAddNode(g, 'SPLIT', p, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const split = Object.values(g.nodes).find((n) => n.type === 'SPLIT')!;
    expect(split.label).toBe('A transaction matching 2 filters in the last 90 days?');
  });

  it('dcAddFormValid: Transaction history requires only a positive lookback — filters are optional', () => {
    expect(dcAddFormValid('SPLIT', { customSource: 'Transaction history', txnHistory: { filters: [], lookbackDuration: 90, lookbackUnit: 'days', existence: 'exists' } })).toBe(true);
    expect(dcAddFormValid('SPLIT', { customSource: 'Transaction history', txnHistory: { filters: [], lookbackDuration: 0, lookbackUnit: 'days', existence: 'exists' } })).toBe(false);
    expect(dcAddFormValid('SPLIT', { customSource: 'Transaction history', txnHistory: undefined })).toBe(false);
  });

  it('dcAddFormValid: Entry · Audience never blocks — an audience with no filters targets everyone', () => {
    expect(dcAddFormValid('ENTRY_SEGMENT', { filters: [] })).toBe(true);
    // A half-typed row is a normal intermediate state, not an error.
    expect(dcAddFormValid('ENTRY_SEGMENT', { filters: [{ group: 'Account', field: 'Current OS amount', operator: '' }] })).toBe(true);
  });

  it('an incomplete Transactions row is ignored rather than blocking, and a complete one reads back', () => {
    const incomplete = { filters: [{ group: 'Transactions', field: '', operator: 'a matching transaction exists', txn: { filters: [], lookbackDuration: 0, lookbackUnit: 'days', existence: 'exists' } }] };
    expect(dcFilterSentences(dcFiltersOf('ENTRY_SEGMENT', incomplete))).toEqual([]);
    const complete = { filters: [{ group: 'Transactions', field: '', operator: 'a matching transaction exists', txn: { filters: [], lookbackDuration: 90, lookbackUnit: 'days', existence: 'exists' } }] };
    expect(dcFilterSentences(dcFiltersOf('ENTRY_SEGMENT', complete))).toEqual(['A transaction in the last 90 days']);
  });

  it('legacy entity blocks migrate into rows, including each extra group, with nothing dropped', () => {
    const legacy = {
      entity: 'Account',
      conditions: [{ attribute: 'Status', operator: 'Equals', value: 'Dormant' }],
      extraEntityGroups: [
        { entity: 'Card', conditions: [{ attribute: 'Status', operator: 'Equals', value: 'Active' }] },
        { entity: 'Transaction', conditions: [], lookbackDuration: 90, lookbackUnit: 'days', existence: 'none' },
      ],
    };
    expect(dcFilterSentences(dcFiltersOf('ENTRY_SEGMENT', legacy))).toEqual(['Status is Dormant', 'Status is Active', 'No transaction in the last 90 days']);
  });

  it('backward compatibility: a config predating this field (lookbackDuration absent entirely) stays valid as long as entity is not Transaction', () => {
    // Simulates an old saved Entry · Audience node's _config, from before
    // this capability existed.
    const legacyConfig = { cohortDesc: 'All eligible customers', entity: 'Customer', conditions: [], repeat: false };
    expect(dcAddFormValid('ENTRY_SEGMENT', legacyConfig)).toBe(true);
  });
});

describe('Journey/Offer Events condition narrowing (locked attribute)', () => {
  it('resolveEntryEventAttrSource: Transaction/EMI Events resolve a real entity, no locked attribute', () => {
    expect(resolveEntryEventAttrSource('Transaction Events', 'Transaction')).toEqual({ entity: 'Transaction', lockedAttr: null });
    expect(resolveEntryEventAttrSource('EMI Events', 'EMI_STATUS_CHANGED')).toEqual({ entity: 'EMI Request', lockedAttr: null });
  });

  it('resolveEntryEventAttrSource: Journey/Offer Events resolve a locked attribute per event type, no entity', () => {
    expect(resolveEntryEventAttrSource('Journey Events', 'Journey Progress')).toEqual({ entity: null, lockedAttr: 'Status' });
    expect(resolveEntryEventAttrSource('Journey Events', 'Pageload')).toEqual({ entity: null, lockedAttr: 'Page Name' });
    expect(resolveEntryEventAttrSource('Journey Events', 'Button Click')).toEqual({ entity: null, lockedAttr: 'Button Name' });
    expect(resolveEntryEventAttrSource('Offer Events', 'Outcome Issuance')).toEqual({ entity: null, lockedAttr: 'Outcome Status' });
    expect(EVENT_ATTR_BY_TYPE['Pageload']).toBe('Page Name');
  });

  it('resolveEntryEventAttrSource: no eventType picked yet resolves neither, even for Journey/Offer Events', () => {
    expect(resolveEntryEventAttrSource('Journey Events', '')).toEqual({ entity: null, lockedAttr: null });
    expect(resolveEntryEventAttrSource('Journey Events', null)).toEqual({ entity: null, lockedAttr: null });
  });

  it('resolveEntryEventAttrSource: Card Events resolve neither — confirmed as a genuine gap in the original source too, not just this port', () => {
    expect(resolveEntryEventAttrSource('Card Events', 'Virtual card activated')).toEqual({ entity: null, lockedAttr: null });
  });

  it('resolveEntryEventAttrSource: no category at all resolves neither', () => {
    expect(resolveEntryEventAttrSource(null, null)).toEqual({ entity: null, lockedAttr: null });
  });

  it('a saved Condition that filtered on the entry event opens with its what cleared, and the row stays', () => {
    const rows = dcFiltersOf('SPLIT', {
      customSource: 'Entry event attribute',
      customConditions: [{ attribute: 'Page Name', operator: 'Equals', value: 'EMI Offer Page' }],
    });
    expect(rows).toHaveLength(1); // the row is still there to be picked again
    expect(rows[0].group).toBe('');
    expect(rows[0].field).toBe('');
    expect(rows[0].value).toBe('EMI Offer Page'); // what was typed survives
    expect(dcFilterSentences(rows)).toEqual([]); // incomplete, so ignored
    // Nothing is silently repointed at another group.
    expect(dcAddFormValid('SPLIT', { filters: rows })).toBe(false);
  });

  it('a saved Branch that routed on the entry event opens with its what cleared, and the arms stay', () => {
    const p = {
      source: 'Entry event attribute',
      attribute: 'Button Name',
      branches: [
        { id: 'b1', label: 'CTA clicked', operator: 'Equals', value: 'Apply Now' },
        { id: 'b2', label: 'Other', operator: 'Equals', value: 'Learn More' },
      ],
    };
    expect(dcBranchWhatOf(p)).toEqual({ group: '', field: '' });
    expect(p.branches).toHaveLength(2);
    expect(dcAddFormValid('DECISION_SPLIT', p)).toBe(false);
  });

  it('the what menu offers no Entry event group at all, on Condition or Branch', () => {
    for (const groups of [dcFilterOptionGroups(), dcFilterOptionGroups({ previousMessage: true })]) {
      expect(groups.some((g) => g.group === 'Entry event')).toBe(false);
    }
  });

  it('backward compatibility: ENTRY_EVENT/WAIT_UNTIL/Goal configs predating journey/batch/offerType/offerName stay valid', () => {
    // Simulates a saved node/goal from before this capability existed —
    // no journey/batch/offerType/offerName keys at all, same as every
    // other optional field added this session.
    const legacyEntryEvent = { eventCategory: 'Journey Events', eventType: 'Pageload', conditions: [] };
    expect(dcAddFormValid('ENTRY_EVENT', legacyEntryEvent)).toBe(true);
    const legacyWaitUntil = { eventCategory: 'Offer Events', eventType: 'Outcome Issuance', duration: 7, unit: 'days', conditions: [] };
    expect(dcAddFormValid('WAIT_UNTIL', legacyWaitUntil)).toBe(true);
  });

  it('the locked-attribute conditions/branches stay optional — 0 rows is valid on ENTRY_EVENT/WAIT_UNTIL, same as every other optional condition list', () => {
    // Only eventType is required for these two types — conditions (locked
    // or otherwise) were never part of dcAddFormValid's check, and this
    // capability doesn't change that.
    expect(dcAddFormValid('ENTRY_EVENT', { eventCategory: 'Journey Events', eventType: 'Pageload', conditions: [] })).toBe(true);
    expect(dcAddFormValid('WAIT_UNTIL', { eventCategory: 'Journey Events', eventType: 'Pageload', duration: 7, unit: 'days', conditions: [] })).toBe(true);
  });
});

describe('Entry · Audience — additional entity filters, and Transaction as a real entity choice', () => {
  it('dcDefaultConfig starts with an empty filter list', () => {
    const p = dcDefaultConfig('ENTRY_SEGMENT');
    expect(p.filters).toEqual([]);
  });

  it('extra entity groups persist into _config untouched, alongside the primary entity/conditions, and stay out of canvas meta', () => {
    const p = {
      ...dcDefaultConfig('ENTRY_SEGMENT'),
      entity: 'Account',
      conditions: [{ attribute: 'Status', operator: 'Equals', value: 'Dormant' }],
      extraEntityGroups: [{ entity: 'Card', conditions: [{ attribute: 'Status', operator: 'Equals', value: 'Active' }] }],
    };
    const g = dcConfirmAddNode(EMPTY_GRAPH, 'ENTRY_SEGMENT', p, { kind: 'root' }, null);
    const root = g.nodes[g.rootId!];
    // Same canvas-vs-drawer principle as the primary block above — none of
    // this is configuration detail the canvas should show.
    expect(root.meta).toBe('');
    const saved = root._config as { entity: string; extraEntityGroups: { entity: string; conditions: unknown[] }[] };
    expect(saved.entity).toBe('Account');
    expect(saved.extraEntityGroups).toHaveLength(1);
    expect(saved.extraEntityGroups[0].entity).toBe('Card');
    expect(saved.extraEntityGroups[0].conditions).toHaveLength(1);
  });

  it('Transaction is a real entity choice, not a separate toggle — its lookback/existence fields persist on the primary block exactly like entity/conditions do, and it can coexist with another entity in extraEntityGroups', () => {
    const p = {
      ...dcDefaultConfig('ENTRY_SEGMENT'),
      entity: 'Transaction',
      conditions: [{ attribute: 'Transaction Type', operator: 'Any of', values: ['AUTHORIZE'] }],
      lookbackDuration: 90,
      lookbackUnit: 'days',
      existence: 'none',
      extraEntityGroups: [{ entity: 'Account', conditions: [{ attribute: 'Status', operator: 'Equals', value: 'Active' }] }],
    };
    const g = dcConfirmAddNode(EMPTY_GRAPH, 'ENTRY_SEGMENT', p, { kind: 'root' }, null);
    const root = g.nodes[g.rootId!];
    expect(root.meta).toBe('');
    const saved = root._config as typeof p;
    expect(saved.entity).toBe('Transaction');
    expect(saved.lookbackDuration).toBe(90);
    expect(saved.existence).toBe('none');
    expect(saved.extraEntityGroups[0].entity).toBe('Account');
  });

  it('backward compatibility: a config predating this field (extraEntityGroups absent entirely) is unaffected', () => {
    // Simulates an old saved Entry · Audience node's _config, from before
    // this capability existed — no extraEntityGroups key at all. Nothing
    // in dcAddFormValid depends on it (same leniency as the primary
    // entity/conditions, which are optional too), so this just confirms
    // the node still builds cleanly with the key fully absent.
    const legacyConfig = { cohortDesc: 'All eligible customers', entity: 'Customer', conditions: [], repeat: false };
    const g = dcConfirmAddNode(EMPTY_GRAPH, 'ENTRY_SEGMENT', legacyConfig, { kind: 'root' }, null);
    expect(g.rootId).toBeTruthy();
    expect(dcAddFormValid('ENTRY_SEGMENT', legacyConfig)).toBe(true);
  });
});

describe('Decision Split', () => {
  it('2 branches + catch-all, correct summary labels', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const p = {
      name: 'Decision', source: 'Account attribute', attribute: 'Transaction Amount', outcome: 'Clicked',
      branches: [
        { id: 'b1', label: 'Branch 1', operator: 'Between', value: '5', value2: '20' },
        { id: 'b2', label: 'Branch 2', operator: 'Between', value: '21', value2: '50' },
      ],
    };
    g = dcConfirmAddNode(g, 'DECISION_SPLIT', p, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const ds = Object.values(g.nodes).find((n) => n.type === 'DECISION_SPLIT')!;
    expect(ds.label).toBe('Transaction Amount');
    expect(ds.meta).toBe('2 branches + catch-all');
    const labels = g.edges.filter((e) => e.from === ds.id).map((e) => e.branchLabel);
    expect(labels).toEqual(['Branch 1 (5–20)', 'Branch 2 (21–50)', 'Anything else']);
  });

  it('dcAddFormValid blocks when a branch value is missing', () => {
    const p = { ...dcDefaultConfig('DECISION_SPLIT'), attribute: 'Transaction Amount' };
    expect(dcAddFormValid('DECISION_SPLIT', p)).toBe(false); // branch values empty by default
  });
});

describe('Random Split', () => {
  it('N branches become N open edges', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const p = { name: 'Channel test', branches: [{ id: 'a', label: 'A', pct: 34 }, { id: 'b', label: 'B', pct: 33 }, { id: 'c', label: 'C', pct: 33 }] };
    g = dcConfirmAddNode(g, 'RANDOM_SPLIT', p, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const rs = Object.values(g.nodes).find((n) => n.type === 'RANDOM_SPLIT')!;
    expect(g.edges.filter((e) => e.from === rs.id).length).toBe(3);
  });

  it('dcAddFormValid requires percentages to sum to 100', () => {
    const p = { branches: [{ pct: 30 }, { pct: 30 }] };
    expect(dcAddFormValid('RANDOM_SPLIT', p)).toBe(false);
    expect(dcAddFormValid('RANDOM_SPLIT', { branches: [{ pct: 60 }, { pct: 40 }] })).toBe(true);
  });
});

describe('Send fallback channel validation', () => {
  it('a Send with no fallback configured only needs its own account/template', () => {
    expect(dcAddFormValid('SEND', { channel: 'WHATSAPP', account: 'x', templateId: 'CT-1', fallbackChannel: '' })).toBe(true);
    expect(dcAddFormValid('SEND', { channel: 'WHATSAPP', account: '', templateId: '', fallbackChannel: '' })).toBe(false);
  });
  it('once a fallback channel is set, blocks without fallback account/template, and when fallback === primary', () => {
    expect(dcAddFormValid('SEND', { channel: 'WHATSAPP', account: 'x', templateId: 'CT-1', fallbackChannel: 'SMS', fallbackAccount: '', fallbackTemplateId: '' })).toBe(false);
    expect(dcAddFormValid('SEND', { channel: 'SMS', account: 'x', templateId: 'CT-1', fallbackChannel: 'SMS', fallbackAccount: 'x', fallbackTemplateId: 'CT-1' })).toBe(false);
    expect(dcAddFormValid('SEND', { channel: 'WHATSAPP', account: 'x', templateId: 'CT-1', fallbackChannel: 'SMS', fallbackAccount: 'x', fallbackTemplateId: 'CT-1' })).toBe(true);
  });
});

describe('Edit round-trip', () => {
  it('editing a Send name/channel never disturbs its auto Split/GOAL_EXIT subtree', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const sendP = { ...dcDefaultConfig('SEND'), name: 'Original', channel: 'WHATSAPP', account: 'IBL-Karix-Onb', templateId: 'CT-3310' };
    g = dcConfirmAddNode(g, 'SEND', sendP, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const before = Object.keys(g.nodes).length;
    const send = Object.values(g.nodes).find((n) => n.label === 'Original')!;
    const editedP = { ...send._config, name: 'Renamed' };
    g = dcConfirmEditNode(g, send.id, 'SEND', editedP, null);
    expect(Object.keys(g.nodes).length).toBe(before);
    expect(Object.values(g.nodes).some((n) => n.label === 'Renamed')).toBe(true);
    expect(Object.values(g.nodes).some((n) => n.label === 'Original')).toBe(false);
  });
});

describe('Branch insert/remove — the real data-integrity bug this reducer fixes', () => {
  it('inserting a branch mid-edit preserves every existing branch subtree and positions the new branch correctly', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const p = {
      name: 'Decision', source: 'Account attribute', attribute: 'Transaction Amount', outcome: 'Clicked',
      branches: [
        { id: 'b1', label: 'Branch 1', operator: 'Equals', value: '10', value2: '' },
        { id: 'b2', label: 'Branch 2', operator: 'Equals', value: '20', value2: '' },
      ],
    };
    g = dcConfirmAddNode(g, 'DECISION_SPLIT', p, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const ds = Object.values(g.nodes).find((n) => n.type === 'DECISION_SPLIT')!;
    const [edge0] = g.edges.filter((e) => e.from === ds.id);
    g = dcConfirmAddNode(g, 'EXIT', { reason: 'branch1 exit' }, { kind: 'edge', edgeId: edge0.id }, null);

    // Insert a new Branch 3 between Branch 1 and Branch 2.
    const editedP = {
      ...ds._config,
      branches: [p.branches[0], { id: 'b3', label: 'Branch 3', operator: 'Equals', value: '30', value2: '' }, p.branches[1]],
    };
    g = dcConfirmEditNode(g, ds.id, 'DECISION_SPLIT', editedP, null);

    const outs = g.edges.filter((e) => e.from === ds.id);
    expect(outs.length).toBe(4); // 3 branches + catch-all
    expect(outs.map((e) => e.branchLabel)).toEqual(['Branch 1 (10)', 'Branch 3 (30)', 'Branch 2 (20)', 'Anything else']);
    // Branch 1's subtree survived.
    const branch1Edge = outs.find((e) => e.branchLabel === 'Branch 1 (10)')!;
    expect(g.nodes[branch1Edge.to!]?.label).toBe('branch1 exit');
    // Branch 3 is a genuinely new open slot.
    const branch3Edge = outs.find((e) => e.branchLabel === 'Branch 3 (30)')!;
    expect(branch3Edge.to).toBeNull();
  });

  it('removing a branch cascade-GCs its subtree', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const p = {
      name: 'Decision', source: 'Account attribute', attribute: 'Transaction Amount', outcome: 'Clicked',
      branches: [
        { id: 'b1', label: 'Branch 1', operator: 'Equals', value: '10', value2: '' },
        { id: 'b2', label: 'Branch 2', operator: 'Equals', value: '20', value2: '' },
      ],
    };
    g = dcConfirmAddNode(g, 'DECISION_SPLIT', p, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const ds = Object.values(g.nodes).find((n) => n.type === 'DECISION_SPLIT')!;
    const [, edge1] = g.edges.filter((e) => e.from === ds.id);
    g = dcConfirmAddNode(g, 'EXIT', { reason: 'branch2 exit' }, { kind: 'edge', edgeId: edge1.id }, null);
    const beforeCount = Object.keys(g.nodes).length;

    const editedP = { ...ds._config, branches: [p.branches[0]] }; // remove Branch 2
    g = dcConfirmEditNode(g, ds.id, 'DECISION_SPLIT', editedP, null);

    expect(Object.keys(g.nodes).length).toBe(beforeCount - 1); // branch2's EXIT node gone
    expect(Object.values(g.nodes).some((n) => n.label === 'branch2 exit')).toBe(false);
    const outs = g.edges.filter((e) => e.from === ds.id);
    expect(outs.length).toBe(2); // 1 branch + catch-all
  });
});

describe('dcRemoveEdge', () => {
  it('reverts a Split branch to an open slot rather than deleting the edge', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const p = { customSource: 'Account attribute', outcome: '', customConditions: [{ attribute: 'Status', operator: 'Equals', value: 'Active' }] };
    g = dcConfirmAddNode(g, 'SPLIT', p, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const split = Object.values(g.nodes).find((n) => n.type === 'SPLIT')!;
    const yesEdge = g.edges.find((e) => e.from === split.id && dcPortOf(e) === 'yes')!;
    const beforeEdgeCount = g.edges.length;
    g = dcRemoveEdge(g, yesEdge.id);
    expect(g.edges.length).toBe(beforeEdgeCount); // edge stays, just reverted to open
    expect(g.edges.find((e) => e.id === yesEdge.id)!.to).toBeNull();
  });

  it('fully removes a plain growLeaf edge (no slot concept) and cascade-GCs its target', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const sendP = { ...dcDefaultConfig('SEND'), name: 'Msg1', channel: 'WHATSAPP', account: 'IBL-Karix-Onb', templateId: 'CT-3310' };
    g = dcConfirmAddNode(g, 'SEND', sendP, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const growEdge = g.edges.find((e) => e.from === g.rootId && e.branchLabel === '')!;
    g = dcRemoveEdge(g, growEdge.id);
    // Whole Send subtree (Send + its auto Split + auto GOAL_EXIT) cascade-removed.
    expect(Object.keys(g.nodes).length).toBe(1); // just the root Entry left
    expect(g.edges.length).toBe(0);
  });
});

describe('dcGraphHasOpenBranches validation', () => {
  it('a fresh Entry-only graph has open branches', () => {
    const g = addEntryEvent(EMPTY_GRAPH);
    expect(dcGraphHasOpenBranches(g)).toBe(true);
  });

  it('a fully resolved tree (every branch ends in GOAL_EXIT/EXIT) has none', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    g = dcConfirmAddNode(g, 'EXIT', { reason: 'done' }, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    expect(dcGraphHasOpenBranches(g)).toBe(false);
  });
});

// Milestone — an offer the program already has, plus a threshold the
// manager types. The four "Spend ₹X in first Y days" benefits that used to
// back this were invented and were removed outright, not renamed.
describe('Milestone — offer plus a typed threshold', () => {
  it('the invented spend-ladder benefits are gone from the offer list', () => {
    const names = MILESTONE_OFFERS.map((o) => o.name);
    for (const n of names) {
      expect(n).not.toMatch(/Spend ₹/);
      expect(n).not.toMatch(/first \d+ days/);
    }
    expect(MILESTONE_OFFERS.map((o) => o.id)).not.toContain('MS-1001');
  });

  it('a campaign still pointing at a removed benefit opens with the offer cleared, not remapped', () => {
    const rows = dcFiltersOf('SPLIT', { customSource: 'Milestone', milestone: { benefitId: 'MS-1001', operator: 'GTE', value: '80' } });
    expect(rows[0].field).toBe(''); // the manager picks a real offer
    expect(rows[0].operator).toBe('is at least'); // the typed threshold survives
    expect(rows[0].value).toBe('80');
    expect(dcFilterSentences(rows)).toEqual([]); // incomplete, so it is ignored
  });

  it("the old Completed choice resolves to no comparison rather than a guessed threshold", () => {
    const rows = dcFiltersOf('SPLIT', { customSource: 'Milestone', milestone: { benefitId: 'MS-1001', operator: 'IS', statusChoice: 'COMPLETED', value: '100' } });
    expect(rows[0].operator).toBe('');
    expect(dcFilterSentences(rows)).toEqual([]);
  });

  it('reads back as offer, comparison, typed value — percent by default', () => {
    const offer = MILESTONE_OFFERS[0];
    const row = { group: 'Milestone', field: offer.id, operator: 'is at least', value: '80' };
    expect(dcFilterSentence(row)).toBe(`${offer.name} is at least 80%`);
    expect(dcFilterSentence({ ...row, valueUnit: 'rupees' as const, value: '20000' })).toBe(`${offer.name} is at least ₹20,000`);
  });

  it('is between needs both bounds, and both carry the unit', () => {
    const offer = MILESTONE_OFFERS[1];
    expect(dcFilterRowComplete({ group: 'Milestone', field: offer.id, operator: 'is between', value: '25' })).toBe(false);
    const both = { group: 'Milestone', field: offer.id, operator: 'is between', value: '25', value2: '75' };
    expect(dcFilterRowComplete(both)).toBe(true);
    expect(dcFilterSentence(both)).toBe(`${offer.name} is between 25% and 75%`);
  });

  it('a row with no offer picked is ignored however complete the rest is', () => {
    expect(dcFilterRowComplete({ group: 'Milestone', field: '', operator: 'is at least', value: '80' })).toBe(false);
  });

  it('Branch: one offer, two arms with their own comparisons, plus a catch-all', () => {
    const offer = MILESTONE_OFFERS[2];
    let g = addEntryEvent(EMPTY_GRAPH);
    const p = {
      name: 'Milestone routing',
      what: { group: 'Milestone', field: offer.id },
      branches: [
        { id: 'b1', label: 'On track', operator: 'is at least', value: '80', valueUnit: 'percent' },
        { id: 'b2', label: 'Needs a nudge', operator: 'is less than', value: '40', valueUnit: 'percent' },
      ],
    };
    expect(dcAddFormValid('DECISION_SPLIT', p)).toBe(true);
    g = dcConfirmAddNode(g, 'DECISION_SPLIT', p, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const ds = Object.values(g.nodes).find((n) => n.type === 'DECISION_SPLIT')!;
    expect(ds.label).toBe(offer.name);
    expect(g.edges.filter((e) => e.from === ds.id).map((e) => e.branchLabel)).toEqual([
      'On track (≥ 80%)',
      'Needs a nudge (< 40%)',
      'Anything else',
    ]);
  });
});

// Parallel paths (fan-out) — a node sending EVERY customer down EVERY
// outgoing path, as opposed to a routing node sending each customer down
// exactly one. The reducer always supported this (growLeaf just appends
// another edge); what was missing was any way to ask for it, plus an
// analytics rule that didn't wrongly divide the arrivals.
describe('Fan-out — parallel paths from one node', () => {
  it('repeated growLeaf on the same node builds independent siblings, not a chain', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const entry = g.rootId!;
    g = dcConfirmAddNode(g, 'PAUSE', { duration: 30, unit: 'days' }, { kind: 'growLeaf', nodeId: entry }, null);
    g = dcConfirmAddNode(g, 'PAUSE', { duration: 90, unit: 'days' }, { kind: 'growLeaf', nodeId: entry }, null);
    g = dcConfirmAddNode(g, 'PAUSE', { duration: 180, unit: 'days' }, { kind: 'growLeaf', nodeId: entry }, null);
    const kids = g.edges.filter((e) => e.from === entry);
    expect(kids.length).toBe(3);
    // Each child is a leaf in its own right — none is chained under
    // another. (Each does carry one dangling open slot of its own, which
    // is what makes it a leaf, so this counts only real connections.)
    kids.forEach((e) => expect(g.edges.filter((x) => x.from === e.to && x.to !== null).length).toBe(0));
    expect(kids.map((e) => g.nodes[e.to!].label).sort()).toEqual(['Wait 180 days', 'Wait 30 days', 'Wait 90 days']);
  });

  it('dcRenameEdge names one path without touching its siblings', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    const entry = g.rootId!;
    g = dcConfirmAddNode(g, 'PAUSE', { duration: 30, unit: 'days' }, { kind: 'growLeaf', nodeId: entry }, null);
    g = dcConfirmAddNode(g, 'PAUSE', { duration: 90, unit: 'days' }, { kind: 'growLeaf', nodeId: entry }, null);
    const [first, second] = g.edges.filter((e) => e.from === entry);
    g = dcRenameEdge(g, first.id, '  Month 1  ');
    expect(g.edges.find((e) => e.id === first.id)!.branchLabel).toBe('Month 1'); // trimmed
    expect(g.edges.find((e) => e.id === second.id)!.branchLabel).toBe('');
  });

  it('routing vs fan-out is decided by node type, the one rule three places read', () => {
    // Routers: every outgoing path is mutually exclusive.
    expect(dcIsRoutingNode('SPLIT')).toBe(true);
    expect(dcIsRoutingNode('DECISION_SPLIT')).toBe(true);
    expect(dcIsRoutingNode('RANDOM_SPLIT')).toBe(true);
    expect(dcIsRoutingNode('GOAL_CHECK')).toBe(true);
    expect(dcIsRoutingNode('WAIT_UNTIL')).toBe(true);
    [...(['SPLIT', 'DECISION_SPLIT', 'RANDOM_SPLIT', 'GOAL_CHECK', 'WAIT_UNTIL'] as const)].forEach((t) => expect(dcCanFanOut(t)).toBe(false));
    // Terminals have no outgoing paths at all.
    expect(dcCanFanOut('EXIT')).toBe(false);
    // Everything else can hold genuinely parallel paths.
    expect(dcCanFanOut('ENTRY_EVENT')).toBe(true);
    expect(dcCanFanOut('ENTRY_SEGMENT')).toBe(true);
    expect(dcCanFanOut('SEND')).toBe(true);
    expect(dcCanFanOut('PAUSE')).toBe(true);
  });
});

// Goal Check became manually addable, and Condition's old "Goal" source
// was removed. Before this, the same question — "has the campaign Goal
// been achieved?" — could be built two ways that produced two different
// graphs: the auto Goal Check wired Yes straight to Goal Reached, while a
// Goal-source Condition left both arms open.
describe('Goal Check — one node type, one behaviour, added either way', () => {
  it('a hand-added Goal Check leaves both arms open — there is no Goal Reached to wire to', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    g = dcConfirmAddNode(g, 'GOAL_CHECK', dcDefaultConfig('GOAL_CHECK'), { kind: 'growLeaf', nodeId: g.rootId! }, TEST_GOAL);
    const check = Object.values(g.nodes).find((n) => n.type === 'GOAL_CHECK')!;
    expect(check).toBeTruthy();
    const yes = g.edges.find((e) => e.from === check.id && dcPortOf(e) === 'yes')!;
    const no = g.edges.find((e) => e.from === check.id && dcPortOf(e) === 'no')!;
    expect(yes.to).toBeNull();
    expect(no.to).toBeNull();
  });

  it('its question is derived live from the Goal, not stored on the node', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    g = dcConfirmAddNode(g, 'GOAL_CHECK', dcDefaultConfig('GOAL_CHECK'), { kind: 'growLeaf', nodeId: g.rootId! }, TEST_GOAL);
    const check = Object.values(g.nodes).find((n) => n.type === 'GOAL_CHECK')!;
    expect(check.label).toBe('Virtual card activated?');
    expect(check._config).toBeNull(); // nothing of its own to configure
  });

  it('a hand-added one is not flagged autoGenerated — that badge is for steps the builder added unasked', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    g = dcConfirmAddNode(g, 'GOAL_CHECK', dcDefaultConfig('GOAL_CHECK'), { kind: 'growLeaf', nodeId: g.rootId! }, TEST_GOAL);
    const check = Object.values(g.nodes).find((n) => n.type === 'GOAL_CHECK')!;
    expect(check.autoGenerated).toBe(false);
  });

  it("Condition no longer accepts a 'Goal' source — it isn't valid and builds nothing goal-related", () => {
    // The source is gone from the picker; if an old saved journey somehow
    // carried it, it simply fails the "must check something real" gate
    // rather than silently behaving like a Goal Check.
    expect(dcAddFormValid('SPLIT', { customSource: 'Goal', customConditions: [] }, TEST_GOAL)).toBe(false);
  });

  it('Goal Check is still in the Add Step list; Goal Reached is not a step any more', () => {
    expect(DC_STEP_TYPES).toContain('GOAL_CHECK');
    expect(DC_STEP_TYPES.map(String)).not.toContain('GOAL_EXIT');
  });
});

describe('Goal reconciliation', () => {
  // All that is left to reconcile is a Goal Check's question. No node is
  // wired to the goal any more: a Send grows nothing, and a Wait for Event
  // listens for whatever its author told it to.
  it("a Goal Check's question follows the goal", () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    g = dcConfirmAddNode(g, 'GOAL_CHECK', null, { kind: 'growLeaf', nodeId: g.rootId! }, TEST_GOAL);
    const before = Object.values(g.nodes).find((n) => n.type === 'GOAL_CHECK')!;
    expect(before.label).toBe('Virtual card activated?');
    before.autoGenerated = true; // reconcile only rewrites what it owns

    g = dcReconcileGoal(g, { ...TEST_GOAL, eventType: 'PIN set', conditions: [] });
    expect(Object.values(g.nodes).find((n) => n.type === 'GOAL_CHECK')!.label).toBe('PIN set?');
  });

  it('a hand-placed Wait for Event is left alone, whatever the goal says', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    g = dcConfirmAddNode(
      g,
      'WAIT_UNTIL',
      { ...dcDefaultConfig('WAIT_UNTIL'), eventCategory: 'Card Events', eventType: 'PIN set', duration: 3, unit: 'days' },
      { kind: 'growLeaf', nodeId: g.rootId! },
      TEST_GOAL,
    );
    g = dcReconcileGoal(g, { ...TEST_GOAL, eventType: 'Virtual card activated', conditions: [] });
    const wait = Object.values(g.nodes).find((n) => n.type === 'WAIT_UNTIL')!;
    expect((wait._config as { eventType?: string }).eventType).toBe('PIN set');
  });

  it('clearing the goal leaves the author\'s steps alone', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    g = dcConfirmAddNode(g, 'GOAL_CHECK', null, { kind: 'growLeaf', nodeId: g.rootId! }, TEST_GOAL);
    g = dcReconcileGoal(g, null);
    expect(Object.values(g.nodes).some((n) => n.type === 'GOAL_CHECK')).toBe(true);
  });
});


describe('Campaign validation (C3)', () => {
  function sendOn(g: DripGraph, name: string, at: Parameters<typeof dcConfirmAddNode>[3]) {
    const p = { ...dcDefaultConfig('SEND'), name, channel: 'WHATSAPP', account: 'IBL-Karix-Onb', templateId: 'CT-3310' };
    return dcConfirmAddNode(g, 'SEND', p, at, TEST_GOAL);
  }

  it('catches a node that was configured through the drawer and then edited into an invalid state', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    g = sendOn(g, 'Msg1', { kind: 'growLeaf', nodeId: g.rootId! });
    const send = Object.values(g.nodes).find((n) => n.label === 'Msg1')!;
    // Template cleared after the fact — the drawer never sees this again.
    send._config = { ...(send._config as object), templateId: '' };

    const issues = dcValidateCampaign(g, TEST_GOAL);
    expect(issues.some((i) => i.nodeId === send.id && i.message.includes('not fully configured'))).toBe(true);
  });

  it('catches a wait with no duration, which used to pass because Pause was never checked', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    g = dcConfirmAddNode(g, 'PAUSE', { duration: 0, unit: 'days' }, { kind: 'growLeaf', nodeId: g.rootId! }, null);
    const pause = Object.values(g.nodes).find((n) => n.type === 'PAUSE')!;
    const issues = dcValidateCampaign(g, null);
    expect(issues.some((i) => i.nodeId === pause.id && i.message.includes('not fully configured'))).toBe(true);
  });

  it('catches a node left unreachable from the entry step', () => {
    let g = addEntryEvent(EMPTY_GRAPH);
    g = sendOn(g, 'Msg1', { kind: 'growLeaf', nodeId: g.rootId! });
    const send = Object.values(g.nodes).find((n) => n.label === 'Msg1')!;
    // Sever it the way an orphaning mid-edge insert used to.
    g = { ...g, edges: g.edges.filter((e) => e.to !== send.id) };

    const issues = dcValidateCampaign(g, TEST_GOAL);
    expect(issues.some((i) => i.nodeId === send.id && i.message.includes('cannot be reached'))).toBe(true);
  });

  it('names the branch that still needs a next step, not just that one exists', () => {
    // A Pause grows nothing now, so the named-branch case comes from a step
    // that really does fork: a hand-added Goal Check, with its Yes and No.
    let g = addEntryEvent(EMPTY_GRAPH);
    g = dcConfirmAddNode(g, 'GOAL_CHECK', null, { kind: 'growLeaf', nodeId: g.rootId! }, TEST_GOAL);
    const issues = dcValidateCampaign(g, TEST_GOAL);
    expect(issues.some((i) => i.message.includes('"No" branch'))).toBe(true);
    expect(issues.some((i) => i.message.includes('"Yes" branch'))).toBe(true);
  });

  it('a complete campaign produces no issues', () => {
    // Entry -> Send -> End journey. That is a whole campaign now: conversion
    // takes people out of it without a step saying so.
    let g = addEntryEvent(EMPTY_GRAPH);
    g = sendOn(g, 'Msg1', { kind: 'growLeaf', nodeId: g.rootId! });
    const slot = g.edges.find((e) => e.to === null)!;
    g = dcConfirmAddNode(g, 'EXIT', { reason: 'Sequence exhausted' }, { kind: 'edge', edgeId: slot.id }, TEST_GOAL);
    expect(dcValidateCampaign(g, TEST_GOAL)).toEqual([]);
  });
});
