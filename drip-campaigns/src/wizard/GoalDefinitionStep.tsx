// Step 2 of 4 — lifted out of the old GoalDrawer (opened from inside the
// canvas) into its own full-width step page, same plain-form treatment
// as Basic Details.
//
// Phase 3 (creation-flow refinement): reframed around the user's actual
// question — "what counts as success for this campaign?" — rather than
// exposing Event Category/Event Type as if this were a generic event
// picker. The form is always open (an earlier pass gated it behind a
// "Define a goal" click on an intentional empty-state card — removed
// per direct user feedback: there's no reason to require an extra click
// before reaching a form that's reachable from a single rail click
// anyway). Leaving Event Type unset still means no goal, same as
// before — only the entry point changed, not the underlying semantics.
//
// Event Category / Event Type keep their existing (backend-shaped)
// labels deliberately — the brief that drove this pass asked for
// consistency with the Event picker inside the Journey Builder over a
// prettier-but-divergent vocabulary here, and the Builder's own Entry/
// Wait-for-Event forms still say "Event Category"/"Event Type" (out of
// scope for this pass), so changing just this screen's labels would
// create a second, inconsistent vocabulary rather than fix one.
import { ConditionsSection } from './ConditionRows';
import { EventScopingFields, CardEventDetailFields } from './EventScopingFields';
import { EVENT_CATEGORIES, dcValidEventType, resolveEntryEventAttrSource } from '../data/sharedConstants';
import type { DripGoal } from '../data/graphTypes';
import { dcConversionSentence } from '../data/conversionWindow';

const BLANK_GOAL: DripGoal = { eventCategory: Object.keys(EVENT_CATEGORIES)[0], eventType: '', conditions: [] };

export function GoalDefinitionStep({
  goal,
  onGoalChange,
  onSaveDraft,
  onContinue,
}: {
  goal: DripGoal | null;
  onGoalChange: (goal: DripGoal | null) => void;
  onSaveDraft: () => void;
  onContinue: () => void;
}) {
  const draft = goal ?? BLANK_GOAL;

  return (
    <div className="dcb-mid-inner">
      <h1 className="wiz-heading">What outcome should count as success?</h1>
      <p className="wiz-sub">Choose the event that counts as success. Not every campaign needs one.</p>

      <div className="wiz-section">
        <div className="wiz-group-label">Goal Event</div>
        <div className="f-group">
          <label className="f-label">Event Category</label>
          <select className="f-input" value={draft.eventCategory} onChange={(e) => onGoalChange({ ...draft, eventCategory: e.target.value, eventType: '' })}>
            {Object.keys(EVENT_CATEGORIES).map((k) => (
              <option key={k} value={k}>
                {k}
                {EVENT_CATEGORIES[k].isNew ? ' (New)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="f-group" style={{ marginBottom: 6 }}>
          <label className="f-label">Event Type</label>
          <select className="f-input" value={dcValidEventType(draft.eventCategory, draft.eventType)} onChange={(e) => onGoalChange({ ...draft, eventType: e.target.value, cardDetails: {} })}>
            <option value="">No goal — leave unset</option>
            {(EVENT_CATEGORIES[draft.eventCategory]?.events || []).map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <p className="f-hint" style={{ margin: 0 }}>Not every firing is success. For example, EMI_STATUS_CHANGED also fires on Failed. Narrow it below if needed.</p>
      </div>

      <CardEventDetailFields eventCategory={draft.eventCategory} eventType={draft.eventType} value={draft.cardDetails} onChange={(cardDetails) => onGoalChange({ ...draft, cardDetails })} />
      <EventScopingFields
        eventCategory={draft.eventCategory}
        value={draft}
        onChange={(patch) => onGoalChange({ ...draft, ...patch })}
      />

      {(() => {
        const { entity, lockedAttr } = resolveEntryEventAttrSource(draft.eventCategory, draft.eventType);
        if (!entity && !lockedAttr) return null;
        return (
          <div className="wiz-section">
            <div className="wiz-group-label">Goal Conditions</div>
            <ConditionsSection conditions={draft.conditions} entity={entity} lockedAttribute={lockedAttr} onChange={(conditions) => onGoalChange({ ...draft, conditions })} />
          </div>
        );
      })()}

      {draft.eventType ? (
        <div className="wiz-section">
          <div className="wiz-group-label">Counting conversions</div>

          <div className="f-group">
            <label className="f-label">Conversion window</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                className="f-input"
                type="number"
                min={1}
                style={{ maxWidth: 120 }}
                value={draft.conversionWindow?.duration ?? ''}
                onChange={(e) => onGoalChange({ ...draft, conversionWindow: { duration: Number(e.target.value), unit: draft.conversionWindow?.unit ?? 'days' } })}
              />
              <select
                className="f-input"
                style={{ maxWidth: 120 }}
                value={draft.conversionWindow?.unit ?? 'days'}
                onChange={(e) => onGoalChange({ ...draft, conversionWindow: { duration: draft.conversionWindow?.duration ?? 1, unit: e.target.value as 'days' | 'hours' } })}
              >
                <option value="days">days</option>
                <option value="hours">hours</option>
              </select>
            </div>
            <p className="f-hint">Measured from the moment an account enters, not from the last message. Suggested from the length of the journey when the goal was set; change it if that is not the window you mean.</p>
          </div>

          <div className="toggle-row">
            <div>
              <div className="toggle-row-label">Stop messaging customers once they convert</div>
              <div className="toggle-row-sub">Checked wherever they are in the journey, not just at a step that asks. On by default.</div>
            </div>
            <div
              className={`toggle ${draft.exitOnConversion !== false ? 'on' : ''}`}
              onClick={() => onGoalChange({ ...draft, exitOnConversion: draft.exitOnConversion === false })}
            />
          </div>

          <p className="f-hint" style={{ marginTop: 10 }}>{dcConversionSentence(draft)}</p>
          {draft.exitOnConversion === false ? (
            <p className="f-hint">With this off, customers carry on through the journey after converting. Add a Goal Check step if you want to branch on it.</p>
          ) : null}
        </div>
      ) : null}

      <div className="dcb-step-footer">
        <button className="btn secondary" onClick={onSaveDraft}>
          Save as Draft
        </button>
        <button className="btn primary" onClick={onContinue}>
          Continue to Builder →
        </button>
      </div>
    </div>
  );
}
