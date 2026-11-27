// Ported from renderDripView/dripCampaignAction — read-only campaign
// view with its two actions (edit as a new version, terminate).
import { useState } from 'react';
import { DRIP_STATUS_META } from '../data/statusMeta';
import { dcCountSends } from '../reducer/graphOps';
import { dcGoalLabel } from '../reducer/labelMeta';
import { DripCanvas } from '../canvas/DripCanvas';
import { DripAnalytics } from './DripAnalytics';
import { BasicDetailsView } from './BasicDetailsView';
import { StepDetailPanel } from './StepDetailPanel';
import { Modal } from '../components/Modal';
import type { DripCampaign } from '../data/graphTypes';

// All three tabs are always there. A campaign that never launched has no
// customers to report on, so Analytics says so plainly rather than being
// hidden — a missing tab reads as a missing feature. Scheduled is not on
// this list: it has been submitted but its start date hasn't arrived, so
// nobody has entered it yet.
const ANALYTICS_STATUSES = ['ACTIVE', 'EXPIRED', 'TERMINATED'];
type ViewTab = 'basic' | 'campaign' | 'analytics';
const TAB_LABELS: Record<ViewTab, string> = { basic: 'Basic Details', campaign: 'Campaign', analytics: 'Analytics' };

export function DripView({
  campaign,
  allCampaigns,
  onBack,
  onAction,
  onEditNewVersion,
  onOpenVersion,
}: {
  campaign: DripCampaign;
  allCampaigns: DripCampaign[];
  onBack: () => void;
  onAction: (id: string, action: 'terminate-confirmed') => void;
  onEditNewVersion: (c: DripCampaign) => void;
  onOpenVersion: (id: string) => void;
}) {
  const [killConfirmOpen, setKillConfirmOpen] = useState(false);
  const hasRun = ANALYTICS_STATUSES.includes(campaign.status);
  const [tab, setTab] = useState<ViewTab>('basic');
  const [openNodeId, setOpenNodeId] = useState<string | null>(null);
  const c = campaign;
  const sm = DRIP_STATUS_META[c.status];

  const priorVersion = c.versionOf ? allCampaigns.find((x) => x.id === c.versionOf) : null;
  const newerVersion = allCampaigns.find((x) => x.versionOf === c.id);
  const versionNote = priorVersion ? (
    <p className="f-hint" style={{ margin: '6px 0 0' }}>
      New version of{' '}
      <a href="#" onClick={(e) => { e.preventDefault(); onOpenVersion(priorVersion.id); }}>
        {priorVersion.name}
      </a>{' '}
      — it runs on its own and doesn't affect customers already enrolled on the live version.
    </p>
  ) : newerVersion ? (
    <p className="f-hint" style={{ margin: '6px 0 0' }}>
      A newer version of this campaign exists — this version keeps running for everyone already enrolled in it.
    </p>
  ) : null;

  return (
    <div style={{ padding: 24 }}>
      {/* Plain top-to-bottom stack, not .page-header's flex row (that
          class is built for a simple 2-item title+button header, like
          DripList's own — stuffing this view's 6 unrelated pieces into
          it is what caused the scattered, half-right-aligned layout). */}
      <div className="dv-header">
        <div className="add-link" onClick={onBack}>
          ← Back to Drip Campaigns
        </div>
        <div className="dv-header-title-row">
          <h1 className="page-title">{c.name}</h1>
          <span className={`badge ${sm.badge}`}>{sm.label}</span>
        </div>
        <p className="page-sub">
          {c.issuer || 'No issuer set'}
          {c.programs?.length ? ' · ' + c.programs.join(', ') : ''} · Goal: {dcGoalLabel(c.goal) ? `${dcGoalLabel(c.goal)} (${c.goal!.eventCategory})` : 'None — independent checkpoints'} · Control Group:{' '}
          {c.controlPct ? c.controlPct + '%' : 'None'} · {c.root ? dcCountSends(c.root) : 0} sends
        </p>
        {c.description && <p className="page-sub" style={{ marginTop: 4 }}>{c.description}</p>}
        {versionNote}
        <div className="dv-header-actions">
          {['ACTIVE', 'SCHEDULED'].includes(c.status) && (
            <button className="btn secondary" onClick={() => onEditNewVersion(c)}>
              Edit (new version)
            </button>
          )}
          {/* Ending a campaign early is rare and irreversible, so it is a
              quiet link rather than a button competing with Edit. */}
          {['ACTIVE', 'SCHEDULED'].includes(c.status) && (
            <button className="dv-terminate-link" onClick={() => setKillConfirmOpen(true)}>
              Terminate
            </button>
          )}
        </div>
      </div>
      <div className="dv-tabs">
        {(['basic', 'campaign', 'analytics'] as const).map((t) => (
          <button
            key={t}
            className={`dv-tab${tab === t ? ' active' : ''}`}
            onClick={() => {
              setTab(t);
              setOpenNodeId(null);
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'basic' && <BasicDetailsView campaign={c} />}

      {tab === 'campaign' &&
        (c.root && c.root.rootId ? (
          <div className="an-stage">
            <div className="card an-canvas">
              {/* Read-only: clicking a step opens it in the panel. It does
                  not start a new version and does not open the editor. */}
              <DripCanvas graph={c.root} goal={c.goal} editable={false} onInspectNode={setOpenNodeId} />
            </div>
            {openNodeId && c.root.nodes[openNodeId] && (
              <StepDetailPanel node={c.root.nodes[openNodeId]} campaign={c} graph={c.root} onClose={() => setOpenNodeId(null)} />
            )}
          </div>
        ) : (
          <p className="an-empty">No steps yet — still a draft.</p>
        ))}

      {tab === 'analytics' && (
        <div style={{ marginTop: 16 }}>
          <DripAnalytics campaign={c} hasRun={hasRun} />
        </div>
      )}

      <Modal open={killConfirmOpen} onClose={() => setKillConfirmOpen(false)}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Terminate "{c.name}"</div>
        <p style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.5 }}>
          This takes <b>every customer currently in the campaign</b> out of it, wherever they are in the journey. It cannot be undone and the campaign cannot be restarted. Use it for a real incident,
          such as a template that should not have gone out.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button className="btn secondary" onClick={() => setKillConfirmOpen(false)}>
            Cancel
          </button>
          <button
            className="btn danger"
            onClick={() => {
              setKillConfirmOpen(false);
              onAction(c.id, 'terminate-confirmed');
            }}
          >
            Terminate
          </button>
        </div>
      </Modal>
    </div>
  );
}
