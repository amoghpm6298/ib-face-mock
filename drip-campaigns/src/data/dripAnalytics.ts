// Deterministic, illustrative per-campaign analytics — there's no real
// engagement data anywhere in this app's data model (seed campaigns are
// just the graph + metadata), so this generates plausible numbers from
// the campaign's own id + graph shape, same "seeded, not Math.random()"
// convention used throughout the original prototype's own mock data.
//
// The model: a fixed pool of customers matched the entry criteria, split
// into Control (held back, never enters the sequence — controlPct) and
// the treatment group that actually walks the graph. Counts propagate
// forward through the graph in topological order (a merge/"connect to
// existing" target only fans its own count out once every incoming edge
// has contributed), so a node reached from two branches correctly sums
// both paths before continuing. A Random/Decision Split's branches split
// by their own real encoded percentage (already in the branch label);
// a plain Yes/No goal-check split uses a seeded, modest "reached the
// goal at this checkpoint" rate; a single-outgoing linear hop applies a
// small flat attrition (opt-outs/delivery failures) rather than passing
// the count through unchanged.
import type { DripCampaign, DripEdge, DripNode } from './graphTypes';
import { dcIsRoutingNode } from './nodeMeta';
import { dcPortOf } from './ports';

export interface DripAnalyticsMetrics {
  nodeCounts: Record<string, number>;
  edgeCounts: Record<string, { count: number; pct: number }>;
  // Per-channel engagement — only present for SEND nodes.
  // CleverTap's own analytics separate this ("Engagement Stats") from
  // raw per-node reach counts ("Node Stats") for exactly this reason: a
  // Send reaching 10,000 people and a Send that reached 10,000 people AND
  // got opened by half of them are different facts worth showing
  // separately, not folded into one number.
  engagementByNodeId: Record<string, { deliveredPct: number; openedPct: number; clickedPct: number }>;
  // People sitting on a wait right now, out of the number that reached it.
  // Only present for the two waiting node types.
  waitingByNodeId: Record<string, number>;
  // Conversions credited to the last message an account received before it
  // converted. Only on SEND nodes, and they sum to the campaign total.
  conversionsByNodeId: Record<string, number>;
  // Where accounts were standing when they converted, when converting takes
  // them out of the journey. Empty when it does not: with exit off nobody
  // leaves at the moment of conversion, so there is no "here" to name.
  convertedHereByNodeId: Record<string, number>;
}

export interface DripAnalyticsTotals {
  totalMatched: number;
  control: number;
  entered: number;
  reachedGoal: number;
  exitedWithoutGoal: number;
  stillActive: number;
  conversionRate: number;
  // What the held-back group did without ever being messaged, over the SAME
  // window as the messaged group — measuring the two on different clocks
  // would make the comparison meaningless. Illustrative, from the same seed
  // as everything else, and drawn independently: a campaign that did nothing
  // should be able to show that.
  controlReachedGoal: number;
  controlConversionRate: number;
  // The window both groups were measured over, so the report can say it
  // rather than leave the reader to find it on another tab.
  conversionWindowDays: number | null;
}

export interface DripAnalyticsData {
  metrics: DripAnalyticsMetrics;
  totals: DripAnalyticsTotals;
}

function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

// mulberry32 — small, fast, deterministic PRNG from a single integer seed.
function mulberry32(seed: number): () => number {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// An Experiment's allocation comes from the node that owns it, matched by
// branch id. It used to be parsed back out of the edge's display text with
// /\((\d+)%\)/, which meant the split a campaign actually reported depended on
// how its arms happened to be WRITTEN: this repo's own DRIP-002 labels its
// arms "50% WhatsApp", with no parentheses, so its configured 50/50 matched
// nothing and the campaign was reported on a random split instead — while
// DRIP-006's "WhatsApp-first (60%)" matched and was honoured. The regex
// survives only for a legacy edge with no branch id to match on.
function allocationOf(source: DripNode | undefined, edge: DripEdge): number | null {
  const branches = ((source?._config || {}) as { branches?: { id?: string; pct?: number }[] }).branches;
  if (branches && edge.branchId) {
    const b = branches.find((x) => x.id === edge.branchId);
    if (b && Number.isFinite(Number(b.pct))) return Number(b.pct) / 100;
  }
  const m = edge.branchLabel.match(/\((\d+)%\)/);
  return m ? parseInt(m[1], 10) / 100 : null;
}

function computeSplitPcts(edges: DripEdge[], rand: () => number, source?: DripNode): number[] {
  const explicit: (number | null)[] = edges.map((e) => allocationOf(source, e));
  const explicitSum = explicit.reduce((s: number, v) => s + (v || 0), 0);
  const unexplicitCount = explicit.filter((v) => v === null).length;

  if (unexplicitCount === 0) {
    const sum = explicitSum || 1;
    return explicit.map((v) => (v || 0) / sum);
  }
  if (explicitSum > 0) {
    const remainder = Math.max(0, 1 - explicitSum);
    const each = remainder / unexplicitCount;
    return explicit.map((v) => (v === null ? each : (v as number)));
  }
  // A yes/no fork, by port rather than by the words on it.
  if (edges.length === 2 && dcPortOf(edges[0]) === 'yes' && dcPortOf(edges[1]) === 'no') {
    const yesPct = 0.1 + rand() * 0.2; // a modest 10-30% reach the goal at this specific checkpoint
    return [yesPct, 1 - yesPct];
  }
  const base = 1 / edges.length;
  const raw = edges.map(() => Math.max(0.02, base + (rand() - 0.5) * 0.1 * base));
  const sum = raw.reduce((s, v) => s + v, 0);
  return raw.map((v) => v / sum);
}

export function generateDripAnalytics(campaign: DripCampaign): DripAnalyticsData {
  const rand = mulberry32(seedFromId(campaign.id));
  const totalMatched = Math.round(8000 + rand() * 12000);
  const control = Math.round((totalMatched * (campaign.controlPct || 0)) / 100);
  const entered = totalMatched - control;

  const nodeCounts: Record<string, number> = {};
  const edgeCounts: Record<string, { count: number; pct: number }> = {};
  const engagementByNodeId: Record<string, { deliveredPct: number; openedPct: number; clickedPct: number }> = {};
  const waitingByNodeId: Record<string, number> = {};
  let exitedWithoutGoal = 0;
  let stillActive = 0;

  const graph = campaign.root;
  if (graph && graph.rootId) {
    const incomingEdges: Record<string, DripEdge[]> = {};
    graph.edges.forEach((e) => {
      if (e.to) (incomingEdges[e.to] ||= []).push(e);
    });
    const remainingIndegree: Record<string, number> = {};
    Object.keys(graph.nodes).forEach((id) => {
      remainingIndegree[id] = (incomingEdges[id] || []).length;
    });

    // Terminating a campaign takes everyone out immediately, regardless of position —
    // nobody is left "still active." Otherwise, a modest slice of the
    // treatment group hasn't reached any terminal state yet.
    const stillActiveFrac = campaign.status === 'TERMINATED' ? 0 : 0.05 + rand() * 0.06;
    const rootEntered = Math.round(entered * (1 - stillActiveFrac));
    stillActive = entered - rootEntered;

    nodeCounts[graph.rootId] = rootEntered;
    const queue: string[] = [graph.rootId];
    while (queue.length) {
      const nodeId = queue.shift()!;
      const node = graph.nodes[nodeId];
      if (!node) continue;
      const total = nodeCounts[nodeId] || 0;
      if (node.type === 'PAUSE' || node.type === 'WAIT_UNTIL') {
        // Some of the people who reached a wait are still sitting on it.
        // A terminated campaign took everyone out, so nobody is waiting.
        const waitingFrac = campaign.status === 'TERMINATED' ? 0 : 0.08 + ((seedFromId(nodeId) % 17) / 100);
        waitingByNodeId[nodeId] = Math.round(total * waitingFrac);
      }
      if (node.type === 'SEND') {
        // Seeded independently per node (not off the shared `rand`
        // sequence) so engagement numbers don't shift depending on where
        // in the topological walk this node happens to land.
        const nodeRand = mulberry32(seedFromId(nodeId));
        const deliveredPct = Math.round(92 + nodeRand() * 7); // 92-99%
        const openedPct = Math.round(deliveredPct * (0.35 + nodeRand() * 0.3)); // 35-65% of delivered
        const clickedPct = Math.round(openedPct * (0.2 + nodeRand() * 0.25)); // 20-45% of opened
        engagementByNodeId[nodeId] = { deliveredPct, openedPct, clickedPct };
      }
      // Conversion is no longer counted from arrivals at a Goal Reached
      // node — there isn't one. It becomes a campaign-level count within
      // the conversion window (Commit 4). Until then every Exit is just an
      // end, and the goal totals are computed below from the campaign.
      if (node.type === 'EXIT') {
        exitedWithoutGoal += total;
        continue;
      }
      const outs = graph.edges.filter((e) => e.from === nodeId && e.to);
      if (!outs.length) {
        // A dead end that isn't a terminal type shouldn't happen for a
        // submittable (non-DRAFT) campaign — defensive fallback only.
        exitedWithoutGoal += total;
        continue;
      }
      if (outs.length === 1) {
        const attrition = 0.02 + rand() * 0.04;
        const share = Math.round(total * (1 - attrition));
        const e = outs[0];
        edgeCounts[e.id] = { count: share, pct: 100 };
        exitedWithoutGoal += total - share;
        nodeCounts[e.to!] = (nodeCounts[e.to!] || 0) + share;
        remainingIndegree[e.to!] -= 1;
        if (remainingIndegree[e.to!] === 0) queue.push(e.to!);
        continue;
      }
      // Several outgoing paths mean two completely different things, and
      // counting them the same way would be wrong for one of them.
      //
      // A routing node (Condition/Branch/Experiment/Goal Check/Wait for
      // Event) DIVIDES its arrivals — each customer takes exactly one
      // path, so the shares sum to the incoming total.
      //
      // A fan-out node sends EVERY customer down EVERY path at once, so
      // each path carries the FULL incoming total, not a share of it —
      // four parallel milestone checkpoints off one entry are each
      // reached by everyone who entered, not by a quarter of them. Same
      // small per-hop attrition as the single-path case, since each path
      // is just an ordinary linear continuation from here.
      if (!dcIsRoutingNode(node.type)) {
        outs.forEach((e) => {
          const attrition = 0.02 + rand() * 0.04;
          const share = Math.round(total * (1 - attrition));
          edgeCounts[e.id] = { count: share, pct: 100 };
          nodeCounts[e.to!] = (nodeCounts[e.to!] || 0) + share;
          remainingIndegree[e.to!] -= 1;
          if (remainingIndegree[e.to!] === 0) queue.push(e.to!);
        });
        continue;
      }
      const pcts = computeSplitPcts(outs, rand, graph.nodes[nodeId]);
      outs.forEach((e, i) => {
        const share = Math.round(total * pcts[i]);
        edgeCounts[e.id] = { count: share, pct: Math.round(pcts[i] * 100) };
        nodeCounts[e.to!] = (nodeCounts[e.to!] || 0) + share;
        remainingIndegree[e.to!] -= 1;
        if (remainingIndegree[e.to!] === 0) queue.push(e.to!);
      });
    }
  }

  // Conversion is a campaign-level count now, not arrivals at a Goal Reached
  // node — there is no such node. Both groups are drawn the same way, each
  // from its own seeded rate, which is what lets uplift land either side:
  // the old form made control a fraction of treatment, so a campaign could
  // never be shown to have failed (audit H8).
  //
  // Crediting a conversion to the last message an account received, and
  // counting where people converted, is the next piece of work; this is the
  // campaign total that both of those have to add up to.
  const win = campaign.goal?.conversionWindow;
  const windowDays = win && Number(win.duration) > 0 ? Number(win.duration) / (win.unit === 'hours' ? 24 : 1) : null;
  const exitsOnConversion = !!campaign.goal?.eventType && campaign.goal.exitOnConversion !== false;
  const treatmentRate = campaign.goal ? Math.max(0, Math.min(1, 0.10 + rand() * 0.25)) : 0;
  const reachedGoalTotal = Math.floor(entered * treatmentRate);
  const conversionRate = entered > 0 ? reachedGoalTotal / entered : 0;
  const controlRate = campaign.goal ? Math.max(0, Math.min(1, 0.04 + rand() * 0.16)) : 0;
  const controlReachedGoal = Math.floor(control * controlRate);


  // ---------------------------------------------------------------------
  // Where the conversions came from.
  //
  // Last-touch: an account is credited to the last message it received
  // before converting. So a Send's share is the people who reached it and
  // did NOT go on to receive another message — reaching a later Send moves
  // the credit forward. That pool is computable from the counts already
  // walked above, and the shares add up to the campaign total by
  // construction, with the remainder going to the largest pool rather than
  // being dropped.
  //
  // And where they were standing when it happened: with exit on, an account
  // converts somewhere, and that somewhere is whatever follows the message
  // it last received — usually a wait. If nothing follows, it converted at
  // the Send itself.
  // ---------------------------------------------------------------------
  const conversionsByNodeId: Record<string, number> = {};
  const convertedHereByNodeId: Record<string, number> = {};
  const g = graph; // narrowed: everything below only runs with a real graph
  const sendIds = g ? Object.values(g.nodes).filter((n) => n.type === 'SEND').map((n) => n.id) : [];

  const downstreamSendCount = (id: string): number => {
    // The messages an account goes on to receive after this one. Walks past
    // waits and conditions, and stops at the first Send on each path.
    let total = 0;
    const seen = new Set<string>([id]);
    const queue = g!.edges.filter((e) => e.from === id && e.to).map((e) => e.to!);
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (g!.nodes[cur]?.type === 'SEND') {
        total += nodeCounts[cur] || 0;
        continue;
      }
      for (const e of g!.edges) if (e.from === cur && e.to && !seen.has(e.to)) queue.push(e.to);
    }
    return total;
  };

  const pools = sendIds.map((id) => ({ id, pool: Math.max(0, (nodeCounts[id] || 0) - downstreamSendCount(id)) }));
  const poolTotal = pools.reduce((t, p) => t + p.pool, 0);
  if (poolTotal > 0 && reachedGoalTotal > 0) {
    let assigned = 0;
    for (const p of pools) {
      const share = Math.floor((reachedGoalTotal * p.pool) / poolTotal);
      conversionsByNodeId[p.id] = share;
      assigned += share;
    }
    const biggest = pools.reduce((a, b) => (b.pool > a.pool ? b : a));
    conversionsByNodeId[biggest.id] += reachedGoalTotal - assigned;

    if (exitsOnConversion) {
      for (const p of pools) {
        const after = g!.edges.find((e) => e.from === p.id && e.to)?.to;
        const where = after && g!.nodes[after] && g!.nodes[after].type !== 'EXIT' ? after : p.id;
        convertedHereByNodeId[where] = (convertedHereByNodeId[where] || 0) + (conversionsByNodeId[p.id] || 0);
      }
    }
  }

  return {
    metrics: { nodeCounts, edgeCounts, engagementByNodeId, waitingByNodeId, conversionsByNodeId, convertedHereByNodeId },
    totals: {
      totalMatched,
      control,
      entered,
      reachedGoal: reachedGoalTotal,
      exitedWithoutGoal,
      stillActive,
      conversionRate,
      controlReachedGoal,
      controlConversionRate: control > 0 ? controlReachedGoal / control : 0,
      conversionWindowDays: windowDays,
    },
  };
}
