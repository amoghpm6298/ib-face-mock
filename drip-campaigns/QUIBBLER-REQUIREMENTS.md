# What the drip builder needs from the nudge engine

Short note for whoever owns `quibbler`. The builder now lets a campaign
manager say three things it cannot enforce on its own. Nothing here is urgent
until a drip campaign actually runs through the engine, but the builder's
wording was chosen around what is and is not confirmed, so it is worth
agreeing before it reaches anyone.

## 1. A pending message is not dispatched when it should not be

The builder tells managers that a message **will not be sent** when, at the
time it would go out, the account:

- **has already converted**, and the campaign is set to stop messaging on
  conversion (the default), and the conversion happened within the campaign's
  conversion window;
- **is excluded** — DNC, NPA, or opted out;
- **is inside quiet hours**, in which case the message either waits until the
  window lifts or is dropped, as the campaign says.

This is a check **before dispatch**, not a promise to cancel anything. That
distinction is why the UI says "receives no further messages" rather than "is
removed the moment they convert".

What exists today, from reading the repo: `NudgeCommunicationData` rows are
queued with `dispatched = false` and picked up by a cron, which is the right
shape for a pre-dispatch check. What could not be established from a quick
read is whether the dispatch path re-checks eligibility at that point. **That
is the question to answer first** — everything else here depends on it.

## 2. Cancelling on the event is optional

If the engine can drop queued messages the moment the goal event arrives,
good: the behaviour is sharper and the wording can be strengthened. If it
cannot, the pre-dispatch check in (1) gives the same outcome a little later,
and the builder's current wording already covers it. **No UI depends on
cancellation**, by choice.

## 3. Conversion is counted per account, within a window

- A run is keyed to the **account**, which the builder takes from this engine
  rather than deciding: `nudge_subscription` is unique on
  `(account_id, nudge_dfn_id)`, `NudgeSubscriptionV2` carries only an
  `accountId`, and every `NudgeCommunicationData` row is addressed by account
  with no customer or card id anywhere in the path.
- A conversion is the **first** qualifying goal event by that account **after
  it entered**, within the campaign's conversion window, measured from entry.
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
