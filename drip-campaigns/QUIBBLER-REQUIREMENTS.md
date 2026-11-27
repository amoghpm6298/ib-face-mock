# What the drip builder needs from the nudge engine

Short note for whoever owns `quibbler`.

**Most of this is already answered by the engine.** An earlier draft asked
whether a queued message is re-checked before it is sent. It is:
`NudgeSchedulerCron` re-checks a due execution and cancels it outright, and
`NudgeCancelReason` lists what for — `CANCEL_EVENT_RECEIVED`,
`FREQUENCY_LIMIT_REACHED`, `COOLDOWN_PERIOD_ACTIVE`, `NUDGE_DEACTIVATED`,
`DUPLICATE_IDEMPOTENCY_KEY`, `QUIET_HOURS_DROPPED`, `EXPIRED`.

What is left is a mapping question, not a capability one: how the builder's
settings should be expressed as nudge definitions.

## 1. A pending message is not dispatched when it should not be

The builder tells managers that a message **will not be sent** when, at the
time it would go out, the account:

- **has already converted**, and the campaign is set to stop messaging on
  conversion (the default). **The conversion window does not apply here.** It
  decides what the report counts, not who gets messaged — someone who
  converted outside the window has still converted, and messaging them anyway
  would be wrong;
- **is excluded** — DNC, NPA, or opted out;
- **is inside quiet hours**, in which case the message either waits until the
  window lifts or is dropped, as the campaign says.

All three are already enforced engine-side. The mapping we need confirmed:

- **Conversion** → a `CancelEventDefinition` naming the campaign's goal event.
  It takes an optional `ConditionNode`, so the goal's own conditions should
  travel with it rather than only the bare event type.
  - What this cancels is a **scheduled send**, not a queued message: no
    message exists until the send comes due. `NudgeExecutionStatus` lets
    `SCHEDULED` and `IN_PROGRESS` reach `CANCELLED`; `DISPATCH_QUEUED`
    cannot. So a send already handed over for delivery still goes out.
    Worth confirming that this is the intended boundary rather than an
    accident of the state machine.
- **Quiet hours** → whatever drives `QUIET_HOURS_DROPPED`. The builder offers
  both "wait until the window lifts" and "skip it"; we need to know whether
  the engine supports both or only the drop.

## 2. Frequency caps exist, and the builder does not use them yet

`FrequencyPolicy` carries `frequencyCaps` and a `CoolDownDefinition`, both
enforced at send time. The builder has no UI for either. When we add one, the
open design question is scope — per campaign, per label, or workspace-wide —
and whether a campaign can be exempted, not whether the platform can do it.

## 3. Conversion is counted per account, within a window

- A run is keyed to the **account**, which the builder takes from this engine
  rather than deciding: `nudge_subscription` is unique on
  `(account_id, nudge_dfn_id)`, `NudgeSubscriptionV2` carries only an
  `accountId`, and every `NudgeCommunicationData` row is addressed by account
  with no customer or card id anywhere in the path.
- A conversion is the **first** qualifying goal event by that account **after
  it entered**, within the campaign's conversion window, measured from entry.
  This is an **attribution rule only**: it decides what the campaign may claim
  credit for. It never decides whether a message goes out.
- The **held-back (control) group is measured the same way**, over the same
  window. Different clocks for the two groups would make the comparison
  meaningless.
- The campaign's **end date stops messages but does not stop counting**: an
  account that entered before the end date keeps its own window.

## Not asked for

Frequency capping, per-channel consent, throttling, cross-campaign holdout
and entry-time attribute snapshots are all deliberately out — the builder
does not offer any of them, and `ConfigBasedEligibility` has no
point-in-time concept today (only `OfferCycle` CURRENT/PREVIOUS and
`CurrentDiffFilter`, both relative to now).
