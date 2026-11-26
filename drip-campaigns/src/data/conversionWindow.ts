// How long after entering a campaign a conversion still counts toward it.
//
// Suggested ONCE, when a goal is first set, and never recomputed. The number
// has to come from somewhere — "7 days" for a journey that runs three weeks
// would quietly under-count it — but a figure that silently changes as the
// author edits the canvas is worse than a wrong one they can see. After the
// suggestion it is theirs.
import type { DripGraph } from './graphTypes';

// A buffer past the end of the journey, so a conversion that happens shortly
// after the last message still counts. Three days, not a claim about the
// right number.
const DC_WINDOW_BUFFER_DAYS = 3;

// The waiting time along the longest branch. Sends take no time of their own
// since the delay moved out of them, so this is Waits and Wait-for-Event
// timeouts. Cycles are guarded by the visited set rather than assumed away.
export function dcJourneyLengthDays(graph: DripGraph | null | undefined): number {
  if (!graph?.rootId) return 0;
  const longestFrom = (id: string, seen: Set<string>): number => {
    const node = graph.nodes[id];
    if (!node) return 0;
    const cfg = (node._config || {}) as { duration?: number | string; unit?: string };
    const own =
      (node.type === 'PAUSE' || node.type === 'WAIT_UNTIL') && Number(cfg.duration) > 0
        ? Number(cfg.duration) / (cfg.unit === 'hours' ? 24 : 1)
        : 0;
    let best = 0;
    for (const e of graph.edges) {
      if (e.from === id && e.to && !seen.has(e.to)) {
        best = Math.max(best, longestFrom(e.to, new Set([...seen, e.to])));
      }
    }
    return own + best;
  };
  return longestFrom(graph.rootId, new Set([graph.rootId]));
}

export function dcSuggestConversionWindow(graph: DripGraph | null | undefined): { duration: number; unit: 'days' } {
  return { duration: Math.max(1, Math.ceil(dcJourneyLengthDays(graph)) + DC_WINDOW_BUFFER_DAYS), unit: 'days' };
}

// One sentence saying what will be counted, in the author's own terms. Read
// by the Goal step, Review and the campaign's details view, so none of the
// three can describe the rule differently.
export function dcConversionSentence(goal: { eventType?: string; conversionWindow?: { duration: number; unit: string } } | null): string {
  if (!goal?.eventType) return '';
  const w = goal.conversionWindow;
  const window = w && Number(w.duration) > 0 ? `within ${w.duration} ${w.unit}` : 'with no time limit set';
  return `A conversion is the first ${goal.eventType} by the same account after it enters, ${window}. The held-back group is measured the same way.`;
}
