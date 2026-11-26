// Step 4 of 5 — exclusion lists, checked continuously at every node
// (unlike Re-entry on Basic Details, which is a one-time gate checked
// only at entry). Deliberately its own step, after Builder: these apply
// to a journey that already exists, and belong in what gets reviewed
// before submission. Kept to the two lists actually named — DNC and NPA
// — not a larger invented taxonomy (opt-outs stay always-on, mentioned
// on Basic Details, not configurable here).
import { ChipPicker } from '../components/ChipPicker';
import type { DripQuietHours } from '../data/graphTypes';

const GUARDRAIL_OPTIONS = ['Do Not Contact (DNC)', 'Non-Performing Assets (NPA)'] as const;

export function GuardrailsStep({
  dnc,
  onDncChange,
  npa,
  onNpaChange,
  quietHours,
  onQuietHoursChange,
  conversionCheck,
  onSaveDraft,
  onContinue,
}: {
  dnc: boolean;
  onDncChange: (v: boolean) => void;
  npa: boolean;
  onNpaChange: (v: boolean) => void;
  quietHours: DripQuietHours;
  onQuietHoursChange: (v: DripQuietHours) => void;
  // Owned by the Goal step; listed here because this is where someone asks
  // "what can stop a message going out?". Three states, not two: a campaign
  // with no goal has nothing to count as a conversion, which is a different
  // sentence from one that counts them and carries on messaging anyway.
  conversionCheck: 'on' | 'off' | 'noGoal';
  onSaveDraft: () => void;
  onContinue: () => void;
}) {
  const selected = [...(dnc ? ['Do Not Contact (DNC)'] : []), ...(npa ? ['Non-Performing Assets (NPA)'] : [])];
  function onToggle(value: string) {
    if (value === 'Do Not Contact (DNC)') onDncChange(!dnc);
    if (value === 'Non-Performing Assets (NPA)') onNpaChange(!npa);
  }

  return (
    <div className="dcb-mid-inner">
      <h1 className="wiz-heading">Who should this campaign never reach?</h1>
      <p className="wiz-sub">This is checked at every step, not just entry. A match skips the rest of the journey.</p>

      <div className="wiz-section">
        <div className="wiz-group-label">Exclusion Lists</div>
        <ChipPicker options={[...GUARDRAIL_OPTIONS]} selected={selected} onToggle={onToggle} />
        <p className="f-hint" style={{ margin: '10px 0 0' }}>Both are on by default. Turn one off only if this campaign targets that group. For example, an NPA recovery campaign turns off NPA.</p>
      </div>

      <div className="wiz-section">
        <div className="wiz-group-label">Quiet Hours</div>
        <div className="toggle-row">
          <div>
            <div className="toggle-row-label">Do not send during quiet hours</div>
            <div className="toggle-row-sub">TRAI allows promotional messages between 9am and 9pm. On by default.</div>
          </div>
          <div
            className={`toggle ${quietHours.enabled ? 'on' : ''}`}
            onClick={() => onQuietHoursChange({ ...quietHours, enabled: !quietHours.enabled })}
          />
        </div>
        {quietHours.enabled && (
          <>
            <div className="f-row2" style={{ marginTop: 12 }}>
              <div className="f-group">
                <label className="f-label">Quiet from</label>
                <input
                  className="f-input"
                  type="time"
                  value={quietHours.start}
                  onChange={(e) => onQuietHoursChange({ ...quietHours, start: e.target.value })}
                />
              </div>
              <div className="f-group">
                <label className="f-label">Until</label>
                <input
                  className="f-input"
                  type="time"
                  value={quietHours.end}
                  onChange={(e) => onQuietHoursChange({ ...quietHours, end: e.target.value })}
                />
              </div>
            </div>
            <div className="f-group">
              <label className="f-label">A message that comes due during quiet hours</label>
              <select
                className="f-input"
                value={quietHours.behavior}
                onChange={(e) => onQuietHoursChange({ ...quietHours, behavior: e.target.value as DripQuietHours['behavior'] })}
              >
                <option value="defer">Waits, and sends when quiet hours end</option>
                <option value="skip">Is not sent at all</option>
              </select>
              <p className="f-hint">
                Waiting keeps the message but delivers it late. Skipping keeps the timing honest but the customer never gets that
                one. The journey carries on either way.
              </p>
            </div>
          </>
        )}
      </div>

      <div className="wiz-section">
        <div className="wiz-group-label">Checked before every message</div>
        {/* Read-only on purpose. Four separate settings decide whether a
            given message actually goes out, and they live on three different
            steps — so the one place that answers "what can stop this send?"
            is here, listing them rather than owning them. */}
        <div className="bd-row">
          <div className="sp-row-key">Has the customer converted?</div>
          <div>
            {conversionCheck === 'on'
              ? 'They stop receiving messages. Set on the Goal step.'
              : conversionCheck === 'off'
                ? 'Not checked — this campaign keeps messaging after they convert.'
                : 'No goal is set, so nothing counts as a conversion.'}
          </div>
        </div>
        <div className="bd-row">
          <div className="sp-row-key">Exclusion lists</div>
          <div>{dnc || npa ? `${[dnc && 'DNC', npa && 'NPA'].filter(Boolean).join(' and ')}. Set above.` : 'None applied.'}</div>
        </div>
        <div className="bd-row">
          <div className="sp-row-key">Opt-outs</div>
          <div>Always checked. Not configurable.</div>
        </div>
        <div className="bd-row">
          <div className="sp-row-key">Quiet hours</div>
          <div>{quietHours.enabled ? 'Applied. Set above.' : 'Off — messages can go out at any time of day.'}</div>
        </div>
      </div>

      <div className="dcb-step-footer">
        <button className="btn secondary" onClick={onSaveDraft}>
          Save as Draft
        </button>
        <button className="btn primary" onClick={onContinue}>
          Continue to Review →
        </button>
      </div>
    </div>
  );
}
