// Eligibility is an OR of ANDs: "(cond1 and cond2) or (cond3)".
import { describe, expect, it } from 'vitest';
import {
  dcCompleteFilterGroups,
  dcFilterGroupSentence,
  dcFilterGroupSentences,
  dcFilterGroupsOf,
  dcFiltersOf,
  dcStepSentences,
} from '../../src/data/filters';
import type { DripFilterRow } from '../../src/data/graphTypes';

const row = (field: string, value: string): DripFilterRow => ({ group: 'Account', field, operator: 'is', value });
const C1 = row('Status', 'Active');
const C2 = { group: 'Account', field: 'Current OS amount', operator: 'is more than', value: '20000' } as DripFilterRow;
const C3 = row('Utilization', '70');
const INCOMPLETE: DripFilterRow = { group: 'Account', field: 'Status', operator: '', value: '' };

describe('reading groups', () => {
  it('a flat legacy list is one AND group, with nothing to migrate on disk', () => {
    expect(dcFilterGroupsOf('ENTRY_SEGMENT', { filters: [C1, C2] })).toEqual([[C1, C2]]);
  });

  it('a config with no filters at all has no groups', () => {
    expect(dcFilterGroupsOf('ENTRY_SEGMENT', { filters: [] })).toEqual([]);
    expect(dcFilterGroupsOf('ENTRY_SEGMENT', {})).toEqual([]);
  });

  it('grouped filters read back as filed', () => {
    const groups = [[C1, C2], [C3]];
    expect(dcFilterGroupsOf('ENTRY_SEGMENT', { filterGroups: groups })).toEqual(groups);
  });

  it('filterGroups wins over a stale flat list', () => {
    expect(dcFilterGroupsOf('ENTRY_SEGMENT', { filterGroups: [[C3]], filters: [C1] })).toEqual([[C3]]);
  });

  it('the flat reader still answers with every row across every group', () => {
    expect(dcFiltersOf('ENTRY_SEGMENT', { filterGroups: [[C1, C2], [C3]] })).toEqual([C1, C2, C3]);
  });
});

describe('completeness across groups', () => {
  it('drops incomplete rows, and drops a group nobody finished', () => {
    expect(dcCompleteFilterGroups([[C1, INCOMPLETE], [INCOMPLETE]])).toEqual([[C1]]);
  });

  it('an unfinished group is not a wildcard that matches everyone', () => {
    const kept = dcCompleteFilterGroups([[C1], [INCOMPLETE]]);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toEqual([C1]);
  });
});

describe('reading it back', () => {
  it('one group reads exactly as it did before grouping existed', () => {
    expect(dcFilterGroupSentences([[C1, C2]])).toEqual(['Status is Active', 'Current OS amount is more than ₹20,000']);
    expect(dcFilterGroupSentence([[C1, C2]])).toBe('Status is Active and Current OS amount is more than ₹20,000');
  });

  it('two groups read as AND within, OR between', () => {
    expect(dcFilterGroupSentences([[C1, C2], [C3]])).toEqual([
      'Status is Active and Current OS amount is more than ₹20,000',
      'Utilization is 70%',
    ]);
  });

  it('the one-line form parenthesises the groups it ORs', () => {
    expect(dcFilterGroupSentence([[C1, C2], [C3]])).toBe(
      '(Status is Active and Current OS amount is more than ₹20,000) or (Utilization is 70%)',
    );
  });

  it('says nothing when nothing is complete', () => {
    expect(dcFilterGroupSentence([[INCOMPLETE]])).toBe('');
    expect(dcFilterGroupSentences([[INCOMPLETE]])).toEqual([]);
  });
});

describe('reading it back on Review and the step panel', () => {
  const G1 = { group: 'Account', field: 'Status', operator: 'is', value: 'Active' };
  const G2 = { group: 'Account', field: 'Utilization', operator: 'is at least', value: '70' };

  it('one group is one line per filter, exactly as before grouping existed', () => {
    expect(dcStepSentences('ENTRY_SEGMENT', { filterGroups: [[G1, G2]] })).toEqual([
      'Status is Active',
      'Utilization is at least 70%',
    ]);
  });

  it('a second group is marked as an alternative, not another requirement', () => {
    expect(dcStepSentences('ENTRY_SEGMENT', { filterGroups: [[G1], [G2]] })).toEqual([
      'Status is Active',
      'or Utilization is at least 70%',
    ]);
  });

  it('a legacy flat list still reads exactly as it always did', () => {
    expect(dcStepSentences('ENTRY_SEGMENT', { filters: [G1, G2] })).toEqual([
      'Status is Active',
      'Utilization is at least 70%',
    ]);
  });
});
