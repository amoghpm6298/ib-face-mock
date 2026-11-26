// The campaign as it was set up, read-only. Every field here was decided on
// the wizard's own Basic Details, Goal and Guardrails steps; this is the
// read-back, not a second place to change them.
import type { DripCampaign } from '../data/graphTypes';
import { dcQuietHoursSentence } from '../data/quietHours';
import { dcGoalLabel } from '../reducer/labelMeta';
import { ImportedFilePanel } from '../components/ImportedFilePanel';

function Row({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bd-row">
      <div className="bd-key">{label}</div>
      <div className="bd-val">
        {value}
        {sub && <div className="bd-sub">{sub}</div>}
      </div>
    </div>
  );
}

function none(text: string) {
  return <span className="bd-none">{text}</span>;
}

export function BasicDetailsView({ campaign }: { campaign: DripCampaign }) {
  const c = campaign;
  const programs = c.applyToAllPrograms ? 'All current and future programs' : c.programs?.length ? c.programs.join(', ') : null;
  const reEntry = c.allowReEntry
    ? `Allowed after ${c.reEntryCooloffDuration ?? 0} ${c.reEntryCooloffUnit ?? 'days'}`
    : 'Not allowed — a customer who finishes does not come back in';
  const dnc = c.guardrails?.dnc;
  const npa = c.guardrails?.npa;

  return (
    <div className="bd-wrap">
      <section className="bd-section">
        <div className="bd-section-title">Campaign</div>
        <Row label="Name" value={c.name} />
        <Row label="Description" value={c.description || none('No description')} />
      </section>

      <section className="bd-section">
        <div className="bd-section-title">Scope</div>
        <Row label="Issuer" value={c.issuer || none('No issuer set')} />
        <Row label="Programs" value={programs || none('No programs selected')} />
      </section>

      <section className="bd-section">
        <div className="bd-section-title">Experimentation</div>
        <Row label="Control group" value={c.controlPct ? `${c.controlPct}% held back` : none('No control group')} sub={c.controlPct ? 'Held back from every message, to measure what the campaign itself did.' : undefined} />
      </section>

      <section className="bd-section">
        <div className="bd-section-title">Re-entry</div>
        <Row label="Re-entry" value={reEntry} />
        {/* What "one run" counts as. Verified in quibbler, not assumed: the
            nudge_subscription table is unique on (account_id, nudge_dfn_id)
            and every NudgeCommunicationData row carries an accountId and no
            customer or card id. So a run is per account, and re-entry means
            per account too. Said here because it is the thing that decides
            whether a customer with two cards gets one journey or two. */}
        <Row label="Counted per" value="Account. A customer with two cards on one account goes through this campaign once, not twice." />
      </section>

      <section className="bd-section">
        <div className="bd-section-title">Schedule</div>
        <Row label="Starts" value={c.startDate || 'Once approved'} />
        <Row label="Ends" value={c.endDate || none('No end date')} />
        {/* The end date is a hard stop, not a drain: anyone part-way through
            the journey is stopped with the campaign. Stated here because it
            decides who stops receiving messages, and a reader cannot infer it
            from a date. Nothing says it when there is no end date, since
            nothing then happens. */}
        {c.endDate ? <Row label="At the end date" value="The campaign stops. Anyone still part-way through the journey is stopped with it." /> : null}
      </section>

      <section className="bd-section">
        <div className="bd-section-title">Goal</div>
        <Row label="Goal" value={dcGoalLabel(c.goal) || none('No goal defined')} />
      </section>

      <section className="bd-section">
        <div className="bd-section-title">Guardrails</div>
        <Row label="Quiet hours" value={dcQuietHoursSentence(c.guardrails?.quietHours)} />
        {dnc || npa ? (
          <>
            <Row label="Do Not Contact" value={dnc ? 'On' : 'Off'} />
            <Row label="Non-Performing Assets" value={npa ? 'On' : 'Off'} />
            <p className="bd-note">Checked at every step. A customer who matches skips the rest of the journey.</p>
          </>
        ) : (
          <Row label="Exclusion lists" value={none('No exclusion lists are applied')} />
        )}
      </section>

      <ImportedFilePanel campaign={c} />
    </div>
  );
}
