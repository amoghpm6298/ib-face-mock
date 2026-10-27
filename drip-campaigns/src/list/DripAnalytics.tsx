// Per-campaign analytics — the journey itself is the funnel, not a separate
// linear chart, since a branching campaign cannot be drawn honestly as one
// column. Each step carries one count: how many people reached it. A step
// that divides people writes the split on its arrows and nowhere else.
import { useMemo, useState } from 'react';
import type { DripCampaign, DripGraph } from '../data/graphTypes';
import { generateDripAnalytics, type DripAnalyticsMetrics } from '../data/dripAnalytics';
import { DripCanvas } from '../canvas/DripCanvas';
import { StepDetailPanel } from './StepDetailPanel';

function fmt(n: number): string {
  return n.toLocaleString('en-IN');
}

// The chain a chosen arrow belongs to: back to the start, then forward for
// as long as there is exactly one way on. It stops at the next fork, because
// past that point the arrow no longer tells you where anyone went.
export function dcPathThroughEdge(graph: DripGraph, edgeId: string): { nodeIds: string[]; edgeIds: string[] } {
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (!edge) return { nodeIds: [], edgeIds: [] };
  const nodeIds: string[] = [];
  const edgeIds: string[] = [edge.id];

  let up: string | null = edge.from;
  const seen = new Set<string>();
  while (up && !seen.has(up)) {
    seen.add(up);
    nodeIds.unshift(up);
    const incoming = graph.edges.find((e) => e.to === up);
    if (!incoming) break;
    edgeIds.unshift(incoming.id);
    up = incoming.from;
  }

  let down: string | null = edge.to;
  while (down && !seen.has(down)) {
    seen.add(down);
    nodeIds.push(down);
    const outs = graph.edges.filter((e) => e.from === down && e.to);
    if (outs.length !== 1) break;
    edgeIds.push(outs[0].id);
    down = outs[0].to;
  }
  return { nodeIds, edgeIds };
}

function Total({ label, value, besideLabel, besideValue }: { label: string; value: string; besideLabel: string; besideValue: string }) {
  return (
    <div className="an-total">
      <div className="an-total-label">{label}</div>
      <div className="an-total-pair">
        <div>
          <div className="an-total-value">{value}</div>
        </div>
        <div className="an-total-beside">
          <div className="an-total-beside-label">{besideLabel}</div>
          <div className="an-total-beside-value">{besideValue}</div>
        </div>
      </div>
    </div>
  );
}

export function DripAnalytics({ campaign, hasRun }: { campaign: DripCampaign; hasRun: boolean }) {
  const data = useMemo(() => generateDripAnalytics(campaign), [campaign]);
  const [openNodeId, setOpenNodeId] = useState<string | null>(null);
  const [pathEdgeId, setPathEdgeId] = useState<string | null>(null);
  const graph = campaign.root;

  const path = useMemo(() => (graph && pathEdgeId ? dcPathThroughEdge(graph, pathEdgeId) : null), [graph, pathEdgeId]);

  if (!hasRun || !graph || !graph.rootId) {
    return <p className="an-empty">This campaign hasn't run yet, so there's nothing to show here.</p>;
  }

  const { totals, metrics } = data;
  const openNode = openNodeId ? graph.nodes[openNodeId] : null;

  return (
    <div>
      <div className="an-totals">
        <Total label="Entered" value={fmt(totals.entered)} besideLabel="Held back" besideValue={fmt(totals.control)} />
        <Total label="Reached the goal" value={fmt(totals.reachedGoal)} besideLabel="Held back, reached it anyway" besideValue={fmt(totals.controlReachedGoal)} />
      </div>

      {path && (
        <div className="an-path">
          <div className="an-path-head">
            <span>Following one path</span>
            <button className="an-path-clear" onClick={() => setPathEdgeId(null)}>
              Whole journey
            </button>
          </div>
          <ol className="an-path-list">
            {path.nodeIds.map((id) => {
              const n = graph.nodes[id];
              if (!n) return null;
              const count = (metrics as DripAnalyticsMetrics).nodeCounts[id];
              return (
                <li key={id}>
                  <span>{n.label}</span>
                  <span className="an-path-count">{count === undefined ? '—' : fmt(count)}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <div className="an-stage">
        <div className="card an-canvas">
          <DripCanvas
            graph={graph}
            goal={campaign.goal}
            editable={false}
            metrics={metrics}
            onInspectNode={setOpenNodeId}
            onSelectEdge={setPathEdgeId}
            pathNodeIds={path?.nodeIds}
            pathEdgeIds={path?.edgeIds}
          />
        </div>
        {openNode && <StepDetailPanel node={openNode} campaign={campaign} graph={graph} metrics={metrics} onClose={() => setOpenNodeId(null)} />}
      </div>
    </div>
  );
}
