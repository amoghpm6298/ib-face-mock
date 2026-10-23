// Journey/Offer Events' own scoping fields — shared by Goal Definition,
// Entry · Event, and Wait for Event (the three places an Event Category
// is picked), so the two categories' scoping can't drift between call
// sites. Ported from journeysnudgesemi/emi-conversions-prototype.html's
// separate "event-based nudges" EVENT_TRIGGER step, which shows these
// directly above its own Event Conditions block for exactly these two
// categories and nothing else.
//
// Offer Name is a free-text field, not a select — the source's own
// EVENT_TRIGGER step only ever hardcodes one example ('Festive EMI
// Push') for it, with no real catalog anywhere in that file to draw a
// list from (see OFFER_TYPE_OPTIONS's own comment in sharedConstants.ts
// for why `IBL_CAMPAIGNS` doesn't count as one).
import { JOURNEY_OPTIONS, BATCH_OPTIONS, OFFER_TYPE_OPTIONS, CARD_CONTROL_LIMITS, cardEventDetailFields, dcValidEventType } from '../data/sharedConstants';

export interface EventScopingValue {
  journey?: string;
  batch?: string;
  offerType?: string;
  offerName?: string;
}

export function EventScopingFields({
  eventCategory,
  value,
  onChange,
}: {
  eventCategory: string;
  value: EventScopingValue;
  onChange: (patch: EventScopingValue) => void;
}) {
  if (eventCategory === 'Journey Events') {
    return (
      <div className="f-row2">
        <div className="f-group">
          <label className="f-label">Journey</label>
          <select className="f-input" value={value.journey || ''} onChange={(e) => onChange({ journey: e.target.value })}>
            <option value="">Select</option>
            {JOURNEY_OPTIONS.map((j) => (
              <option key={j}>{j}</option>
            ))}
          </select>
        </div>
        <div className="f-group">
          <label className="f-label">Batch</label>
          <select className="f-input" value={value.batch || ''} onChange={(e) => onChange({ batch: e.target.value })}>
            <option value="">Select</option>
            {BATCH_OPTIONS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>
    );
  }
  if (eventCategory === 'Offer Events') {
    return (
      <div className="f-row2">
        <div className="f-group">
          <label className="f-label">Offer Type</label>
          <select className="f-input" value={value.offerType || ''} onChange={(e) => onChange({ offerType: e.target.value })}>
            <option value="">Select</option>
            {OFFER_TYPE_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div className="f-group">
          <label className="f-label">Offer Name</label>
          <input className="f-input" type="text" placeholder="e.g. Festive EMI Push" value={value.offerName || ''} onChange={(e) => onChange({ offerName: e.target.value })} />
        </div>
      </div>
    );
  }
  return null;
}

// A card event's own details, wherever a card event is chosen — Entry ·
// Event, the Goal, and Wait for Event. Two events carry them; the rest
// render nothing.
//
// Stored flat on the same config/goal object as everything else here, under
// `cardDetails`, so an old campaign simply lacks the key.
// Keyed by the detail's own field name, so a new detail needs no new type.
export type CardEventDetailValue = Record<string, string>;

export function CardEventDetailFields({
  eventCategory,
  eventType,
  value,
  onChange,
}: {
  eventCategory: string;
  eventType: string;
  value: CardEventDetailValue | undefined;
  onChange: (next: CardEventDetailValue) => void;
}) {
  if (eventCategory !== 'Card Events') return null;
  const fields = cardEventDetailFields(dcValidEventType(eventCategory, eventType));
  if (!fields) return null;
  const details = value || {};
  // The amount only means anything once Change is one of the three limits.
  const changeIsLimit = CARD_CONTROL_LIMITS.includes(details.Change || '');
  return (
    <div className="f-group">
      <label className="f-label">
        Event detail <span style={{ fontWeight: 400, color: 'var(--gray-500)' }}>(optional)</span>
      </label>
      {Object.entries(fields).map(([name, meta]) => {
        if (name === 'Limit amount' && !changeIsLimit) return null;
        return (
          <div key={name} style={{ marginBottom: 8 }}>
            <label className="f-label" style={{ fontWeight: 500 }}>
              {name}
            </label>
            {meta.type === 'number' ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="f-input"
                  type="number"
                  min={0}
                  value={details[name] || ''}
                  onChange={(e) => onChange({ ...details, [name]: e.target.value })}
                />
                <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>₹</span>
              </div>
            ) : (
              <select
                className="f-input"
                value={details[name] || ''}
                onChange={(e) => {
                  const next: CardEventDetailValue = { ...details, [name]: e.target.value };
                  // Moving off a limit drops the amount it belonged to.
                  if (name === 'Change' && !CARD_CONTROL_LIMITS.includes(e.target.value)) delete next['Limit amount'];
                  onChange(next);
                }}
              >
                <option value="">Any</option>
                {(meta.options || []).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}
