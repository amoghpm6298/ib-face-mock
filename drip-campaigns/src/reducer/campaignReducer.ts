// Ported from journeysnudgesemi/emi-conversions-prototype.html's
// dcConfirmAddNode / dcConfirmEditNode / dcRemoveEdge / dcRemoveRoot /
// dcConfirmConnectExisting / dcReplaceAutoNode — reworked from mutating a
// global `dripWiz` object into a useReducer-compatible pure reducer.
// Every action below clones its input graph once, then runs the same
// mutate-style graph-op functions against that clone — same algorithms,
// new mutation target, per the migration plan.
import type { DripGraph, DripGoal, DripGoalCondition, DripQuietHours } from '../data/graphTypes';
import type { DcNodeType } from '../data/nodeMeta';
import { DC_EVENT_ENTITY, DC_PROMOTED_ATTR, dcNormalizeOperator } from '../data/sharedConstants';
import { dcNewEdgeId, dcNewNodeId } from './idGen';
import { dcReconcileBranchEdges, dcRemoveEdge as dcRemoveEdgeOp, dcRemoveGoalCheck as dcRemoveGoalCheckOp, dcRemoveRoot as dcRemoveRootOp } from './graphOps';
import { dcDecisionBranchSummary, dcGoalLabel, dcRecomputeLabelMeta } from './labelMeta';
import { dcAddFormValid } from './defaultConfig';
import { dcSendTimingOf } from '../data/sendTiming';

function cloneGraph(graph: DripGraph): DripGraph {
  return { nodes: structuredClone(graph.nodes), edges: structuredClone(graph.edges), rootId: graph.rootId };
}

// GOAL_CHECK is a real, first-class node type (Phase 1 IA, approved) — not
// a SPLIT with a `_config.basis === 'Goal reached'` flag. A node is a
// Goal Check purely by virtue of its type; there's no meta-string
// matching or `_config` shape to inspect, since it carries no
// configuration of its own at all.
export function dcIsGoalCheckNode(node: { type: string }): boolean {
  return node.type === 'GOAL_CHECK';
}

// Where a new node attaches: the very first node in the campaign, filling
// an existing open slot, growing a brand-new leaf off an existing node, or
// splicing into an edge that already connects two real nodes.
export type DcAddingAt = { kind: 'root' } | { kind: 'edge'; edgeId: string } | { kind: 'growLeaf'; nodeId: string } | { kind: 'midEdge'; edgeId: string };

// ---------------------------------------------------------------------------
// Does this event-shaped step MEAN the goal, or merely share its event?
//
// Asked of a Wait for Event before wiring it to Goal Reached, and of an
// Entry · Event before letting a campaign submit: if entering the campaign
// already satisfies the goal, the goal measures nothing.
//
// Matching the goal's event category and type is not enough to call the
// event firing "goal achieved". A goal of "Transaction, amount is at least
// ₹5,000" with a wait on "Transaction" and no filters fires on a ₹50 coffee,
// and wiring that straight to Goal Reached records a goal that was never
// achieved — the one error analytics can never recover from, since a false
// conversion is indistinguishable from a real one afterwards.
//
// Equal or NARROWER qualifies. Conditions on a wait are AND'd, so carrying
// more of them than the goal does only ever matches fewer customers, and
// everyone it matches has met the goal. What disqualifies a wait is being
// BROADER: missing one of the goal's own conditions, or leaving blank a
// scoping field or card detail the goal names.
//
// Deliberately conservative where it cannot tell. An operator spelling it
// does not recognise, or a value shape it cannot compare, reads as "does not
// meet the goal" — which inserts a real check rather than asserting one. The
// costs are not symmetric: an unnecessary Goal Check is visible on the canvas
// and removable in one click, while a false Goal Reached is silent.
// ---------------------------------------------------------------------------
function valuesOf(c: { value?: string; values?: string[]; value2?: string }): string {
  // A condition saved before multi-select existed carries only `value`;
  // dcSelectedMulti reads that as a one-item set, and so does this.
  const set = c.values && c.values.length ? [...c.values] : c.value ? [c.value] : [];
  return JSON.stringify([set.map((v) => String(v).trim()).sort(), String(c.value2 ?? '').trim()]);
}

function sameCondition(a: DripGoalCondition, b: DripGoalCondition): boolean {
  return (
    String(a.attribute ?? '').trim() === String(b.attribute ?? '').trim() &&
    dcNormalizeOperator(a.operator) === dcNormalizeOperator(b.operator) &&
    valuesOf(a) === valuesOf(b)
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dcEventMeetsGoal(p: any, goal: DripGoal | null): boolean {
  if (!goal || !goal.eventType) return false;
  p = p || {};
  if (goal.eventCategory !== p.eventCategory || goal.eventType !== p.eventType) return false;

  const mine: DripGoalCondition[] = p.conditions || [];
  for (const need of goal.conditions || []) {
    if (!mine.some((have) => sameCondition(have, need))) return false;
  }

  for (const key of ['journey', 'batch', 'offerType', 'offerName'] as const) {
    const want = String(goal[key] ?? '').trim();
    if (want && String(p[key] ?? '').trim() !== want) return false;
  }

  for (const [key, want] of Object.entries(goal.cardDetails || {})) {
    if (!want) continue; // an empty detail on the goal means any value
    if (String((p.cardDetails || {})[key] ?? '').trim() !== String(want).trim()) return false;
  }
  return true;
}

// What a Wait For Event wires beneath it.
//
// Nothing about the goal any more. Conversion is a campaign setting that is
// evaluated continuously (DripGoal.exitOnConversion), so a wait has no
// business shortcutting to a "goal reached" step: it would be a second
// source of truth for the same fact, and one that only looks at the moment
// the customer happens to be standing here.
//
// What survives is the one thing that was never about the goal: an event
// with several possible outcomes. EMI_STATUS_CHANGED fires the same event
// for Successful, Failed, Expired and Cancelled, so "the event happened" is
// not an answer on its own. Those get an outcome Condition with both arms
// open, for the author to define. Everything else leaves both arms open.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dcAttachWaitOutcome(next: DripGraph, id: string, p: any): void {
  const entity = DC_EVENT_ENTITY[p.eventCategory];
  const statusAttr = DC_PROMOTED_ATTR[entity];
  if (statusAttr) {
    const splitId = dcNewNodeId();
    next.nodes[splitId] = { id: splitId, type: 'SPLIT', label: `${statusAttr}?`, meta: 'Define what counts as success for this outcome', _config: null, autoGenerated: true };
    next.edges.push({ id: dcNewEdgeId(), from: id, to: splitId, branchLabel: '', autoGenerated: true, port: 'next' });
    next.edges.push({ id: dcNewEdgeId(), from: splitId, to: null, branchLabel: 'Success outcome', autoGenerated: false, port: 'yes' });
    next.edges.push({ id: dcNewEdgeId(), from: splitId, to: null, branchLabel: 'Other outcome', autoGenerated: false, port: 'no' });
  } else {
    next.edges.push({ id: dcNewEdgeId(), from: id, to: null, branchLabel: 'Event received', autoGenerated: false, port: 'event' });
  }
  next.edges.push({ id: dcNewEdgeId(), from: id, to: null, branchLabel: 'Timed out', autoGenerated: false, port: 'timeout' });
}

// Builds the new node (via dcRecomputeLabelMeta, so label/meta logic lives
// in exactly one place, shared with editing), then any type-specific
// auto-children as real graph nodes/edges (a Send's own goal-check, a Wait
// Until's outcome check, a Split's auto Yes-branch, a Random/Decision
// Split's open arms), then attaches the whole thing to whichever
// slot/leaf this add action started from.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dcConfirmAddNode(graph: DripGraph, type: DcNodeType, p: any, addingAt: DcAddingAt, goal: DripGoal | null): DripGraph {
  const next = cloneGraph(graph);
  const { label, meta } = dcRecomputeLabelMeta(type, p, goal);
  const id = dcNewNodeId();
  next.nodes[id] = { id, type, label, meta, _config: structuredClone(p), autoGenerated: false };

  // A Send is followed by a WAIT FOR EVENT on the goal, never by a bare
  // Goal Check.
  //
  // The old rule auto-inserted a Goal Check after a Send as well as after
  // a Pause. After a Send, zero time has passed — the customer cannot
  // have opened the message, let alone acted on it — so that check could
  // only ever catch people who had already converted BEFORE the campaign
  // messaged them. It answered No for everyone else, every time, and the
  // last one in a sequence routed the whole cohort to "Sequence
  // exhausted" before the final message had been delivered.
  //
  // Waiting on the goal event instead is both correct and more precise:
  // it exits the moment the customer converts rather than at the next
  // checkpoint, so nobody receives the next reminder after converting.
  // Wait For Event already carries a timeout, and already auto-wires to
  // Goal Reached when the awaited event is the goal — this just reaches
  // for it automatically instead of leaving the author to know.
  if (type === 'SEND') {
    // No auto-inserted wait on the goal any more. A Send used to grow a
    // Wait For Event listening for the goal, which was the best a
    // positional model could do; with conversion evaluated continuously
    // the wait is redundant, and it put a step on the canvas that the
    // author never asked for and mostly had to work around.
    next.edges.push({ id: dcNewEdgeId(), from: id, to: null, branchLabel: '', autoGenerated: false, port: 'next' });
  } else if (type === 'PAUSE') {
    // Nor here. A Pause was the one place a Goal Check genuinely had time
    // behind it, but it is still only a check at one point in the journey.
    next.edges.push({ id: dcNewEdgeId(), from: id, to: null, branchLabel: '', autoGenerated: false, port: 'next' });
  } else if (type === 'WAIT_UNTIL') {
    dcAttachWaitOutcome(next, id, p);
  } else if (type === 'SPLIT') {
    // A user-built Condition asks "does the customer satisfy these
    // conditions?" — it has no built-in relationship to the campaign
    // goal, so unlike GOAL_CHECK it never auto-wires a Yes branch to
    // Goal Reached. Both arms are left open; if "this branch means the
    // goal was achieved" is genuinely what's meant, Goal Reached is
    // still available to add manually on either arm (§5/§10A — disabled
    // elsewhere in the taxonomy, but enabled here, since this is exactly
    // the already-forked branch-arm context that's meant for).
    next.edges.push({ id: dcNewEdgeId(), from: id, to: null, branchLabel: 'Yes', autoGenerated: false, port: 'yes' });
    next.edges.push({ id: dcNewEdgeId(), from: id, to: null, branchLabel: 'No', autoGenerated: false, port: 'no' });
  } else if (type === 'GOAL_CHECK') {
    // Only reachable while exit on conversion is OFF — with it on, an
    // account that converts has already left, so this could only answer No.
    //
    // Both arms open: there is no Goal Reached step to wire Yes to any
    // more, and what follows "yes, they converted" is the author's to say.
    next.edges.push({ id: dcNewEdgeId(), from: id, to: null, branchLabel: 'Yes', autoGenerated: false, port: 'yes' });
    next.edges.push({ id: dcNewEdgeId(), from: id, to: null, branchLabel: 'No', autoGenerated: false, port: 'no' });
  } else if (type === 'DECISION_SPLIT') {
    // One open edge per real branch, evaluated top-to-bottom on the canvas
    // the same order they're listed here, plus one final fixed "Anything
    // else" catch-all edge.
    p.branches.forEach((b: { id?: string; label: string }) => {
      next.edges.push({ id: dcNewEdgeId(), from: id, to: null, branchLabel: `${b.label} (${dcDecisionBranchSummary(p, b as never)})`, branchId: b.id, autoGenerated: false, port: 'branch' });
    });
    next.edges.push({ id: dcNewEdgeId(), from: id, to: null, branchLabel: 'Anything else', autoGenerated: false, port: 'else' });
  } else if (type === 'RANDOM_SPLIT') {
    p.branches.forEach((b: { id?: string; label: string; pct: number }) => {
      next.edges.push({ id: dcNewEdgeId(), from: id, to: null, branchLabel: `${b.label} (${b.pct}%)`, branchId: b.id, autoGenerated: false, port: 'branch' });
    });
  }

  if (addingAt.kind === 'root') next.rootId = id;
  else if (addingAt.kind === 'edge') {
    const e = next.edges.find((e) => e.id === addingAt.edgeId);
    if (e) e.to = id;
  } else if (addingAt.kind === 'growLeaf') {
    next.edges.push({ id: dcNewEdgeId(), from: addingAt.nodeId, to: id, branchLabel: '', autoGenerated: false, port: 'next' });
  } else if (addingAt.kind === 'midEdge') {
    // Splice the new node into an edge that already connects two real
    // nodes — the edge now points at the new node instead of its original
    // target, and whatever the new node's own auto-children left open gets
    // reattached to that original target, so the rest of the chain is
    // never lost. Only safe when the new node (plus its auto-children)
    // left exactly ONE dangling continuation edge — a branching type
    // (Random/Decision Split) leaves several open arms with no single
    // correct one to reattach, so the UI restricts which types are
    // offered for a midEdge insert to the single-continuation ones
    // (Send, Pause, Wait Until, Conditional Split) —
    // this is defensive, not the primary guard.
    const e = next.edges.find((e) => e.id === addingAt.edgeId);
    if (e && e.to) {
      const originalTarget = e.to;
      e.to = id;
      const reachable = new Set<string>([id]);
      const queue = [id];
      while (queue.length) {
        const cur = queue.shift()!;
        next.edges.filter((e2) => e2.from === cur && e2.to).forEach((e2) => {
          if (!reachable.has(e2.to!)) {
            reachable.add(e2.to!);
            queue.push(e2.to!);
          }
        });
      }
      const openEdges = next.edges.filter((e2) => reachable.has(e2.from) && e2.to === null);
      if (openEdges.length === 1) openEdges[0].to = originalTarget;
    }
  }

  return next;
}

// Recomputes only label+meta for an existing node's new config and
// reconciles branch edges where relevant — never touches unrelated
// children. Editing must never regenerate a subtree; whatever's already
// built under a node stays exactly as it was.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dcConfirmEditNode(graph: DripGraph, nodeId: string, type: DcNodeType, p: any, goal: DripGoal | null): DripGraph {
  const next = cloneGraph(graph);
  const node = next.nodes[nodeId];
  if (!node) return next;
  const { label, meta } = dcRecomputeLabelMeta(type, p, goal);
  node.label = label;
  node.meta = meta;
  // The form owns every field it renders, so its config replaces the old one
  // wholesale. A stale value that no form owns is a bug, not a feature.
  node._config = structuredClone(p);

  // Random Split / Decision Split branches are real outgoing edges —
  // whatever's been built under each arm must survive an edit, including
  // one that adds, removes, or inserts a branch in the middle.
  if (type === 'RANDOM_SPLIT') {
    dcReconcileBranchEdges(next, nodeId, p.branches, (b) => `${(b as { label: string }).label} (${(b as { pct: number }).pct}%)`, null);
  }
  if (type === 'DECISION_SPLIT') {
    dcReconcileBranchEdges(next, nodeId, p.branches, (b) => `${(b as { label: string }).label} (${dcDecisionBranchSummary(p, b as never)})`, 'Anything else');
  }

  // Unlike the old model, a user-built Condition (SPLIT) never auto-wires
  // its Yes branch to Goal Reached (see dcConfirmAddNode) — there's no
  // stale auto-exit to reconcile here when its condition changes. GOAL_CHECK
  // nodes (the ones that DO always mean "the campaign goal") are never
  // edited through this path at all — they carry no configuration, so
  // there's nothing for a form to submit in the first place.

  return next;
}

// ---------------------------------------------------------------------------
// Goal reconciliation
//
// Auto-generated goal wiring is derived from the goal AT THE MOMENT a node is
// added. The goal stays editable afterwards, so without this the two drift:
// a Goal Check keeps asking the old question, a Goal Reached keeps naming the
// old outcome, and — since a Send's wait now carries the goal's own event and
// conditions — a wait keeps listening for an event that is no longer the goal
// and still exits to Goal Reached when it fires.
//
// Only autoGenerated nodes are touched. Anything the author placed by hand is
// theirs, and is reported by dcGoalWiringIssues instead of being rewritten.
// ---------------------------------------------------------------------------
export function dcReconcileGoal(graph: DripGraph, goal: DripGoal | null): DripGraph {
  const next = cloneGraph(graph);
  const goalLabel = dcGoalLabel(goal);
  let changed = false;

  for (const n of Object.values(next.nodes)) {
    if (!n.autoGenerated) continue;

    if (n.type === 'GOAL_CHECK') {
      const want = (goalLabel || 'Goal') + '?';
      if (n.label !== want) { n.label = want; changed = true; }
      continue;
    }
}
  return changed ? next : graph;
}

// ---------------------------------------------------------------------------
// Campaign validation (submit gate)
//
// Until this existed, Submit checked only that the campaign had a name, an
// issuer, a root and no open slots. Node configuration was checked in exactly
// one place — the drawer's own primary button — so anything that reached the
// graph by another route was never re-examined: imported nodes with partial
// config, the Condition auto-inserted after a Wait For Event (which carries
// no config at all and therefore checks nothing), nodes whose event filter
// was cleared by a program change, and any node edited into an invalid state
// and left there.
//
// Every issue carries the node it belongs to so the UI can offer a jump.
// ---------------------------------------------------------------------------
export interface DripIssue {
  nodeId: string | null;
  message: string;
}

// ---------------------------------------------------------------------------
// The campaign's own setup — who it is for and when it runs.
//
// These used to be checked, when they were checked at all, in a ternary chain
// inside the Builder's own render, which is the same split brain C3 fixed for
// node config: one rule in the gate, another in a component. Everything the
// submit gate refuses now comes from one list, so the banner can name any of
// it the same way.
// ---------------------------------------------------------------------------
export interface DripCampaignSetup {
  name: string;
  issuer: string;
  applyToAllPrograms?: boolean;
  programs?: string[];
  controlPct?: number;
  startDate?: string;
  endDate?: string;
  quietHours?: DripQuietHours;
  goal?: DripGoal | null;
}

// Today as YYYY-MM-DD in the viewer's own timezone. The date fields are
// datetime-local, so a stored value is "YYYY-MM-DDTHH:mm" and its first ten
// characters are the calendar day. This app has no timezone model at all, so
// the comparisons below are made on whole days: an end date is "past" only
// once its day is behind us, never because a time of day has gone by.
function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dcValidateSetup(setup: DripCampaignSetup): DripIssue[] {
  const issues: DripIssue[] = [];
  const at = (message: string) => issues.push({ nodeId: null, message });

  if (!String(setup.name || '').trim()) at('Give this campaign a name before submitting.');
  if (!String(setup.issuer || '').trim()) at('Choose an issuer before submitting.');
  // An issuer with no programs and the toggle off reaches nobody: the
  // campaign is complete, valid and addressed to an empty audience.
  else if (!setup.applyToAllPrograms && !(setup.programs || []).length) {
    at('No programs are selected, so this campaign would reach nobody. Pick at least one, or apply it to all programs.');
  }

  // The control group is bounded by the input's own min/max, which a paste or
  // a restored draft never passes through, and an emptied field reads as NaN.
  const pct = Number(setup.controlPct);
  if (setup.controlPct !== undefined) {
    if (!Number.isFinite(pct) || !Number.isInteger(pct)) at('The control group must be a whole percentage.');
    else if (pct < 0 || pct > 50) at('The control group must be between 0% and 50%.');
  }

  // A goal with no usable window counts nothing, which is not what anyone
  // means by setting a goal.
  const win = setup.goal?.eventType ? setup.goal.conversionWindow : undefined;
  if (setup.goal?.eventType) {
    if (!win || !Number.isFinite(Number(win.duration)) || Number(win.duration) <= 0) {
      at('Set a conversion window — how long after entering a conversion still counts.');
    }
  }

  const q = setup.quietHours;
  if (q && q.enabled) {
    if (!q.start || !q.end) at('Quiet hours need a start and an end time.');
    else if (q.start === q.end) at('Quiet hours start and end at the same time, which blocks every hour of the day.');
  }

  const start = String(setup.startDate || '').trim();
  const end = String(setup.endDate || '').trim();
  if (start && end && end < start) at('The end date is before the start date.');
  const endDay = end.slice(0, 10);
  // An end date already past means the campaign can never run — true whether
  // this is a new campaign or an edit of an old one. A START date in the past
  // is deliberately NOT flagged: editing a campaign that began last month is
  // the ordinary case, and the builder cannot tell the two apart.
  if (endDay && endDay < todayISO()) at('The end date has already passed, so this campaign would never run.');
  return issues;
}

export function dcValidateCampaign(graph: DripGraph, goal: DripGoal | null, setup?: DripCampaignSetup): DripIssue[] {
  const issues: DripIssue[] = setup ? dcValidateSetup(setup) : [];
  if (!graph.rootId) {
    issues.push({ nodeId: null, message: 'Add an entry step before submitting.' });
    return issues;
  }

  // What can actually be reached from the entry step. A mid-edge insert that
  // left more than one open arm used to drop the rest of the chain here —
  // still present in `nodes`, still counted on Review, never walked.
  const reachable = new Set<string>([graph.rootId]);
  const queue = [graph.rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of graph.edges) {
      if (e.from === cur && e.to && !reachable.has(e.to)) {
        reachable.add(e.to);
        queue.push(e.to);
      }
    }
  }
  for (const n of Object.values(graph.nodes)) {
    if (!reachable.has(n.id)) {
      issues.push({ nodeId: n.id, message: `"${n.label}" cannot be reached from the entry step.` });
    }
  }

  for (const id of reachable) {
    const n = graph.nodes[id];
    if (!n) continue;

    // The same rule the drawer enforces, applied to what was actually saved.
    if (!dcAddFormValid(n.type, n._config)) {
      issues.push({ nodeId: n.id, message: `"${n.label}" is not fully configured.` });
    }

    // A delay stored inside a Send, from before delays moved out into Wait
    // steps. Reported rather than migrated: turning one into a Wait changes
    // the shape of the journey, and where that step goes — before or after a
    // branch, with or without its own goal check — is the author's call.
    if (n.type === 'SEND' && dcSendTimingOf(n._config).kind === 'legacyDelay') {
      issues.push({
        nodeId: n.id,
        message: `"${n.label}" waits inside the send. Nothing on the canvas shows that wait and it does not stop when the goal is reached. Add a Wait step before it instead.`,
      });
    }

    // A branch with nowhere to go strands whoever takes it.
    const outs = graph.edges.filter((e) => e.from === n.id);
    const terminal = n.type === 'EXIT';
    if (!terminal && outs.length === 0) {
      issues.push({ nodeId: n.id, message: `"${n.label}" has no next step.` });
    }
    for (const e of outs) {
      if (e.to === null) {
        const which = e.branchLabel ? `its "${e.branchLabel}" branch` : 'its next step';
        issues.push({ nodeId: n.id, message: `"${n.label}" still needs ${which}.` });
      }
    }
    if (terminal && outs.length > 0) {
      issues.push({ nodeId: n.id, message: `"${n.label}" is an exit, so nothing can follow it.` });
    }
  }

  // A campaign whose entry already satisfies its own goal measures nothing:
  // everyone converts on arrival, the funnel reads 100%, and no message in it
  // can have caused anything. Judged by the same predicate comparison the
  // waits use, so a BROADER entry is fine — entering on any transaction while
  // aiming for one over ₹5,000 is a real campaign. What is not is an entry
  // that already means the goal.
  const root = graph.nodes[graph.rootId];
  if (root && root.type === 'ENTRY_EVENT' && dcEventMeetsGoal(root._config, goal)) {
    issues.push({
      nodeId: root.id,
      message: `Everyone who enters has already achieved the goal — "${root.label}" is the goal event itself. Narrow the goal, or start the campaign on an earlier event.`,
    });
  }

  return issues;
}

export function dcRemoveEdge(graph: DripGraph, edgeId: string): DripGraph {
  const next = cloneGraph(graph);
  dcRemoveEdgeOp(next, edgeId);
  return next;
}

// Names one edge directly, for a fan-out path whose label has no other
// owner (see dcCanFanOut in nodeMeta.ts). A routing node's edge labels
// are derived from that node's own config instead — Branch/Experiment
// from `branches[]` via dcReconcileBranchEdges, Condition/Goal Check/
// Wait for Event fixed to 'Yes'/'No' at creation — so this is never
// offered for those, and never has to compete with them for ownership.
export function dcRenameEdge(graph: DripGraph, edgeId: string, branchLabel: string): DripGraph {
  const next = cloneGraph(graph);
  const edge = next.edges.find((e) => e.id === edgeId);
  if (edge) edge.branchLabel = branchLabel.trim();
  return next;
}

export function dcRemoveRoot(graph: DripGraph): DripGraph {
  const next = cloneGraph(graph);
  dcRemoveRootOp(next);
  return next;
}

export function dcRemoveGoalCheck(graph: DripGraph, splitNodeId: string): DripGraph {
  const next = cloneGraph(graph);
  dcRemoveGoalCheckOp(next, splitNodeId);
  return next;
}
