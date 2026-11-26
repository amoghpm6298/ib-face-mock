// Bringing a campaign built against the old goal model into the new one.
//
// The old model drew conversion on the canvas: a Goal Check node asked
// whether the goal had been achieved, and a Goal Reached node recorded that
// it had. Conversion is now a campaign setting evaluated continuously
// (DripGoal.exitOnConversion), so neither node exists any more.
//
// This is deliberately the CAUTIOUS version, for files we did not write —
// imported designer output, or anything saved before the change. Our own six
// seed campaigns were cleaned by hand instead, because there we know what
// each step was for: a Wait that existed only to listen for the goal became
// a plain Wait of the same length. Here we cannot know that, so a Wait is
// left exactly where it is, now leading to an End journey step. The result
// is a valid journey that says what the original said; simplifying it is the
// author's call, in front of the canvas.
import type { DripGraph, DripNode } from './graphTypes';
import { dcPortOf } from './ports';

// The two retired types, as they appear in a file. Not in DcNodeType any
// more, so they are matched as plain strings.
const GOAL_EXIT = 'GOAL_EXIT';
const GOAL_CHECK = 'GOAL_CHECK';

export interface GoalMigrationResult {
  graph: DripGraph;
  // What changed, for the caller to report. Empty when the file was already
  // on the new model.
  notes: string[];
}

export function dcMigrateGoalNodes(root: DripGraph): GoalMigrationResult {
  const nodes: Record<string, DripNode> = { ...root.nodes };
  let edges = root.edges.map((e) => ({ ...e }));
  const notes: string[] = [];
  const before = Object.keys(nodes).length;

  // 1. A Goal Reached becomes an End journey step, keeping whatever reason it
  //    carried. Converted in place rather than deleted, so every arm that led
  //    here still leads here — the journey keeps its shape.
  const reached = Object.values(nodes).filter((n) => String(n.type) === GOAL_EXIT);
  for (const n of reached) {
    const reason = ((n._config || {}) as { reason?: string }).reason || n.label || 'End journey';
    nodes[n.id] = { ...n, type: 'EXIT', label: reason, meta: '', _config: { reason } };
  }

  // 2. A Goal Check cannot fire once conversion ends the run, so it is removed
  //    and whatever its No arm led to takes its place. Its Yes arm is the path
  //    for someone who has already converted — nobody is still in the journey
  //    to take it, so that subtree goes with it.
  const checks = Object.values(nodes).filter((n) => String(n.type) === GOAL_CHECK);
  for (const check of checks) {
    const outs = edges.filter((e) => e.from === check.id);
    const no = outs.find((e) => dcPortOf(e) === 'no');
    const continuation = no ? no.to : null;
    for (const e of edges) if (e.to === check.id) e.to = continuation;
    edges = edges.filter((e) => e.from !== check.id);
    delete nodes[check.id];
  }
  if (checks.length) notes.push(`${checks.length} Goal Check step${checks.length > 1 ? 's' : ''} removed — conversion is a campaign setting now, checked everywhere rather than at one point.`);

  // 3. Whatever that orphaned. Unreachable steps cannot simply be left in
  //    place: the submit gate reports them, so the migration has to finish
  //    the job it started.
  if (root.rootId) {
    const seen = new Set<string>([root.rootId]);
    const queue = [root.rootId];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of edges) {
        if (e.from === cur && e.to && !seen.has(e.to)) {
          seen.add(e.to);
          queue.push(e.to);
        }
      }
    }
    for (const id of Object.keys(nodes)) if (!seen.has(id)) delete nodes[id];
    edges = edges.filter((e) => seen.has(e.from));
  }

  // Reported precisely, because this restructures someone else's campaign.
  // A Goal Reached that survived is a real step they still have; one that did
  // not was only ever recording a conversion that is now counted for them.
  const keptFromReached = reached.filter((n) => nodes[n.id]).length;
  const droppedFromReached = reached.length - keptFromReached;
  if (keptFromReached) notes.push(`${keptFromReached} Goal Reached step${keptFromReached > 1 ? 's' : ''} became End journey.`);
  if (droppedFromReached) notes.push(`${droppedFromReached} Goal Reached step${droppedFromReached > 1 ? 's' : ''} dropped — they only recorded a conversion, which is now counted without them.`);
  const dropped = before - Object.keys(nodes).length - checks.length - droppedFromReached;
  if (dropped > 0) notes.push(`${dropped} further step${dropped > 1 ? 's' : ''} dropped as no longer reachable.`);

  return { graph: { ...root, nodes, edges }, notes };
}

// Whether a file still carries either retired type — cheap enough to ask
// before doing any work, and it keeps `notes` empty for files that need none.
export function dcNeedsGoalMigration(root: { nodes?: Record<string, { type?: unknown }> } | null | undefined): boolean {
  if (!root?.nodes) return false;
  return Object.values(root.nodes).some((n) => String(n?.type) === GOAL_EXIT || String(n?.type) === GOAL_CHECK);
}
