// Ticket size must light up: one transaction's own attributes are a real
// question on a Branch, and they are NOT the Transactions lookback.
import { describe, expect, it } from 'vitest';
import {
  ELIGIBILITY_META,
  dcComparisonsForFilter,
  dcEntityForGroup,
  dcFilterAttrMeta,
  dcFilterOptionGroups,
  NUMBER_COMPARISONS,
} from '../../src/data/sharedConstants';
import { dcBranchWhatOf, dcFilterRowComplete, dcFilterSentence } from '../../src/data/filters';

const TXN_ATTRS = Object.keys(ELIGIBILITY_META.Transaction);

describe('the Transaction group in the what picker', () => {
  it('a Branch offers it, listing exactly the Transaction entity attributes', () => {
    const groups = dcFilterOptionGroups({ previousMessage: true, transactionAttributes: true });
    const txn = groups.find((g) => g.group === 'Transaction');
    expect(txn, 'a Branch must offer Transaction').toBeTruthy();
    expect(txn!.options.map((o) => o.field)).toEqual(TXN_ATTRS);
    expect(txn!.options.map((o) => o.field)).toContain('Transaction Amount');
  });

  it('it is a separate group from the Transactions lookback, and both are offered', () => {
    const groups = dcFilterOptionGroups({ previousMessage: true, transactionAttributes: true });
    const names = groups.map((g) => g.group);
    expect(names).toContain('Transaction');
    expect(names).toContain('Transactions');
    // the lookback is still its own single-entry row, not a list of attributes
    const lookback = groups.find((g) => g.group === 'Transactions')!;
    expect(lookback.options).toEqual([{ group: 'Transactions', field: '', label: 'Transactions' }]);
    // singular is listed first, next to the plural it must not be confused with
    expect(names.indexOf('Transaction')).toBe(names.indexOf('Transactions') - 1);
  });

  it('an audience or condition is not offered it — there is no one transaction to mean', () => {
    expect(dcFilterOptionGroups().map((g) => g.group)).not.toContain('Transaction');
    expect(dcFilterOptionGroups({ previousMessage: true }).map((g) => g.group)).not.toContain('Transaction');
    // the lookback row is what those surfaces use instead, and it stays
    expect(dcFilterOptionGroups().map((g) => g.group)).toContain('Transactions');
  });

  it('Transaction Amount resolves real metadata and the ordinary number comparisons', () => {
    expect(dcEntityForGroup('Transaction')).toBe('Transaction');
    expect(dcFilterAttrMeta('Transaction', 'Transaction Amount')).toEqual({ type: 'number' });
    expect(dcComparisonsForFilter('Transaction', 'Transaction Amount')).toEqual(NUMBER_COMPARISONS);
    // and the lookback still answers with its own exists/none pair
    expect(dcComparisonsForFilter('Transactions', '')).not.toEqual(NUMBER_COMPARISONS);
  });
});

describe('the reader resolves a designer who-split', () => {
  it('"Transaction attribute" + "Transaction Amount" reads as What = Transaction Amount', () => {
    expect(dcBranchWhatOf({ source: 'Transaction attribute', attribute: 'Transaction Amount' })).toEqual({
      group: 'Transaction',
      field: 'Transaction Amount',
    });
  });

  it('it is not Account and not the lookback', () => {
    const what = dcBranchWhatOf({ source: 'Transaction attribute', attribute: 'Transaction Amount' });
    expect(what.group).not.toBe('Account');
    expect(what.group).not.toBe('Transactions');
  });

  it('a who-split with no attribute filed resolves the group and leaves the field blank', () => {
    expect(dcBranchWhatOf({ source: 'Transaction attribute' })).toEqual({ group: 'Transaction', field: '' });
  });

  it('a reaction fork still reads as Previous message', () => {
    expect(dcBranchWhatOf({ source: 'Previous step outcome' }).group).toBe('Previous message');
  });

  it('an explicit what already on the config still wins over the source', () => {
    expect(dcBranchWhatOf({ source: 'Transaction attribute', attribute: 'Transaction Amount', what: { group: 'Card', field: 'Status' } })).toEqual({
      group: 'Card',
      field: 'Status',
    });
  });
});

// Ticket size lighting up means every downstream reader treats Transaction
// like the plain attribute group it is — completeness, the sentence on
// Review, and the question in the read-only step panel.
describe('a Transaction row downstream', () => {
  const row = { group: 'Transaction' as const, field: 'Transaction Amount', operator: 'is more than', value: '10000' };

  it('counts as complete once it has a field, a comparison and a value', () => {
    expect(dcFilterRowComplete(row)).toBe(true);
    expect(dcFilterRowComplete({ ...row, value: '' })).toBe(false);
    expect(dcFilterRowComplete({ ...row, operator: '' })).toBe(false);
    expect(dcFilterRowComplete({ ...row, field: '' })).toBe(false);
  });

  it('reads back as a sentence, not as a lookback and not as raw operators', () => {
    const sentence = dcFilterSentence(row);
    expect(sentence).toBe('Transaction Amount is more than 10000');
    expect(sentence).not.toMatch(/lookback|window|exists/i);
  });

  it('is between needs both bounds, like any other number row', () => {
    expect(dcFilterRowComplete({ ...row, operator: 'is between', value: '1000', value2: '' })).toBe(false);
    expect(dcFilterRowComplete({ ...row, operator: 'is between', value: '1000', value2: '5000' })).toBe(true);
  });
});

// source and customSource are the same field under two names. The Branch
// form writes one, a designer file may carry either, and ingest has always
// read both — so the reader must too, or the two disagree about one node.
describe('customSource reads exactly like source', () => {
  const EXPECTED = { group: 'Transaction', field: 'Transaction Amount' };

  it('a who-split filed as customSource alone reads as Transaction Amount', () => {
    expect(dcBranchWhatOf({ customSource: 'Transaction attribute', attribute: 'Transaction Amount' })).toEqual(EXPECTED);
  });

  it('it is not Account and not the lookback — the smash the default would have produced', () => {
    const what = dcBranchWhatOf({ customSource: 'Transaction attribute', attribute: 'Transaction Amount' });
    expect(what.group).not.toBe('Account');
    expect(what.group).not.toBe('Transactions');
  });

  it('source and customSource give the same answer', () => {
    expect(dcBranchWhatOf({ customSource: 'Transaction attribute', attribute: 'Transaction Amount' })).toEqual(
      dcBranchWhatOf({ source: 'Transaction attribute', attribute: 'Transaction Amount' }),
    );
  });

  it('a reaction fork filed as customSource is still Previous message', () => {
    expect(dcBranchWhatOf({ customSource: 'Previous step outcome' }).group).toBe('Previous message');
  });

  it('source wins when both are filed, since the form owns source', () => {
    expect(dcBranchWhatOf({ source: 'Previous step outcome', customSource: 'Transaction attribute', attribute: 'Transaction Amount' }).group).toBe(
      'Previous message',
    );
  });

  it('every other group still resolves from customSource too', () => {
    expect(dcBranchWhatOf({ customSource: 'Entry event attribute' })).toEqual({ group: '', field: '' });
    expect(dcBranchWhatOf({ customSource: 'Milestone', milestoneBenefitId: 'nope' })).toEqual({ group: 'Milestone', field: '' });
  });
});
