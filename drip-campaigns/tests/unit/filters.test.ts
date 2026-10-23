// The one filter row: the grouped "what" list, the comparison vocabulary,
// and the sentence each row reads as on Review.
import { describe, expect, it } from 'vitest';
import {
  ELIGIBILITY_META,
  NUMBER_COMPARISONS,
  dcComparisonsForFilter,
  dcFilterOptionGroups,
  dcFormatValue,
  MILESTONE_OFFERS,
  APP_EVENTS,
  CARD_CONTROL_CHANNELS,
  EVENT_CATEGORIES,
  cardEventDetailFields,
  dcCardEventPhrase,
  dcValidEventType,
  resolveEntryEventAttrSource,
} from '../../src/data/sharedConstants';
import { dcBranchWhatOf, dcClearFiltersForEvents, dcDetailsForEvent, dcFilterRowComplete, dcFilterSentence, dcFilterSentences, dcFiltersOf } from '../../src/data/filters';
import { dcAddFormValid } from '../../src/reducer/defaultConfig';
import { dcDecisionBranchSummary } from '../../src/reducer/labelMeta';

describe('the grouped what list', () => {
  it('is in the stated order, and Previous message only appears where there is a message', () => {
    expect(dcFilterOptionGroups().map((g) => g.group)).toEqual(['Account', 'Card', 'Card controls', 'Customer', 'Transactions', 'Milestone', 'App activity']);
    expect(dcFilterOptionGroups({ previousMessage: true }).map((g) => g.group)).toEqual([
      'Account',
      'Card',
      'Card controls',
      'Customer',
      'Transactions',
      'Milestone',
      'App activity',
      'Previous message',
    ]);
  });

  it('puts Entry event after Milestone and before Previous message, and only when an entry event resolves one', () => {
    expect(dcFilterOptionGroups({ previousMessage: true, entryEventEntity: 'Transaction' }).map((g) => g.group)).toEqual([
      'Account',
      'Card',
      'Card controls',
      'Customer',
      'Transactions',
      'Milestone',
      'App activity',
      'Entry event',
      'Previous message',
    ]);
    // A locked-attribute event (Journey/Offer) offers exactly that one.
    const locked = dcFilterOptionGroups({ entryEventLockedAttr: 'Page Name' }).find((g) => g.group === 'Entry event');
    expect(locked?.options.map((o) => o.field)).toEqual(['Page Name']);
    // Card Events resolve neither, so the group is absent rather than empty.
    expect(dcFilterOptionGroups().some((g) => g.group === 'Entry event')).toBe(false);
  });

  it('lists the four money filters first on Account, ahead of the attributes that were already there', () => {
    const account = dcFilterOptionGroups()[0];
    expect(account.options.slice(0, 4).map((o) => o.field)).toEqual(['Current OS amount', 'Current limit', 'Assigned limit', 'Utilization']);
    // Nothing that already existed was dropped.
    expect(account.options.map((o) => o.field)).toEqual(expect.arrayContaining(['Status', 'Smart Tag', 'Statement Due Date', 'Created On', 'Last Updated On', 'Account Block Codes']));
  });

  it('the milestone OFFER is the what, not a second control, and carries no invented spend rule', () => {
    const milestone = dcFilterOptionGroups().find((g) => g.group === 'Milestone')!;
    expect(milestone.options.length).toBeGreaterThan(0);
    for (const o of milestone.options) {
      // An offer's name is its identity. A target amount or a day count in
      // it would be its configuration, which is what made the old four
      // invented.
      expect(o.label).not.toMatch(/₹/);
      expect(o.label).not.toMatch(/\d+\s*days?/i);
    }
  });
});

describe('comparisons', () => {
  it('numbers get the six, in order', () => {
    expect(NUMBER_COMPARISONS).toEqual(['is', 'is more than', 'is at least', 'is less than', 'is at most', 'is between']);
    expect(dcComparisonsForFilter('Account', 'Current OS amount')).toEqual(NUMBER_COMPARISONS);
    expect(dcComparisonsForFilter('Account', 'Utilization')).toEqual(NUMBER_COMPARISONS);
  });

  it('non-number filters keep their own shorter lists', () => {
    expect(dcComparisonsForFilter('Account', 'Status')).toEqual(['is', 'is not']);
    expect(dcComparisonsForFilter('Transactions', '')).toEqual(['a matching transaction exists', 'no matching transaction exists']);
    expect(dcComparisonsForFilter('Previous message', 'Outcome')).toEqual(['is any of']);
  });
});

describe('units reach the sentence', () => {
  it('rupees and percent are formatted, everything else is left alone', () => {
    expect(dcFormatValue(ELIGIBILITY_META.Account['Current OS amount'], '20000')).toBe('₹20,000');
    expect(dcFormatValue(ELIGIBILITY_META.Account['Utilization'], '70')).toBe('70%');
    expect(dcFormatValue(ELIGIBILITY_META.Account['Status'], 'Dormant')).toBe('Dormant');
  });

  it('produces the sentences from the spec', () => {
    expect(dcFilterSentence({ group: 'Account', field: 'Current OS amount', operator: 'is at least', value: '20000' })).toBe('Current OS amount is at least ₹20,000');
    expect(dcFilterSentence({ group: 'Account', field: 'Utilization', operator: 'is at least', value: '70' })).toBe('Utilization is at least 70%');
    expect(dcFilterSentence({ group: 'Account', field: 'Status', operator: 'is', value: 'Dormant' })).toBe('Status is Dormant');
  });

  it('is between reads both bounds, with the unit on each', () => {
    expect(dcFilterSentence({ group: 'Account', field: 'Utilization', operator: 'is between', value: '30', value2: '70' })).toBe('Utilization is between 30% and 70%');
  });
});

describe('incomplete rows are ignored', () => {
  it('a row missing its comparison or value never reaches a sentence', () => {
    const rows = [
      { group: 'Account', field: 'Current OS amount', operator: '', value: '' },
      { group: 'Account', field: '', operator: 'is at least', value: '20000' },
      { group: 'Account', field: 'Utilization', operator: 'is at least', value: '70' },
    ];
    expect(rows.map((r) => dcFilterRowComplete(r))).toEqual([false, false, true]);
    expect(dcFilterSentences(rows)).toEqual(['Utilization is at least 70%']);
  });

  it('is between needs both bounds before it counts', () => {
    expect(dcFilterRowComplete({ group: 'Account', field: 'Utilization', operator: 'is between', value: '30' })).toBe(false);
    expect(dcFilterRowComplete({ group: 'Account', field: 'Utilization', operator: 'is between', value: '30', value2: '70' })).toBe(true);
  });
});

describe('campaigns saved before the rewrite still open', () => {
  it('an old Condition source becomes a row in the group it belongs to', () => {
    expect(dcFiltersOf('SPLIT', { customSource: 'Previous step outcome', outcome: 'READ' })[0]).toMatchObject({ group: 'Previous message', values: ['READ'] });
    expect(dcFiltersOf('SPLIT', { customSource: 'Account attribute', customConditions: [{ attribute: 'Status', operator: 'Equals', value: 'Dormant' }] })[0]).toMatchObject({
      group: 'Account',
      field: 'Status',
      operator: 'is',
    });
    expect(dcFiltersOf('SPLIT', { customSource: 'Entry event attribute', customConditions: [{ attribute: 'Page Name', operator: 'Equals', value: 'X' }] })[0]).toMatchObject({
      group: 'Entry event',
      field: 'Page Name',
    });
  });

  it('old operator wording is mapped onto the new, so a saved filter keeps its meaning', () => {
    const rows = dcFiltersOf('ENTRY_SEGMENT', {
      entity: 'Account',
      conditions: [
        { attribute: 'Current OS amount', operator: 'Greater than or equal to', value: '20000' },
        { attribute: 'Utilization', operator: 'Less than or equal to', value: '70' },
      ],
    });
    expect(dcFilterSentences(rows)).toEqual(['Current OS amount is at least ₹20,000', 'Utilization is at most 70%']);
  });

  it('an old Branch source becomes the shared what', () => {
    expect(dcBranchWhatOf({ source: 'Account attribute', attribute: 'Utilization' })).toEqual({ group: 'Account', field: 'Utilization' });
    expect(dcBranchWhatOf({ source: 'Previous step outcome' })).toEqual({ group: 'Previous message', field: 'Outcome' });
    // A removed benefit clears on Branch too, rather than remapping onto a
    // different offer and quietly changing who every arm routes.
    expect(dcBranchWhatOf({ source: 'Milestone', milestoneBenefitId: 'MS-1001' })).toEqual({ group: 'Milestone', field: '' });
    expect(dcBranchWhatOf({ source: 'Milestone', milestoneBenefitId: MILESTONE_OFFERS[0].id })).toEqual({ group: 'Milestone', field: MILESTONE_OFFERS[0].id });
    // A campaign saved after the rewrite is read straight off `what`.
    expect(dcBranchWhatOf({ what: { group: 'Card', field: 'Status' } })).toEqual({ group: 'Card', field: 'Status' });
  });
});

describe('App activity — something the customer did, or did not do, in the app', () => {
  it('seeds enough labelled events across the four areas that a search is obviously needed', () => {
    expect(APP_EVENTS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(APP_EVENTS.map((e) => e.category))).toEqual(new Set(['Authentication', 'Cards', 'Payments', 'Offers']));
    // Every event keeps both the raw name and a short label, and they differ.
    for (const e of APP_EVENTS) {
      expect(e.raw.length).toBeGreaterThan(0);
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.label).not.toBe(e.raw);
    }
    // The named ones, with the raw names stored behind the short labels.
    const byLabel = (l: string) => APP_EVENTS.find((e) => e.label === l);
    expect(byLabel('Verify OTP')?.raw).toBe('Authentication Transaction Verify OTP Button Click');
    expect(byLabel('Enter OTP')?.raw).toBe('Authentication Transaction OTP Button Click');
    expect(byLabel('Continue after OTP')?.raw).toBe('Authentication Transaction Success Continue Button Click');
    expect(byLabel('Offer clicked')).toBeTruthy();
  });

  it('ids and raw timestamps are not events and are not details', () => {
    const detailKinds = new Set(APP_EVENTS.flatMap((e) => e.details || []));
    for (const k of ['session', 'sessionId', 'accountId', 'customerId', 'cardId', 'timestamp']) {
      expect(detailKinds.has(k as never)).toBe(false);
    }
  });

  it('the what list carries one App activity entry, not forty', () => {
    const group = dcFilterOptionGroups().find((g) => g.group === 'App activity')!;
    expect(group.options).toHaveLength(1);
    expect(group.options[0].label).toBe('App activity');
  });

  it('only shows the details the chosen event actually has', () => {
    const offerClicked = APP_EVENTS.find((e) => e.label === 'Offer clicked')!;
    const verifyOtp = APP_EVENTS.find((e) => e.label === 'Verify OTP')!;
    expect(offerClicked.details).toEqual(['offer']);
    expect(verifyOtp.details).toBeUndefined();
    // Switching to an event without that detail drops the stale value.
    expect(dcDetailsForEvent(verifyOtp.id, { offer: 'OF-1' })).toEqual({});
    expect(dcDetailsForEvent(offerClicked.id, { offer: 'OF-1' })).toEqual({ offer: 'OF-1' });
  });

  it('reads as one sentence, with and without a detail', () => {
    const verifyOtp = APP_EVENTS.find((e) => e.label === 'Verify OTP')!;
    const offerClicked = APP_EVENTS.find((e) => e.label === 'Offer clicked')!;
    expect(dcFilterSentence({ group: 'App activity', field: verifyOtp.id, operator: 'happened', value: '1' })).toBe('Verify OTP happened in the last 1 day');
    expect(dcFilterSentence({ group: 'App activity', field: offerClicked.id, operator: 'happened', value: '7', details: { offer: 'OF-1' } })).toBe(
      'Offer clicked, Welcome Offer, happened in the last 7 days'
    );
    expect(dcFilterSentence({ group: 'App activity', field: verifyOtp.id, operator: 'did not happen', value: '30' })).toBe('Verify OTP did not happen in the last 30 days');
  });

  it('an empty detail means any value and still reads as a sentence', () => {
    const offerClicked = APP_EVENTS.find((e) => e.label === 'Offer clicked')!;
    const row = { group: 'App activity', field: offerClicked.id, operator: 'happened', value: '7', details: {} };
    expect(dcFilterRowComplete(row)).toBe(true);
    expect(dcFilterSentence(row)).toBe('Offer clicked happened in the last 7 days');
  });

  it('is ignored until an event, a direction and a real window are all set', () => {
    const e = APP_EVENTS[0].id;
    expect(dcFilterRowComplete({ group: 'App activity', field: '', operator: 'happened', value: '7' })).toBe(false);
    expect(dcFilterRowComplete({ group: 'App activity', field: e, operator: '', value: '7' })).toBe(false);
    expect(dcFilterRowComplete({ group: 'App activity', field: e, operator: 'happened', value: '0' })).toBe(false);
    expect(dcFilterRowComplete({ group: 'App activity', field: e, operator: 'happened', value: '7' })).toBe(true);
  });

  it('changing the program clears an event the new program does not emit, leaving the row in place', () => {
    const gone = APP_EVENTS[0].id;
    const kept = APP_EVENTS[1].id;
    const rows = [
      { group: 'App activity', field: gone, operator: 'happened', value: '7', details: { offer: 'OF-1' } },
      { group: 'App activity', field: kept, operator: 'happened', value: '7' },
      { group: 'Account', field: 'Status', operator: 'is', value: 'Dormant' },
    ];
    const next = dcClearFiltersForEvents(rows, [kept]);
    expect(next).toHaveLength(3); // the row stays, to be picked again
    expect(next[0].field).toBe('');
    expect(next[0].details).toEqual({});
    expect(next[0].operator).toBe('happened'); // direction and window survive
    expect(next[0].value).toBe('7');
    expect(next[1]).toBe(rows[1]); // untouched
    expect(next[2]).toBe(rows[2]); // other groups untouched
  });

  it('Branch: one event, two arms naming two different offers', () => {
    const offerClicked = APP_EVENTS.find((e) => e.label === 'Offer clicked')!;
    const p = {
      what: { group: 'App activity', field: offerClicked.id },
      branches: [
        { id: 'b1', label: 'Welcome', operator: 'happened', value: '7', details: { offer: 'OF-1' } },
        { id: 'b2', label: 'Dining', operator: 'happened', value: '14', details: { offer: 'OF-3' } },
      ],
    };
    expect(dcBranchWhatOf(p)).toEqual({ group: 'App activity', field: offerClicked.id });
    expect(dcAddFormValid('DECISION_SPLIT', p)).toBe(true);
    // Each arm's own detail reaches its own chip.
    expect(dcDecisionBranchSummary(p as never, p.branches[0] as never)).toBe('Welcome Offer, happened in 7 days');
    expect(dcDecisionBranchSummary(p as never, p.branches[1] as never)).toBe('Dining Cashback, happened in 14 days');
  });
});

describe('Account and Card filter names are the campaign words', () => {
  it('keeps the four money filters and adds Interest, eSign and eNACH', () => {
    const account = dcFilterOptionGroups()[0].options.map((o) => o.field);
    expect(account.slice(0, 4)).toEqual(['Current OS amount', 'Current limit', 'Assigned limit', 'Utilization']);
    expect(account).toEqual(expect.arrayContaining(['Interest', 'eSign completed', 'eNACH completed']));
    // Current limit is its own filter, not Assigned limit and not a balance.
    expect(account.filter((f) => f === 'Current limit')).toHaveLength(1);
    expect(account).not.toContain('Total Account Balance');
  });

  it('Interest is rupees, Utilization is percent', () => {
    expect(dcFilterSentence({ group: 'Account', field: 'Interest', operator: 'is at least', value: '1500' })).toBe('Interest is at least ₹1,500');
    expect(dcFilterSentence({ group: 'Account', field: 'Utilization', operator: 'is at least', value: '70' })).toBe('Utilization is at least 70%');
  });

  it('yes/no filters read Yes and No, and offer one comparison', () => {
    expect(dcComparisonsForFilter('Account', 'eSign completed')).toEqual(['is']);
    expect(dcFilterSentence({ group: 'Account', field: 'eSign completed', operator: 'is', value: 'Yes' })).toBe('eSign completed is Yes');
    expect(dcFilterSentence({ group: 'Card', field: 'Hotlisted', operator: 'is', value: 'No' })).toBe('Hotlisted is No');
    // A campaign saved when these stored true/false still reads correctly.
    expect(dcFilterSentence({ group: 'Card', field: 'Primary card', operator: 'is', value: 'true' })).toBe('Primary card is Yes');
  });

  it('keeps the Card fields that were already there and adds the new ones', () => {
    const card = dcFilterOptionGroups().find((g) => g.group === 'Card')!.options.map((o) => o.field);
    expect(card).toEqual(expect.arrayContaining(['Status', 'Smart Tag', 'Card Expiry', 'Card Type', 'Card Block Codes']));
    expect(card).toEqual(
      expect.arrayContaining(['Hotlisted', 'Hotlist reason', 'First transaction done', 'First purchase done', 'First repayment done', 'PIN set', 'Primary card'])
    );
  });

  it('Hotlist reason is a choice compared with is and is not', () => {
    expect(dcComparisonsForFilter('Card', 'Hotlist reason')).toEqual(['is', 'is not']);
    expect(dcFilterSentence({ group: 'Card', field: 'Hotlist reason', operator: 'is', value: 'Damaged' })).toBe('Hotlist reason is Damaged');
  });
});

describe('Card controls — the card as it is now', () => {
  it('offers each channel plus its three limits, and nothing about what was spent', () => {
    const fields = dcFilterOptionGroups().find((g) => g.group === 'Card controls')!.options.map((o) => o.field);
    expect(fields).toEqual(expect.arrayContaining(CARD_CONTROL_CHANNELS));
    for (const ch of CARD_CONTROL_CHANNELS) {
      expect(fields).toEqual(expect.arrayContaining([`${ch} single payment limit`, `${ch} daily limit`, `${ch} monthly limit`]));
    }
    expect(fields.join(' ')).not.toMatch(/spent/i);
  });

  it('a channel row reads turned on or turned off', () => {
    expect(dcComparisonsForFilter('Card controls', 'Domestic online')).toEqual(['is']);
    expect(dcFilterSentence({ group: 'Card controls', field: 'Domestic online', operator: 'is', value: 'turned on' })).toBe('Domestic online is turned on');
    expect(dcFilterSentence({ group: 'Card controls', field: 'Domestic contactless', operator: 'is', value: 'turned off' })).toBe('Domestic contactless is turned off');
  });

  it('a limit row reads as a rupee amount', () => {
    expect(dcComparisonsForFilter('Card controls', 'Domestic online daily limit')).toEqual(NUMBER_COMPARISONS);
    expect(dcFilterSentence({ group: 'Card controls', field: 'Domestic online daily limit', operator: 'is', value: '10000' })).toBe('Domestic online daily limit is ₹10,000');
  });
});

describe('Card Events — the replaced list', () => {
  it('drops the four old names and lists the ten real ones', () => {
    const events = EVENT_CATEGORIES['Card Events'].events;
    for (const gone of ['Card Issued', 'Card Activated', 'Card Loaded', 'Card Inactive']) expect(events).not.toContain(gone);
    expect(events).toEqual([
      'Virtual card issued',
      'Physical card issued',
      'Virtual card activated',
      'Physical card activated',
      'PIN set',
      'First transaction done',
      'Card hotlisted',
      'Card locked',
      'Card unlocked',
      'Card control updated',
    ]);
  });

  it('a removed name reads as unset, and is never repointed at another event', () => {
    for (const gone of ['Card Issued', 'Card Activated', 'Card Loaded', 'Card Inactive']) {
      expect(dcValidEventType('Card Events', gone)).toBe('');
      expect(dcCardEventPhrase(gone, undefined)).toBe('');
    }
    expect(dcValidEventType('Card Events', 'Virtual card issued')).toBe('Virtual card issued');
  });

  it('only the two detail-bearing events carry details', () => {
    expect(Object.keys(cardEventDetailFields('Card hotlisted') || {})).toEqual(['Reason']);
    expect(Object.keys(cardEventDetailFields('Card control updated') || {})).toEqual(['Channel', 'Change', 'Limit amount']);
    for (const plain of ['Virtual card issued', 'PIN set', 'Card locked', 'Card unlocked']) {
      expect(cardEventDetailFields(plain)).toBeNull();
    }
  });

  it('reads as one sentence, and an empty detail means any value', () => {
    expect(dcCardEventPhrase('Card hotlisted', { Reason: 'Damaged' })).toBe('Card hotlisted, Damaged');
    expect(dcCardEventPhrase('Card hotlisted', {})).toBe('Card hotlisted');
    expect(dcCardEventPhrase('Card control updated', { Channel: 'Domestic online', Change: 'turned on' })).toBe('Card control updated, Domestic online, turned on');
    expect(dcCardEventPhrase('Card control updated', { Channel: 'Domestic online', Change: 'daily limit', 'Limit amount': '10000' })).toBe(
      'Card control updated, Domestic online, daily limit ₹10,000'
    );
  });

  it('Condition and Branch see that event’s details and nothing else, and nothing at all for a plain card event', () => {
    expect(resolveEntryEventAttrSource('Card Events', 'Card hotlisted')).toEqual({ entity: 'Card hotlisted', lockedAttr: null });
    const offered = dcFilterOptionGroups({ entryEventEntity: 'Card control updated' }).find((g) => g.group === 'Entry event')!;
    expect(offered.options.map((o) => o.field)).toEqual(['Channel', 'Change', 'Limit amount']);
    // A card event with no details hides the group entirely.
    expect(resolveEntryEventAttrSource('Card Events', 'PIN set')).toEqual({ entity: null, lockedAttr: null });
    expect(dcFilterOptionGroups({ entryEventEntity: null }).some((g) => g.group === 'Entry event')).toBe(false);
  });
});
