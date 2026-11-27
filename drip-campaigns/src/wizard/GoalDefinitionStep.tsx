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
import { dcConversionSentence, dcWindowNote } from '../data/conversionWindow';

const BLANK_GOAL: DripGoal = { eventCategory: Object.keys(EVENT_CATEGORIES)[0], eventType: '', conditions: [] };

export function GoalDefinitionStep({
  goal,
  onGoalChange,
  goalCheckCount,
  onRemoveGoalChecks,
  journeyLengthDays,
  onSaveDraft,
  onContinue,
}: {
  goal: DripGoal | null;
  onGoalChange: (goal: DripGoal | null) => void;
  // Goal Check steps already on the canvas. They cannot fire once exit on
  // conversion is on, so this is offered here rather than left for the
  // submit gate to refuse two steps later.
  goalCheckCount: number;
  onRemoveGoalChecks: () => void;
  // How long the journey runs, so the window can be explained against it —
  // and a window shorter than the journey can be called out.
  journeyLengthDays: number;
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
        <>
          {/* Two separate things, deliberately apart. The window changes a
              number in a report; the toggle changes who gets messaged. Under
              one "Counting conversions" heading each one read as the other's
              kind of thing. */}
          <div className="wiz-section">
            <div className="wiz-group-label">What counts as a conversion</div>
            <p className="f-hint" style={{ margin: '0 0 12px' }}>{dcConversionSentence(draft, { withWindow: false })}</p>

            <div className="f-group">
              <label className="f-label">Count it if it happens within</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="f-input"
                  type="number"
                  min={1}
                  style={{ maxWidth: 110 }}
                  value={draft.conversionWindow?.duration ?? ''}
                  onChange={(e) => onGoalChange({ ...draft, conversionWindow: { duration: Number(e.target.value), unit: draft.conversionWindow?.unit ?? 'days' } })}
                />
                <select
                  className="f-input"
                  style={{ maxWidth: 110 }}
                  value={draft.conversionWindow?.unit ?? 'days'}
                  onChange={(e) => onGoalChange({ ...draft, conversionWindow: { duration: draft.conversionWindow?.duration ?? 1, unit: e.target.value as 'days' | 'hours' } })}
                >
                  <option value="days">days</option>
                  <option value="hours">hours</option>
                </select>
                <span className="f-hint" style={{ margin: 0 }}>of them entering.</span>
              </div>
              <p className="f-hint">{dcWindowNote(draft, journeyLengthDays)}</p>
              <p className="f-hint">This affects reporting only. It does not change who gets messaged.</p>
            </div>
          </div>

          <div className="wiz-section">
            <div className="wiz-group-label">While the campaign runs</div>
            <div className="toggle-row">
              <div>
                <div className="toggle-row-label">Stop messaging once they convert</div>
                <div className="toggle-row-sub">They get no further messages from this campaign, wherever they are in the journey.</div>
              </div>
              <div
                className={`toggle ${draft.exitOnConversion !== false ? 'on' : ''}`}
                onClick={() => onGoalChange({ ...draft, exitOnConversion: draft.exitOnConversion === false })}
              />
            </div>
            {draft.exitOnConversion === false ? (
              <p className="f-hint" style={{ marginTop: 10 }}>They carry on through the journey after converting. Add a Goal Check step if you want to branch on it.</p>
            ) : null}

            {draft.exitOnConversion !== false && goalCheckCount > 0 ? (
              <div className="dcb-validation-banner" style={{ marginTop: 12 }}>
                <span>
                  This campaign has {goalCheckCount} Goal Check step{goalCheckCount > 1 ? 's' : ''}. {goalCheckCount > 1 ? 'They' : 'It'} cannot fire while
                  customers stop on conversion, because anyone who converts has already left.
                </span>{' '}
                <button type="button" className="btn secondary" style={{ marginLeft: 8 }} onClick={onRemoveGoalChecks}>
                  Remove {goalCheckCount > 1 ? 'them' : 'it'}
                </button>
              </div>
            ) : null}
          </div>
        </>
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
