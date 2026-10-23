// One filter row: what, comparison, value. Used by Entry · Audience and
// Condition as a repeatable AND'd list, and by Branch for the single shared
// question its arms route on.
//
// The "what" is one grouped list. Transactions, Milestone, Entry event and
// Previous message are groups in it rather than separate forms, so there is
// no Source control and no Entity control anywhere any more.
import { MultiSelectDropdown } from '../components/MultiSelectDropdown';
import { SearchSelect } from '../components/SearchSelect';
import { ConditionRows, ValueField } from './ConditionRows';
import type { DripFilterRow } from '../data/graphTypes';
import {
  APP_EVENTS,
  PROGRAM_OFFERS,
  appEventById,
  TXN_EXISTS,
  dcComparisonsForFilter,
  dcFilterAttrMeta,
  dcFilterOptionGroups,
  deliveryStatusOptionsAll,
  deliveryStatusOptionsForSend,
  CHANNEL_CONFIG_LABELS,
  type PrevStepSend,
} from '../data/sharedConstants';
import { dcDefaultFilterRow, dcDefaultTxnForRow, dcDetailsForEvent, type FilterContext } from '../data/filters';

const SEP = '::';

export interface FilterRowsProps {
  rows: DripFilterRow[];
  onChange: (rows: DripFilterRow[]) => void;
  previousMessage?: boolean;
  previousStepChannel?: PrevStepSend | null;
  ctx?: FilterContext;
}

export function WhatSelect({
  group,
  field,
  previousMessage,
  ctx,
  onPick,
}: {
  group: string;
  field: string;
  previousMessage?: boolean;
  ctx?: FilterContext;
  onPick: (group: string, field: string) => void;
}) {
  const groups = dcFilterOptionGroups({
    previousMessage,
    entryEventEntity: ctx?.entryEventEntity,
    entryEventLockedAttr: ctx?.entryEventLockedAttr,
  });
  // App activity stores the chosen EVENT in `field`, but the group list
  // carries a single entry for it, so the select matches on the group alone.
  // Picking the event is a search, on the row.
  const current = group === 'App activity' ? `App activity${SEP}` : group ? `${group}${SEP}${field}` : '';
  return (
    <select
      value={current}
      onChange={(e) => {
        const [g, f = ''] = e.target.value.split(SEP);
        onPick(g, f);
      }}
    >
      <option value="">What</option>
      {groups.map((g) => (
        <optgroup key={g.group} label={g.group}>
          {g.options.map((o) => (
            <option key={`${o.group}${SEP}${o.field}`} value={`${o.group}${SEP}${o.field}`}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// The event itself, picked by search, plus whatever details that event
// actually has. Shared by a filter row and by a Branch's single shared
// event, so the two cannot offer different things.
export function AppEventFields({
  field,
  details,
  showDetails = true,
  onChange,
}: {
  field: string;
  details?: Record<string, string>;
  // A Branch picks the event once but sets details per arm, so the shared
  // block hides them.
  showDetails?: boolean;
  onChange: (patch: { field?: string; details?: Record<string, string> }) => void;
}) {
  const event = appEventById(field);
  return (
    <>
      <label className="f-label">Event</label>
      <SearchSelect
        options={APP_EVENTS.map((e) => ({ value: e.id, label: e.label, searchText: e.raw, group: e.category }))}
        value={field}
        placeholder="Search events"
        emptyText="No event matches that."
        // Switching the event drops details the new one does not have.
        onPick={(id) => onChange({ field: id, details: dcDetailsForEvent(id, details) })}
      />
      {showDetails && event?.details?.includes('offer') && (
        <div style={{ marginTop: 10 }}>
          <AppOfferDetail value={details?.offer || ''} onChange={(offer) => onChange({ details: { ...(details || {}), offer } })} />
        </div>
      )}
    </>
  );
}

// An event's Offer detail. Left empty it means any offer, so the list
// carries an explicit "Any offer" entry rather than leaving blank ambiguous.
export function AppOfferDetail({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <>
      <label className="f-label">Offer</label>
      <SearchSelect
        options={[{ value: '', label: 'Any offer' }, ...PROGRAM_OFFERS.map((o) => ({ value: o.id, label: o.name }))]}
        value={value}
        placeholder="Search offers"
        emptyText="No offer matches that."
        onPick={onChange}
      />
    </>
  );
}

// A rupee or percent sign beside the input, so the row reads the same way
// the sentence will.
function UnitAdornment({ unit }: { unit?: 'rupees' | 'percent' }) {
  if (!unit) return null;
  return <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--gray-600)' }}>{unit === 'rupees' ? '₹' : '%'}</span>;
}

export function FilterValue({
  row,
  previousStepChannel,
  ctx,
  hideTxnLookback,
  onPatch,
}: {
  row: DripFilterRow;
  previousStepChannel?: PrevStepSend | null;
  ctx?: FilterContext;
  // Branch arms share one lookback and one set of transaction fields, so an
  // arm shows only its direction and the shared parts sit by the "what".
  hideTxnLookback?: boolean;
  onPatch: (patch: Partial<DripFilterRow>) => void;
}) {
  if (row.group === 'Transactions' && hideTxnLookback) return null;
  if (row.group === 'App activity') {
    // A whole number of days the manager types. Nothing fixed.
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
        <span style={{ fontSize: 13, color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>in the last</span>
        <input
          className="f-input"
          type="number"
          min={1}
          step={1}
          style={{ flex: '1 1 52px', minWidth: 0 }}
          value={row.value || ''}
          onChange={(e) => onPatch({ value: e.target.value })}
        />
        <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>days</span>
      </div>
    );
  }
  if (row.group === 'Transactions') {
    const txn = row.txn ?? dcDefaultTxnForRow();
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>in the last</span>
        <input
          className="f-input"
          type="number"
          min={0}
          step={1}
          style={{ flex: '0 1 80px', minWidth: 0 }}
          value={txn.lookbackDuration}
          onChange={(e) => onPatch({ txn: { ...txn, lookbackDuration: Number(e.target.value) } })}
        />
        <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>days</span>
      </div>
    );
  }
  if (row.group === 'Previous message') {
    const options = previousStepChannel ? deliveryStatusOptionsForSend(previousStepChannel) : deliveryStatusOptionsAll();
    const selected = row.values || [];
    return (
      <MultiSelectDropdown
        options={options}
        selected={selected}
        onToggle={(v) => onPatch({ values: selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v] })}
      />
    );
  }
  if (row.group === 'Milestone') {
    // Progress the manager types. A percent by default, switchable to a
    // rupee amount on the same row — no Completed/Not Completed choice,
    // since "is at least 100%" already says completed.
    const unit = row.valueUnit ?? 'percent';
    const num = (field: 'value' | 'value2', placeholder: string) => (
      <input
        className="f-input"
        type="number"
        min={0}
        // The row's value cell is one grid column, so the number and its
        // unit have to share it without wrapping in the common single-value
        // case. Both shrink rather than pushing the unit onto its own line.
        style={{ flex: '1 1 56px', minWidth: 0 }}
        placeholder={placeholder}
        value={(field === 'value2' ? row.value2 : row.value) || ''}
        onChange={(e) => onPatch({ [field]: e.target.value } as Partial<DripFilterRow>)}
      />
    );
    return (
      <div style={{ display: 'flex', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
        {row.operator === 'is between' ? (
          <>
            {num('value', 'From')}
            {num('value2', 'To')}
          </>
        ) : (
          num('value', 'Progress')
        )}
        <select className="f-input" style={{ flex: '0 0 58px', minWidth: 0 }} value={unit} onChange={(e) => onPatch({ valueUnit: e.target.value as 'percent' | 'rupees' })}>
          <option value="percent">%</option>
          <option value="rupees">₹</option>
        </select>
      </div>
    );
  }
  const meta = dcFilterAttrMeta(row.group, row.field, ctx?.entryEventEntity);
  return (
    <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
      <ValueField
        cond={{ attribute: row.field, operator: row.operator || '', value: row.value, value2: row.value2, values: row.values }}
        attrMeta={meta}
        onPatch={(patch) => onPatch(patch as Partial<DripFilterRow>)}
        onToggleMulti={(v) => {
          const values = row.values ? [...row.values] : [];
          const i = values.indexOf(v);
          if (i > -1) values.splice(i, 1);
          else values.push(v);
          onPatch({ values, operator: 'is any of' });
        }}
      />
      <UnitAdornment unit={meta?.unit} />
    </div>
  );
}

// The comparison cell. Milestone stores a real operator code and shows a
// lowercased label, so the dropdown reads like the sentence without
// inventing a second vocabulary.
export function FilterComparison({ row, ctx, onPatch }: { row: DripFilterRow; ctx?: FilterContext; onPatch: (patch: Partial<DripFilterRow>) => void }) {
  const options = dcComparisonsForFilter(row.group, row.field, ctx?.entryEventEntity).map((l) => ({ value: l, label: l }));
  return (
    <select value={row.operator || ''} onChange={(e) => onPatch({ operator: e.target.value, value: '', value2: '' })}>
      <option value="">Comparison</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function FilterRows({ rows, onChange, previousMessage, previousStepChannel, ctx }: FilterRowsProps) {
  const setRow = (i: number, patch: Partial<DripFilterRow>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const addRow = () => onChange([...rows, dcDefaultFilterRow()]);

  const pickWhat = (i: number, group: string, field: string) => {
    // Everything below the "what" belongs to the old question, so it is
    // cleared rather than carried into a filter that means something else.
    const next: DripFilterRow = { group, field, operator: '' };
    if (group === 'Transactions') {
      next.operator = TXN_EXISTS;
      next.txn = dcDefaultTxnForRow();
    } else if (group === 'Milestone') {
      next.valueUnit = 'percent';
    } else if (group === 'App activity') {
      next.operator = 'happened';
      next.value = '7';
      next.details = {};
    } else {
      // A comparison with exactly one real choice is filled in rather than
      // asked for, the same precedent multiSelect's "is any of" already set.
      // Done here, on the pick, rather than during render.
      const only = dcComparisonsForFilter(group, field, ctx?.entryEventEntity);
      if (only.length === 1) next.operator = only[0];
    }
    onChange(rows.map((r, idx) => (idx === i ? next : r)));
  };

  return (
    <>
      {rows.map((row, i) => (
        <div key={i}>
          <div className="cond-row">
            <WhatSelect group={row.group} field={row.field} previousMessage={previousMessage} ctx={ctx} onPick={(g, f) => pickWhat(i, g, f)} />
            <FilterComparison row={row} ctx={ctx} onPatch={(patch) => setRow(i, patch)} />
            <FilterValue row={row} previousStepChannel={previousStepChannel} ctx={ctx} onPatch={(patch) => setRow(i, patch)} />
            <div className="cond-remove" onClick={() => removeRow(i)}>
              ✕
            </div>
          </div>
          {row.group === 'App activity' && (
            // The event and its details sit under the row they belong to,
            // the same place a Transactions row keeps its fields.
            <div style={{ margin: '0 0 10px 12px', paddingLeft: 12, borderLeft: '2px solid var(--gray-200)' }}>
              <AppEventFields field={row.field} details={row.details} onChange={(patch) => setRow(i, patch)} />
            </div>
          )}
          {row.group === 'Transactions' && (
            // The transaction fields themselves, which scope what counts as
            // a matching transaction. Kept under the row they belong to.
            <div style={{ margin: '0 0 10px 12px', paddingLeft: 12, borderLeft: '2px solid var(--gray-200)' }}>
              <ConditionRows
                conditions={(row.txn ?? dcDefaultTxnForRow()).filters}
                entity="Transaction"
                onChange={(filters) => setRow(i, { txn: { ...(row.txn ?? dcDefaultTxnForRow()), filters } })}
              />
            </div>
          )}
        </div>
      ))}
      <div className="add-link" onClick={addRow}>
        + Add filter
      </div>
      {rows.length > 1 && <p className="f-hint" style={{ margin: '4px 0 0' }}>A customer must match all of them.</p>}
      {previousMessage && previousStepChannel && (
        <p className="f-hint" style={{ margin: '4px 0 0' }}>
          Previous message reads{' '}
          {CHANNEL_CONFIG_LABELS[previousStepChannel.channel]}
          {previousStepChannel.fallbackChannel ? ` and its ${CHANNEL_CONFIG_LABELS[previousStepChannel.fallbackChannel]} fallback` : ''}.
        </p>
      )}
    </>
  );
}
