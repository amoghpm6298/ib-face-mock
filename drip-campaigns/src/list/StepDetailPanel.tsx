// One step, read-only, in a panel beside the journey.
//
// Opened by clicking a step on Campaign or on Analytics. It never starts a
// new version and never opens the editor — looking at a live campaign is not
// the same act as changing one.
//
// On Analytics the same panel leads with that step's result and puts the
// configuration underneath, so the number is answered first and the "why" is
// right there under it.
import type { DripCampaign, DripNode, DripGraph } from '../data/graphTypes';
import { DC_NODE_META } from '../data/nodeMeta';
import { dcEventConditionSentences, dcFilterSentences, dcFiltersOf, dcBranchWhatOf } from '../data/filters';
import { dcGoalLabel, dcRecurrenceLabel } from '../reducer/labelMeta';
import {
  CHANNEL_CONFIG_LABELS,
  COMMS_TEMPLATES,
  dcCardEventPhrase,
  dcValidEventType,
  milestoneOfferName,
  appEventLabel,
  type Channel,
} from '../data/sharedConstants';
import type { DripAnalyticsMetrics } from '../data/dripAnalytics';

function fmt(n: number): string {
  return n.toLocaleString('en-IN');
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="sp-row">
      <div className="sp-row-key">{label}</div>
      <div className="sp-row-val">{value}</div>
    </div>
  );
}

function Lines({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <span className="sp-empty">{empty}</span>;
  return (
    <>
      {items.map((t, i) => (
        <div key={i}>{t}</div>
      ))}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cfg(node: DripNode): any {
  return node._config || {};
}

function StepConfig({ node, campaign, graph }: { node: DripNode; campaign: DripCampaign; graph: DripGraph }) {
  const p = cfg(node);
  switch (node.type) {
    case 'ENTRY_SEGMENT':
      return (
        <>
          <Row label="Who qualifies" value={<Lines items={dcFilterSentences(dcFiltersOf(node.type, p))} empty="Everyone who matches the entry." />} />
          <Row label="Repeats" value={p.repeat ? dcRecurrenceLabel(p) : 'Runs once, as a static snapshot'} />
        </>
      );
    case 'ENTRY_EVENT':
    case 'WAIT_UNTIL': {
      const event = dcCardEventPhrase(p.eventType, p.cardDetails) || dcValidEventType(p.eventCategory, p.eventType) || '—';
      return (
        <>
          <Row label="Event" value={event} />
          <Row label="Event category" value={p.eventCategory || '—'} />
          {node.type === 'WAIT_UNTIL' && <Row label="Gives up after" value={`${p.duration} ${p.unit}`} />}
          {/* Both event types can narrow on their own event's attributes. */}
          <Row label="Narrowed by" value={<Lines items={dcEventConditionSentences(node.type, p)} empty="No extra narrowing." />} />
        </>
      );
    }
    case 'SEND': {
      const template = COMMS_TEMPLATES.find((t) => t.id === p.templateId)?.name;
      const fallbackTemplate = COMMS_TEMPLATES.find((t) => t.id === p.fallbackTemplateId)?.name;
      return (
        <>
          <Row label="Channel" value={CHANNEL_CONFIG_LABELS[p.channel as Channel] || p.channel || '—'} />
          <Row label="Account" value={p.account || <span className="sp-empty">Not set</span>} />
          <Row label="Template" value={template || <span className="sp-empty">Not set</span>} />
          <Row label="Sends" value={p.timing === 'Absolute' ? `At ${p.absTime}` : `${p.relativeDuration} ${p.relativeUnit} after ${p.relativeAnchor}`} />
          {p.fallbackChannel ? (
            <Row
              label="Fallback"
              value={`${CHANNEL_CONFIG_LABELS[p.fallbackChannel as Channel] || p.fallbackChannel}${fallbackTemplate ? ` · ${fallbackTemplate}` : ''}${p.fallbackAccount ? ` · ${p.fallbackAccount}` : ''}`}
            />
          ) : (
            <Row label="Fallback" value={<span className="sp-empty">None</span>} />
          )}
        </>
      );
    }
    case 'PAUSE':
      return <Row label="Waits" value={`${p.duration} ${p.unit}`} />;
    case 'SPLIT':
      return <Row label="Yes when" value={<Lines items={dcFilterSentences(dcFiltersOf(node.type, p))} empty="Nothing set." />} />;
    case 'DECISION_SPLIT': {
      const what = dcBranchWhatOf(p);
      const question =
        what.group === 'Milestone'
          ? milestoneOfferName(what.field) || 'Milestone'
          : what.group === 'App activity'
            ? appEventLabel(what.field) || 'App activity'
            : what.group === 'Previous message'
              ? 'Previous message outcome'
              : what.field || what.group || '—';
      const arms = graph.edges.filter((e) => e.from === node.id).map((e) => e.branchLabel);
      return (
        <>
          <Row label="Question" value={question} />
          <Row label="Arms" value={<Lines items={arms} empty="No arms." />} />
        </>
      );
    }
    case 'RANDOM_SPLIT':
      return <Row label="Split" value={<Lines items={(p.branches || []).map((b: { label: string; pct: number }) => `${b.label} ${b.pct}%`)} empty="No variants." />} />;
    case 'GOAL_CHECK':
      return <Row label="Campaign goal" value={dcGoalLabel(campaign.goal) || <span className="sp-empty">No goal defined</span>} />;
    case 'GOAL_EXIT':
    case 'EXIT':
      return <Row label="Reason" value={p.reason || '—'} />;
    default:
      return null;
  }
}

function StepResult({ node, metrics }: { node: DripNode; metrics: DripAnalyticsMetrics }) {
  const reached = metrics.nodeCounts[node.id];
  if (reached === undefined) return null;
  const engagement = metrics.engagementByNodeId?.[node.id];
  const waiting = metrics.waitingByNodeId?.[node.id];
  return (
    <div className="sp-result">
      <Row label="Reached" value={fmt(reached)} />
      {node.type === 'SEND' && engagement && (
        <>
          <Row label="Delivered" value={fmt(Math.round((reached * engagement.deliveredPct) / 100))} />
          <Row label="Opened" value={fmt(Math.round((reached * engagement.openedPct) / 100))} />
          <Row label="Clicked" value={fmt(Math.round((reached * engagement.clickedPct) / 100))} />
        </>
      )}
      {waiting !== undefined && <Row label="Still waiting" value={fmt(waiting)} />}
    </div>
  );
}

// A Goal Check's result is its two answers, which live on its own outgoing
// edges rather than on the node.
function GoalCheckResult({ node, graph, metrics }: { node: DripNode; graph: DripGraph; metrics: DripAnalyticsMetrics }) {
  const outs = graph.edges.filter((e) => e.from === node.id);
  const reached = metrics.nodeCounts[node.id];
  if (reached === undefined) return null;
  return (
    <div className="sp-result">
      <Row label="Reached" value={fmt(reached)} />
      {outs.map((e) => {
        const stat = metrics.edgeCounts[e.id];
        return <Row key={e.id} label={e.branchLabel || 'Path'} value={stat ? fmt(stat.count) : '—'} />;
      })}
    </div>
  );
}

export function StepDetailPanel({
  node,
  campaign,
  graph,
  metrics,
  onClose,
}: {
  node: DripNode;
  campaign: DripCampaign;
  graph: DripGraph;
  metrics?: DripAnalyticsMetrics;
  onClose: () => void;
}) {
  const meta = DC_NODE_META[node.type];
  const isGoalCheck = node.type === 'GOAL_CHECK';
  return (
    <aside className="sp-panel">
      <div className="sp-head">
        <div>
          <div className="sp-kicker">{meta.type}</div>
          <div className="sp-title">{node.label}</div>
        </div>
        <button className="sp-close" onClick={onClose} title="Close">
          ✕
        </button>
      </div>
      <div className="sp-body">
        {metrics && (isGoalCheck ? <GoalCheckResult node={node} graph={graph} metrics={metrics} /> : <StepResult node={node} metrics={metrics} />)}
        <StepConfig node={node} campaign={campaign} graph={graph} />
      </div>
    </aside>
  );
}
