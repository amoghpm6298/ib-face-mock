// A new arm's default name must be one no sibling already has.
//
// Both forms derived it from the arm count, so removing an arm and adding
// another produced two arms with one name — on the canvas and on their edge
// chips, where the name is the only thing distinguishing them, and in the
// saved campaign, since an edge's branchLabel comes from it.
import { describe, it, expect } from 'vitest';
import { dcNextBranchLabel, dcNextVariantLabel } from '../../src/reducer/defaultConfig';

const arms = (...labels: string[]) => labels.map((label) => ({ label }));

describe('the next variant name on an Experiment', () => {
  it('follows the last one while nothing has been removed', () => {
    expect(dcNextVariantLabel([])).toBe('A');
    expect(dcNextVariantLabel(arms('A'))).toBe('B');
    expect(dcNextVariantLabel(arms('A', 'B'))).toBe('C');
  });

  it('fills the gap a removal left instead of repeating a name — the bug', () => {
    // A/B/C with B removed used to produce a second C.
    expect(dcNextVariantLabel(arms('A', 'C'))).toBe('B');
  });

  it('does not repeat a name after an insert in the middle', () => {
    expect(dcNextVariantLabel(arms('A', 'B', 'C'))).toBe('D');
  });

  it('ignores case and surrounding space when deciding what is taken', () => {
    expect(dcNextVariantLabel(arms(' a ', 'b'))).toBe('C');
  });

  it('a renamed arm frees its letter, because nothing is called that any more', () => {
    expect(dcNextVariantLabel(arms('WhatsApp', 'SMS'))).toBe('A');
  });

  it('never returns a duplicate, even past the alphabet', () => {
    const all = Array.from({ length: 26 }, (_, i) => ({ label: String.fromCharCode(65 + i) }));
    const next = dcNextVariantLabel(all);
    expect(all.map((b) => b.label)).not.toContain(next);
  });
});

describe('the next branch name on a Branch', () => {
  it('follows the last one while nothing has been removed', () => {
    expect(dcNextBranchLabel([])).toBe('Branch 1');
    expect(dcNextBranchLabel(arms('Branch 1', 'Branch 2'))).toBe('Branch 3');
  });

  it('fills the gap a removal left instead of repeating a name — the bug', () => {
    expect(dcNextBranchLabel(arms('Branch 2'))).toBe('Branch 1');
    expect(dcNextBranchLabel(arms('Branch 1', 'Branch 3'))).toBe('Branch 2');
  });

  it('a renamed arm frees its name', () => {
    expect(dcNextBranchLabel(arms('High spenders', 'Everyone else'))).toBe('Branch 1');
  });

  it('never returns a name a sibling already has, whatever the mix', () => {
    const existing = arms('Branch 1', 'High spenders', 'Branch 3', 'Branch 2');
    expect(existing.map((b) => b.label)).not.toContain(dcNextBranchLabel(existing));
  });
});
