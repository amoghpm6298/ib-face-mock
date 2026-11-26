// Quiet hours, said in one sentence.
//
// Written once and read by the Review step and the campaign's own read-back,
// so the two cannot describe the same window differently — the mistake the
// send-timing line made for months.
import type { DripQuietHours } from './graphTypes';
import { dcFormatTimeOfDay } from './sendTiming';

export const DC_DEFAULT_QUIET_HOURS: DripQuietHours = { enabled: true, start: '21:00', end: '09:00', behavior: 'defer' };

export function dcQuietHoursSentence(q: DripQuietHours | undefined): string {
  if (!q || !q.enabled) return 'Quiet hours are off, so messages can go out at any time of day.';
  const what = q.behavior === 'skip' ? 'is not sent at all' : 'waits and goes out when quiet hours end';
  return `No messages between ${dcFormatTimeOfDay(q.start)} and ${dcFormatTimeOfDay(q.end)}. A message due in that window ${what}.`;
}
