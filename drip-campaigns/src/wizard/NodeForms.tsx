// Ported from journeysnudgesemi/emi-conversions-prototype.html's
// dcDrawerFormFor — one component per node type's config form, same
// fields/cascades as the original (Account/Template cascade, Previous-
// step-outcome channel-aware status list, Random/Decision Split dynamic
// branch lists with mid-list insert, etc).
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  appEventById,
  dcValidEventType,
  CHANNEL_CONFIG_LABELS,
  COMMS_TEMPLATES,
  EVENT_CATEGORIES,
  resolveEntryEventAttrSource,
  type Channel,
  type PrevStepSend,
} from '../data/sharedConstants';
import type { DripGoal, DripAgentMessaging } from '../data/graphTypes';
import { dcOrdinal, dcRecurrenceLabel, dcGoalLabel } from '../reducer/labelMeta';
import { dcNewBranchId } from '../reducer/idGen';
import { ConditionsSection, ConditionRows } from './ConditionRows';
import { FilterRows, WhatSelect, FilterComparison, FilterValue, AppEventFields, AppOfferDetail } from './FilterRows';
import { dcFiltersOf, dcBranchWhatOf, dcDefaultTxnForRow, dcDetailsForEvent } from '../data/filters';
import { TxnLookbackFields } from './TxnHistoryFields';
import { EventScopingFields, CardEventDetailFields } from './EventScopingFields';

interface FormProps {
  p: any;
  onChange: (patch: any) => void;
}

export function EntrySegmentForm({ p, onChange }: FormProps) {
  // Reads the new shape when there is one and the old entity blocks when
  // there isn't, so a campaign saved before the rewrite opens with its
  // filters already listed as rows.
  const filters = dcFiltersOf('ENTRY_SEGMENT', p);
  return (
    <>
      <div className="f-group">
        <label className="f-label">Segment name</label>
        <input className="f-input" type="text" value={p.cohortDesc} onChange={(e) => onChange({ cohortDesc: e.target.value })} />
      </div>
      <div className="f-group">
        <label className="f-label">Runs</label>
        <select className="f-input" value={p.repeat ? 'Repeat' : 'Once'} onChange={(e) => onChange({ repeat: e.target.value === 'Repeat' })}>
          <option value="Once">Once — a static snapshot</option>
          <option value="Repeat">On a repeating schedule</option>
        </select>
      </div>
      {p.repeat && (
        <>
          <div className="f-group">
            <label className="f-label">Repeats</label>
            <select className="f-input" value={p.recurrenceType} onChange={(e) => onChange({ recurrenceType: e.target.value })}>
              <option>Monthly</option>
              <option>Weekly</option>
              <option>Daily</option>
            </select>
          </div>
          {p.recurrenceType === 'Monthly' && (
            <div className="f-group">
              <label className="f-label">On</label>
              <select className="f-input" value={p.dayOfMonth} onChange={(e) => onChange({ dayOfMonth: e.target.value })}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {dcOrdinal(d)}
                  </option>
                ))}
                <option value="last">Last day</option>
              </select>
            </div>
          )}
          {p.recurrenceType === 'Weekly' && (
            <div className="f-row2">
              <div className="f-group">
                <label className="f-label">Every</label>
                <input className="f-input" type="number" min={1} value={p.weekInterval} onChange={(e) => onChange({ weekInterval: e.target.value })} />
              </div>
              <div className="f-group">
                <label className="f-label">On</label>
                <select className="f-input" value={p.dayOfWeek} onChange={(e) => onChange({ dayOfWeek: e.target.value })}>
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {p.recurrenceType === 'Daily' && (
            <div className="f-group">
              <label className="f-label">Every N days</label>
              <input className="f-input" type="number" min={1} value={p.dayInterval} onChange={(e) => onChange({ dayInterval: e.target.value })} />
            </div>
          )}
          <div className="f-group">
            <label className="f-label">At</label>
            <input className="f-input" type="time" value={p.timeOfDay} onChange={(e) => onChange({ timeOfDay: e.target.value })} />
          </div>
          <p className="f-hint">{dcRecurrenceLabel(p)}</p>
        </>
      )}
      <div className="f-group">
        <label className="f-label">Who qualifies</label>
        {filters.length === 0 ? (
          <p className="f-hint" style={{ margin: '0 0 6px' }}>
            No filters are set. This targets everyone{p.repeat ? ' matching this schedule' : ''}.
          </p>
        ) : null}
        <FilterRows rows={filters} onChange={(rows) => onChange({ filters: rows })} />
      </div>
      {p.repeat && <p className="f-hint">This re-evaluates fresh every time the schedule fires. It isn't a one-time snapshot.</p>}
    </>
  );
}

export function EntryEventForm({ p, onChange }: FormProps) {
  return (
    <>
      <div className="f-group">
        <label className="f-label">Event Category</label>
        <select className="f-input" value={p.eventCategory} onChange={(e) => onChange({ eventCategory: e.target.value, eventType: '' })}>
          {Object.keys(EVENT_CATEGORIES).map((k) => (
            <option key={k} value={k}>
              {k}
              {EVENT_CATEGORIES[k].isNew ? ' (New)' : ''}
            </option>
          ))}
        </select>
      </div>
      <EventScopingFields eventCategory={p.eventCategory} value={p} onChange={onChange} />
      <div className="f-group">
        <label className="f-label">Event Type</label>
        <select className="f-input" value={dcValidEventType(p.eventCategory, p.eventType)} onChange={(e) => onChange({ eventType: e.target.value, cardDetails: {} })}>
          <option value="">Select event</option>
          {(EVENT_CATEGORIES[p.eventCategory]?.events || []).map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>
      <CardEventDetailFields eventCategory={p.eventCategory} eventType={p.eventType} value={p.cardDetails} onChange={(cardDetails) => onChange({ cardDetails })} />
      {(() => {
        const { entity, lockedAttr } = resolveEntryEventAttrSource(p.eventCategory, p.eventType);
        return <ConditionsSection conditions={p.conditions} entity={entity} lockedAttribute={lockedAttr} onChange={(conditions) => onChange({ conditions })} />;
      })()}
    </>
  );
}

// accountKey/templateKey let this same pair of fields target either the
// primary account/templateId or (for a Send's optional fallback) a
// separate fallbackAccount/fallbackTemplateId — a template is always
// locked to one channel, so the fallback channel needs its own pair
// rather than sharing the primary's.
function AccountTemplateFields({
  channel,
  p,
  onChange,
  accountKey = 'account',
  templateKey = 'templateId',
  accountLabel = 'Account',
  templateLabel = 'Template',
}: {
  channel: Channel;
  p: any;
  onChange: (patch: any) => void;
  accountKey?: string;
  templateKey?: string;
  accountLabel?: string;
  templateLabel?: string;
}) {
  const account = p[accountKey];
  const templateId = p[templateKey];
  const accounts = [...new Set(COMMS_TEMPLATES.filter((x) => x.channelType === channel).map((x) => x.accountName))];
  const templates = COMMS_TEMPLATES.filter((x) => x.channelType === channel && (!account || x.accountName === account));
  return (
    <>
      <div className="f-group">
        <label className="f-label">{accountLabel}</label>
        <select className="f-input" value={account} onChange={(e) => onChange({ [accountKey]: e.target.value, [templateKey]: '' })}>
          <option value="">Select account</option>
          {accounts.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>
      <div className="f-group">
        <label className="f-label">{templateLabel}</label>
        <select className="f-input" value={templateId} onChange={(e) => onChange({ [templateKey]: e.target.value })}>
          <option value="">Select template</option>
          {templates.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        {!templates.length && (
          <div className="f-hint">
            No {CHANNEL_CONFIG_LABELS[channel]} templates exist yet{account ? ' for this account' : ''}.
          </div>
        )}
      </div>
    </>
  );
}

export function SendForm({ p, onChange }: FormProps) {
  return (
    <>
      <div className="f-group">
        <label className="f-label">Step name</label>
        <input className="f-input" type="text" value={p.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="f-row2">
        <div className="f-group">
          <label className="f-label">Channel</label>
          <select
            className="f-input"
            value={p.channel}
            onChange={(e) =>
              onChange({
                channel: e.target.value,
                account: '',
                templateId: '',
                ...(p.fallbackChannel === e.target.value ? { fallbackChannel: '', fallbackAccount: '', fallbackTemplateId: '' } : {}),
              })
            }
          >
            {Object.keys(CHANNEL_CONFIG_LABELS).map((c) => (
              <option key={c} value={c}>
                {CHANNEL_CONFIG_LABELS[c as Channel]}
              </option>
            ))}
          </select>
        </div>
        <div className="f-group">
          <label className="f-label">Timing</label>
          <select className="f-input" value={p.timing} onChange={(e) => onChange({ timing: e.target.value })}>
            <option>Absolute</option>
            <option>Relative</option>
          </select>
        </div>
      </div>
      {p.timing === 'Absolute' ? (
        <div className="f-group">
          <label className="f-label">Send time</label>
          <input className="f-input" type="time" value={p.absTime} onChange={(e) => onChange({ absTime: e.target.value })} />
        </div>
      ) : (
        <div className="f-group">
          <label className="f-label">Delay after previous step</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="f-input" type="number" min={0} value={p.relativeDuration} onChange={(e) => onChange({ relativeDuration: e.target.value })} />
            <select className="f-input" value={p.relativeUnit} onChange={(e) => onChange({ relativeUnit: e.target.value })}>
              <option>hours</option>
              <option>days</option>
            </select>
          </div>
        </div>
      )}
      <AccountTemplateFields channel={p.channel} p={p} onChange={onChange} />
      <div className="f-group">
        <label className="f-label">Fallback Channel</label>
        <select
          className="f-input"
          value={p.fallbackChannel}
          onChange={(e) => onChange({ fallbackChannel: e.target.value, fallbackAccount: '', fallbackTemplateId: '' })}
        >
          <option value="">No fallback</option>
          {Object.keys(CHANNEL_CONFIG_LABELS)
            .filter((c) => c !== p.channel)
            .map((c) => (
              <option key={c} value={c}>
                {CHANNEL_CONFIG_LABELS[c as Channel]}
              </option>
            ))}
        </select>
      </div>
      {p.fallbackChannel && (
        <>
          <AccountTemplateFields
            channel={p.fallbackChannel}
            p={p}
            onChange={onChange}
            accountKey="fallbackAccount"
            templateKey="fallbackTemplateId"
            accountLabel="Fallback Account"
            templateLabel="Fallback Template"
          />
          <p className="f-hint">
            If delivery fails on {CHANNEL_CONFIG_LABELS[p.channel as Channel]}, this sends once via {CHANNEL_CONFIG_LABELS[p.fallbackChannel as Channel]}. Then it continues the sequence.
          </p>
        </>
      )}
      <AgentMessagingPanel messaging={p.agentMessaging} />
    </>
  );
}

/**
 * The agent's suggested message, shown read-only.
 *
 * Read-only on purpose. This is a draft the campaign manager copies into the
 * bank's own template tooling. It is not a registered template and nothing
 * here is sent, so making it editable would imply it feeds a real send.
 * Renders nothing for a Send that no agent proposed.
 */
export function AgentMessagingPanel({ messaging }: { messaging?: DripAgentMessaging | null }) {
  if (!messaging) return null;
  const tokens = messaging.personalisationTokens ?? [];
  return (
    <div className="f-group agent-msg">
      <label className="f-label">Suggested message — draft</label>
      <p className="f-hint">
        Written by the agent. It has not been reviewed or approved by the bank and it is not a registered template. Use
        it as a starting point when you prepare the real message.
      </p>
      <dl className="agent-msg-dl">
        <dt>Purpose</dt>
        <dd>{messaging.objective}</dd>
        {messaging.suggestedCopy && (
          <>
            <dt>{messaging.copySource === 'generated-placeholder' ? 'Placeholder' : 'Draft copy'}</dt>
            <dd>
              {messaging.suggestedCopy}
              {messaging.copySource === 'generated-placeholder' && (
                <span className="f-hint" style={{ display: 'block', marginTop: 4 }}>
                  The agent did not supply copy for this step, so this is a placeholder built from the purpose above.
                  Write the real message yourself.
                </span>
              )}
            </dd>
          </>
        )}
        {messaging.cta && (
          <>
            <dt>Call to action</dt>
            <dd>{messaging.cta}</dd>
          </>
        )}
        {tokens.length > 0 && (
          <>
            <dt>Personalisation</dt>
            <dd>{tokens.map((t) => `\${${t}}`).join(', ')}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

export function PauseForm({ p, onChange }: FormProps) {
  return (
    <>
      <div className="f-row2">
        <div className="f-group">
          <label className="f-label">Duration</label>
          <input className="f-input" type="number" min={1} value={p.duration} onChange={(e) => onChange({ duration: e.target.value })} />
        </div>
        <div className="f-group">
          <label className="f-label">Unit</label>
          <select className="f-input" value={p.unit} onChange={(e) => onChange({ unit: e.target.value })}>
            <option>days</option>
            <option>hours</option>
          </select>
        </div>
      </div>
    </>
  );
}

export function WaitUntilForm({ p, onChange }: FormProps) {
  return (
    <>
      <div className="f-group">
        <label className="f-label">Event Category</label>
        <select className="f-input" value={p.eventCategory} onChange={(e) => onChange({ eventCategory: e.target.value, eventType: '' })}>
          {Object.keys(EVENT_CATEGORIES).map((k) => (
            <option key={k} value={k}>
              {k}
              {EVENT_CATEGORIES[k].isNew ? ' (New)' : ''}
            </option>
          ))}
        </select>
      </div>
      <EventScopingFields eventCategory={p.eventCategory} value={p} onChange={onChange} />
      <div className="f-group">
        <label className="f-label">Event Type</label>
        <select className="f-input" value={dcValidEventType(p.eventCategory, p.eventType)} onChange={(e) => onChange({ eventType: e.target.value, cardDetails: {} })}>
          <option value="">Select event</option>
          {(EVENT_CATEGORIES[p.eventCategory]?.events || []).map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>
      <CardEventDetailFields eventCategory={p.eventCategory} eventType={p.eventType} value={p.cardDetails} onChange={(cardDetails) => onChange({ cardDetails })} />
      <div className="f-row2">
        <div className="f-group">
          <label className="f-label">Timeout after</label>
          <input className="f-input" type="number" min={1} value={p.duration} onChange={(e) => onChange({ duration: e.target.value })} />
        </div>
        <div className="f-group">
          <label className="f-label">Unit</label>
          <select className="f-input" value={p.unit} onChange={(e) => onChange({ unit: e.target.value })}>
            <option>days</option>
            <option>hours</option>
          </select>
        </div>
      </div>
      {(() => {
        const { entity, lockedAttr } = resolveEntryEventAttrSource(p.eventCategory, p.eventType);
        return <ConditionsSection conditions={p.conditions} entity={entity} lockedAttribute={lockedAttr} onChange={(conditions) => onChange({ conditions })} />;
      })()}
    </>
  );
}

export function SplitForm({
  p,
  onChange,
  entryEventCategory,
  entryEventType,
  previousStepChannel,
}: FormProps & { entryEventCategory: string | null; entryEventType: string | null; previousStepChannel: PrevStepSend | null }) {
  const { entity: entryEventEntity, lockedAttr } = resolveEntryEventAttrSource(entryEventCategory, entryEventType);
  const filters = dcFiltersOf('SPLIT', p);
  return (
    <div className="f-group">
      <label className="f-label">Yes when</label>
      <FilterRows
        rows={filters}
        onChange={(rows) => onChange({ filters: rows })}
        previousMessage
        previousStepChannel={previousStepChannel}
        ctx={{ entryEventEntity, entryEventLockedAttr: lockedAttr }}
      />
      <p className="f-hint" style={{ margin: '6px 0 0' }}>Anything that does not match goes to No.</p>
    </div>
  );
}

function BranchInsertRow({ onInsert }: { onInsert: () => void }) {
  return (
    <div className="dcb-insert-row" onClick={onInsert} title="Insert a branch here">
      <span className="dcb-insert-plus">+</span>
    </div>
  );
}

export function DecisionSplitForm({
  p,
  onChange,
  entryEventCategory,
  entryEventType,
  previousStepChannel,
}: FormProps & { entryEventCategory: string | null; entryEventType: string | null; previousStepChannel: PrevStepSend | null }) {
  const { entity: entryEventEntity, lockedAttr } = resolveEntryEventAttrSource(entryEventCategory, entryEventType);
  const ctx = { entryEventEntity, entryEventLockedAttr: lockedAttr };
  // Branch routes rather than narrows, so it shares one question across its
  // arms instead of taking a list of AND'd rows. The question is picked from
  // the same grouped list every other step uses, which is what replaced its
  // old Source and Attribute controls.
  const what = dcBranchWhatOf(p);
  const isTxn = what.group === 'Transactions';
  const isAppActivity = what.group === 'App activity';
  const appEvent = appEventById(what.field);
  const sharedTxn = p.txn ?? dcDefaultTxnForRow();

  const setBranch = (i: number, patch: any) => onChange({ branches: p.branches.map((b: any, idx: number) => (idx === i ? { ...b, ...patch } : b)) });
  const removeBranch = (i: number) => onChange({ branches: p.branches.filter((_: any, idx: number) => idx !== i) });
  const newBranch = (n: number) => ({ id: dcNewBranchId(), label: 'Branch ' + n, operator: '', value: '', value2: '', values: [] });
  const addBranch = () => onChange({ branches: [...p.branches, newBranch(p.branches.length + 1)] });
  const insertBranch = (i: number) => {
    const branches = [...p.branches];
    branches.splice(i + 1, 0, newBranch(branches.length + 1));
    onChange({ branches });
  };

  return (
    <>
      <div className="f-group">
        <label className="f-label">Step name</label>
        <input className="f-input" type="text" value={p.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="f-group">
        <label className="f-label">What</label>
        <WhatSelect
          group={what.group}
          field={what.field}
          previousMessage
          ctx={ctx}
          onPick={(group, field) =>
            // A new question makes every arm's comparison and value stale,
            // not merely hidden: the operator vocabularies are disjoint
            // (Milestone's IS/GT/GTE_PCT against everything else's is/is not).
            onChange({
              what: { group, field },
              txn: group === 'Transactions' ? dcDefaultTxnForRow() : undefined,
              branches: p.branches.map((b: any) => ({ ...b, operator: '', value: '', value2: '', values: [] })),
            })
          }
        />
        {isAppActivity && (
          <div style={{ marginTop: 10 }}>
            {/* One event for the whole Branch. Each arm then sets its own
                direction, window and details against it. */}
            <AppEventFields
              field={what.field}
              showDetails={false}
              onChange={(patch) =>
                onChange({
                  what: { group: 'App activity', field: patch.field ?? what.field },
                  // A new event invalidates every arm's details, since the
                  // questions it asks are different ones.
                  branches: p.branches.map((b: any) => ({ ...b, details: dcDetailsForEvent(patch.field ?? what.field, b.details) })),
                })
              }
            />
          </div>
        )}
        {isTxn && (
          <div style={{ marginTop: 10 }}>
            <TxnLookbackFields
              lookbackDuration={sharedTxn.lookbackDuration}
              lookbackUnit={sharedTxn.lookbackUnit}
              existence={sharedTxn.existence}
              hideExistence
              onChange={(patch) => onChange({ txn: { ...sharedTxn, ...patch } })}
            />
            <ConditionRows conditions={sharedTxn.filters} entity="Transaction" onChange={(filters) => onChange({ txn: { ...sharedTxn, filters } })} />
          </div>
        )}
      </div>
      {what.field || isTxn || what.group === 'Previous message' ? (
        <div className="f-group">
          <label className="f-label">Branches</label>
          {p.branches.map((b: any, i: number) => {
            // Each arm carries its own comparison and value against the one
            // shared what; valueUnit rides along for a Milestone arm.
            const row = { group: what.group, field: what.field, operator: b.operator, value: b.value, value2: b.value2, values: b.values, valueUnit: b.valueUnit, details: b.details, txn: sharedTxn };
            return (
              <div key={b.id || i}>
                <BranchInsertRow onInsert={() => insertBranch(i - 1)} />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input className="f-input" type="text" style={{ width: 110, flexShrink: 0 }} placeholder="Label" value={b.label} onChange={(e) => setBranch(i, { label: e.target.value })} />
                  <div style={{ width: 150, flexShrink: 0 }}>
                    <FilterComparison row={row} ctx={ctx} onPatch={(patch) => setBranch(i, patch)} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <FilterValue row={row} previousStepChannel={previousStepChannel} ctx={ctx} hideTxnLookback onPatch={(patch) => setBranch(i, patch)} />
                  </div>
                  {p.branches.length > 1 && (
                    <div className="cond-remove" onClick={() => removeBranch(i)}>
                      ✕
                    </div>
                  )}
                </div>
                {isAppActivity && appEvent?.details?.includes('offer') && (
                  // This arm's own detail — two arms can name two different
                  // offers against the one shared event.
                  <div style={{ margin: '0 0 10px 12px', paddingLeft: 12, borderLeft: '2px solid var(--gray-200)' }}>
                    <AppOfferDetail value={b.details?.offer || ''} onChange={(offer) => setBranch(i, { details: { ...(b.details || {}), offer } })} />
                  </div>
                )}
              </div>
            );
          })}
          <div className="add-link" onClick={addBranch}>
            + Add branch
          </div>
          <CatchAllRow />
        </div>
      ) : null}
      <p className="f-hint">Branches are checked top to bottom. The customer follows the first match. Anything else falls into the catch-all.</p>
    </>
  );
}

function CatchAllRow() {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, padding: '9px 12px', background: 'var(--gray-50)', borderRadius: 8, color: 'var(--gray-500)', fontSize: 12.5 }}>
      Anything else <span style={{ marginLeft: 'auto' }}>Catch-all</span>
    </div>
  );
}

export function RandomSplitForm({ p, onChange }: FormProps) {
  const total = p.branches.reduce((s: number, b: any) => s + Number(b.pct || 0), 0);
  const setBranch = (i: number, patch: any) => onChange({ branches: p.branches.map((b: any, idx: number) => (idx === i ? { ...b, ...patch } : b)) });
  const removeBranch = (i: number) => onChange({ branches: p.branches.filter((_: any, idx: number) => idx !== i) });
  const addBranch = () => onChange({ branches: [...p.branches, { id: dcNewBranchId(), label: String.fromCharCode(65 + p.branches.length), pct: 0 }] });
  const insertBranch = (i: number) => {
    const branches = [...p.branches];
    branches.splice(i + 1, 0, { id: dcNewBranchId(), label: String.fromCharCode(65 + branches.length), pct: 0 });
    onChange({ branches });
  };
  return (
    <>
      <div className="f-group">
        <label className="f-label">Step name</label>
        <input className="f-input" type="text" value={p.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="f-group">
        <label className="f-label">Branches</label>
        {p.branches.map((b: any, i: number) => (
          <div key={b.id || i}>
            <BranchInsertRow onInsert={() => insertBranch(i - 1)} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input className="f-input" type="text" style={{ flex: 2 }} placeholder="Label" value={b.label} onChange={(e) => setBranch(i, { label: e.target.value })} />
              <input className="f-input" type="number" min={1} max={99} style={{ flex: 1 }} value={b.pct} onChange={(e) => setBranch(i, { pct: e.target.value })} />
              <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>%</span>
              {p.branches.length > 2 && (
                <div className="cond-remove" onClick={() => removeBranch(i)}>
                  ✕
                </div>
              )}
            </div>
          </div>
        ))}
        <div className="add-link" onClick={addBranch}>
          + Add branch
        </div>
        <p className="f-hint" style={{ color: total === 100 ? 'var(--gray-500)' : 'var(--warning-text)', fontWeight: total === 100 ? 400 : 600 }}>
          Total: {total}%{total !== 100 ? ' — must add up to 100%' : ''}
        </p>
      </div>
    </>
  );
}

// Goal Check's "edit" view — read-only by design (Phase 1 §5/§12): it
// carries no configuration of its own, so there's nothing a form could
// let someone change. Selecting it shows what it actually does and links
// back to the one place the goal itself IS editable.
export function GoalCheckInfo({ goal, onGoToGoal }: { goal: DripGoal | null; onGoToGoal?: () => void }) {
  const goalLabel = dcGoalLabel(goal);
  return (
    <>
      <div className="f-group">
        <label className="f-label">Goal Check</label>
        <p className="f-hint" style={{ margin: 0 }}>
          Asks exactly one question, automatically, every time: has the campaign goal been achieved?
        </p>
      </div>
      <div className="f-group">
        <label className="f-label">Campaign goal</label>
        <input className="f-input" type="text" value={goalLabel || 'No goal set'} disabled style={{ background: 'var(--gray-100)', color: 'var(--gray-500)' }} />
      </div>
      {onGoToGoal && (
        <div className="add-link" onClick={onGoToGoal}>
          → Edit the campaign goal
        </div>
      )}
    </>
  );
}

export function ReasonForm({ p, onChange }: FormProps) {
  return (
    <div className="f-group">
      <label className="f-label">Reason</label>
      <input className="f-input" type="text" value={p.reason} onChange={(e) => onChange({ reason: e.target.value })} />
    </div>
  );
}
