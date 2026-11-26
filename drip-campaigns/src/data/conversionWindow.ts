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

// What counts as a conversion, in one sentence.
//
// Two forms of the same fact, from one function so they cannot drift. The
// Goal step shows the short one, because the window has its own field right
// underneath it and saying the number twice reads like a stutter. Review and
// the campaign view show the long one, because there is no field there to
// read the number off.
export function dcConversionSentence(
  goal: { eventType?: string; conversionWindow?: { duration: number; unit: string } } | null,
  opts: { withWindow?: boolean } = { withWindow: true },
): string {
  if (!goal?.eventType) return '';
  const base = `A conversion is someone doing ${goal.eventType} after they enter this campaign.`;
  if (!opts.withWindow) return base;
  const w = goal.conversionWindow;
  if (!w || !(Number(w.duration) > 0)) return `${base} No time limit is set, so anything counts.`;
  return `${base} It counts if it happens within ${w.duration} ${w.unit} of them entering. The held-back group is measured the same way.`;
}

// Why that number, said against the journey it has to cover. A window
// SHORTER than the journey is a real mistake and worth naming: the last
// message goes out after the clock has already stopped, so a conversion it
// caused is never counted.
export function dcWindowNote(
  goal: { conversionWindow?: { duration: number; unit: string } } | null,
  journeyDays: number,
): string {
  const w = goal?.conversionWindow;
  const days = w ? Number(w.duration) / (w.unit === 'hours' ? 24 : 1) : 0;
  const journey = Math.ceil(journeyDays);
  if (!(days > 0)) return 'Someone who converts months later probably was not nudged by this campaign, so a limit keeps the report honest.';
  if (journey > 0 && days < journey) {
    return `This journey runs about ${journey} days, so the last message goes out after this window closes. A conversion it caused would not be counted.`;
  }
  if (journey > 0) {
    return `This journey runs about ${journey} days, so that covers it with room after the last message. Someone who converts months later probably was not nudged by this campaign.`;
  }
  return 'Someone who converts months later probably was not nudged by this campaign, so a limit keeps the report honest.';
}
