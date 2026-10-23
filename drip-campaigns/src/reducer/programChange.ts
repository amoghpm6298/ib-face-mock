// What happens to a campaign's filters when its program changes.
//
// A program emits its own set of app events. Switching program can leave an
// app-activity filter pointing at an event the new program does not have, so
// that event is cleared. The ROW stays: its direction and window were real
// choices, and a row visibly waiting for an event is clearer than one that
// silently disappeared. Nothing else on the campaign is touched.
//
// Lives here rather than in data/filters.ts because it also has to recompute
// the affected node's canvas label, and labelMeta already depends on filters.
import type { DripGraph } from '../data/graphTypes';
import { dcBranchWhatOf, dcClearFiltersForEvents, dcFiltersOf } from '../data/filters';
import { dcRecomputeLabelMeta } from './labelMeta';
import type { DripGoal } from '../data/graphTypes';

export function dcPruneGraphForEvents(graph: DripGraph, availableEventIds: string[], goal: DripGoal | null = null): DripGraph {
  let changed = false;
  const nodes = { ...graph.nodes };

  for (const [id, node] of Object.entries(graph.nodes)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = node._config;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let nextConfig: any = config;

    if (node.type === 'DECISION_SPLIT') {
      // A Branch holds one shared event; clearing it also clears every
      // arm's details, which only meant something under that event.
      const what = dcBranchWhatOf(config);
      if (what.group === 'App activity' && what.field && !availableEventIds.includes(what.field)) {
        nextConfig = {
          ...(config || {}),
          what: { group: 'App activity', field: '' },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          branches: (config?.branches || []).map((b: any) => ({ ...b, details: {} })),
        };
      }
    } else {
      const rows = dcFiltersOf(node.type, config);
      const pruned = dcClearFiltersForEvents(rows, availableEventIds);
      if (pruned.some((r, i) => r !== rows[i])) nextConfig = { ...(config || {}), filters: pruned };
    }

    if (nextConfig !== config) {
      const { label, meta } = dcRecomputeLabelMeta(node.type, nextConfig, goal);
      nodes[id] = { ...node, _config: nextConfig, label, meta };
      changed = true;
    }
  }

  return changed ? { ...graph, nodes } : graph;
}
