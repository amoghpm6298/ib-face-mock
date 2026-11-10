// Journey and Offer events narrow on a single locked attribute, and each of
// those attributes is a CLOSED list in the real screen — not free text.
// Typing the value by hand let a status be saved that does not exist.
import { describe, expect, it } from 'vitest';
import {
  EVENT_ATTR_BY_TYPE,
  EVENT_ATTR_VALUE_OPTIONS,
  LOCKED_ATTR_OPERATORS,
  dcLockedAttrMeta,
  dcOperatorsForAttribute,
} from '../../src/data/sharedConstants';

describe('the values a locked attribute accepts', () => {
  it('covers every locked attribute the event types resolve to', () => {
    const locked = [...new Set(Object.values(EVENT_ATTR_BY_TYPE))].sort();
    expect(Object.keys(EVENT_ATTR_VALUE_OPTIONS).sort()).toEqual(locked);
  });

  it('Outcome Status is the real five, in the real order', () => {
    expect(EVENT_ATTR_VALUE_OPTIONS['Outcome Status']).toEqual([
      'Posted',
      'Posting Pending',
      'Cancelled',
      'Pending Clawback',
      'Clawback',
    ]);
  });

  it('carries the other three lists as the source has them', () => {
    expect(EVENT_ATTR_VALUE_OPTIONS['Page Name']).toEqual(['landing', 'success', 'error']);
    expect(EVENT_ATTR_VALUE_OPTIONS['Button Name']).toEqual(['Start', 'Verify OTP', 'Request OTP']);
    expect(EVENT_ATTR_VALUE_OPTIONS.Status).toEqual(['In Progress', 'Completed']);
  });

  it('omits Not Started, which the backend does not support', () => {
    expect(EVENT_ATTR_VALUE_OPTIONS.Status).not.toContain('Not Started');
  });

  it('resolves as an ordinary select attribute, so the row gets a picker', () => {
    expect(dcLockedAttrMeta('Outcome Status')).toEqual({
      type: 'select',
      options: EVENT_ATTR_VALUE_OPTIONS['Outcome Status'],
    });
  });

  it('is null for an attribute with no closed list, and for none at all', () => {
    expect(dcLockedAttrMeta('Transaction Amount')).toBeNull();
    expect(dcLockedAttrMeta(null)).toBeNull();
    expect(dcLockedAttrMeta(undefined)).toBeNull();
  });
});

describe('what a locked attribute can be compared with', () => {
  it('a closed list never offers more-than or less-than', () => {
    for (const attr of Object.keys(EVENT_ATTR_VALUE_OPTIONS)) {
      const ops = dcOperatorsForAttribute(dcLockedAttrMeta(attr), { locked: true });
      expect(ops, attr).not.toContain('is more than');
      expect(ops, attr).not.toContain('is less than');
      expect(ops, attr).not.toContain('is between');
    }
  });

  it('a locked attribute with no list still gets the free-text operators', () => {
    expect(dcOperatorsForAttribute(null, { locked: true })).toEqual(LOCKED_ATTR_OPERATORS);
  });

  it('an unlocked attribute is unaffected', () => {
    expect(dcOperatorsForAttribute({ type: 'number' })).toContain('is more than');
  });
});
