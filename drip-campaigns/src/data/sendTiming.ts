// When does a Send actually go out?
//
// There used to be two answers in three places: the drawer offered
// "Absolute" (a time of day) or "Relative" (a delay after the previous
// step), the canvas formatted one string from those fields, and the step
// panel formatted a different one — which is how the seeds came to read
// "Immediately after previous step" on the canvas and "0 days after
// Previous Step" in the panel for the same send.
//
// A delay INSIDE a send was also a wait that nothing could see: it does not
// appear on the canvas as a step, analytics does not model it, and — the
// reason it matters after C1 — it does not listen for the goal. A customer
// who converts during those three days is messaged anyway. That is the same
// defect C1 fixed for goal checks, wearing a different hat, so the delay is
// gone: anything that needs a gap uses a Wait step, which is visible,
// counted, and listens.
//
// `relativeAnchor` went with it. It was stored ('Entry' / 'Previous Step')
// and no form ever offered it, while the one label that existed said "after
// previous step" regardless.
export type DripSendTiming =
  | { kind: 'at'; time: string }
  | { kind: 'immediate' }
  // Only reachable from a campaign saved before the delay was removed. Kept
  // readable rather than silently dropped — the submit gate names it and
  // asks for a Wait step, because turning one into the other changes the
  // shape of the journey and that is the author's call, not a migration's.
  | { kind: 'legacyDelay'; duration: number; unit: string }
  | { kind: 'unset' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dcSendTimingOf(p: any): DripSendTiming {
  p = p || {};
  if (p.timing === 'Absolute') return p.absTime ? { kind: 'at', time: String(p.absTime) } : { kind: 'unset' };
  if (p.timing === 'Immediate') return { kind: 'immediate' };
  // Legacy 'Relative'. A delay of zero always meant exactly "immediate",
  // which is what every seeded Send stored, so it reads as immediate rather
  // than as something needing attention.
  const d = Number(p.relativeDuration);
  if (p.relativeDuration === undefined || p.relativeDuration === null || p.relativeDuration === '' || Number.isNaN(d)) {
    return p.timing === 'Relative' ? { kind: 'immediate' } : { kind: 'unset' };
  }
  if (d <= 0) return { kind: 'immediate' };
  return { kind: 'legacyDelay', duration: d, unit: String(p.relativeUnit || 'days') };
}

export function dcFormatTimeOfDay(time: string): string {
  const [h, m] = String(time || '').split(':');
  const hour = Number(h);
  if (!time || Number.isNaN(hour)) return String(time || '');
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m ?? '00'} ${suffix}`;
}

// One sentence, used by the canvas card and the step panel alike.
export function dcSendTimingLabel(timing: DripSendTiming): string {
  switch (timing.kind) {
    case 'at':
      return dcFormatTimeOfDay(timing.time);
    case 'immediate':
      return 'As soon as they reach this step';
    case 'legacyDelay':
      return `${timing.duration} ${timing.unit} after the previous step`;
    default:
      return '';
  }
}
