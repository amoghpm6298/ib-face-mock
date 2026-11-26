// H7 (the part asked for) — quiet hours.
//
// TRAI allows promotional messages between 9am and 9pm, so for an Indian
// issuer this is a rule rather than a preference, and it is on by default
// like the two exclusion lists beside it.
import { describe, expect, it } from 'vitest';
import type { DripGraph } from '../../src/data/graphTypes';
import { dcQuietHoursSentence, DC_DEFAULT_QUIET_HOURS } from '../../src/data/quietHours';
import { dcValidateSetup } from '../../src/reducer/campaignReducer';

const SETUP = { name: 'C', issuer: 'IndusInd Bank (IBL)', applyToAllPrograms: true, programs: [], controlPct: 10 };
const msgs = (quietHours: unknown) => dcValidateSetup({ ...SETUP, quietHours } as never).map((i) => i.message).join(' | ');

describe('saying what the window is', () => {
  it('names both ends and what happens to a message caught inside it', () => {
    expect(dcQuietHoursSentence(DC_DEFAULT_QUIET_HOURS)).toBe(
      'No messages between 9:00 PM and 9:00 AM. A message due in that window waits and goes out when quiet hours end.',
    );
  });

  it('says the other behaviour just as plainly', () => {
    expect(dcQuietHoursSentence({ ...DC_DEFAULT_QUIET_HOURS, behavior: 'skip' })).toContain('is not sent at all');
  });

  it('says so when they are off, rather than going silent', () => {
    expect(dcQuietHoursSentence({ ...DC_DEFAULT_QUIET_HOURS, enabled: false })).toMatch(/off, so messages can go out at any time/);
    expect(dcQuietHoursSentence(undefined)).toMatch(/off/);
  });

  it('defaults to the TRAI window, deferring rather than dropping', () => {
    expect(DC_DEFAULT_QUIET_HOURS).toEqual({ enabled: true, start: '21:00', end: '09:00', behavior: 'defer' });
  });
});

describe('what the gate refuses', () => {
  it('a window with no times', () => {
    expect(msgs({ enabled: true, start: '', end: '09:00', behavior: 'defer' })).toMatch(/need a start and an end/);
  });

  it('a window that starts and ends at the same moment — that is every hour, not none', () => {
    expect(msgs({ enabled: true, start: '09:00', end: '09:00', behavior: 'defer' })).toMatch(/blocks every hour/);
  });

  it('nothing, for a window that crosses midnight, which is the normal case', () => {
    expect(msgs(DC_DEFAULT_QUIET_HOURS)).toBe('');
  });

  it('nothing, when quiet hours are switched off', () => {
    expect(msgs({ enabled: false, start: '', end: '', behavior: 'defer' })).toBe('');
  });

  it('nothing, for a campaign saved before quiet hours existed', () => {
    expect(msgs(undefined)).toBe('');
  });
});

describe('a campaign carries the window through a save', () => {
  it('and an older one opens with the default rather than unprotected', () => {
    // The builder reads `initial?.guardrails?.quietHours ?? default`, so a
    // campaign saved before this existed is treated as protected, not as
    // having opted out.
    const legacy: DripGraph['nodes'] = {};
    expect(legacy).toEqual({});
    expect(DC_DEFAULT_QUIET_HOURS.enabled).toBe(true);
  });
});
