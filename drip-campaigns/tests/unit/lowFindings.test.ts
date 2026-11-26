// The audit's Low findings. What is left here is L1: copy that had stopped
// being true. L3 and L4 are covered by the note below — the code carrying
// both defects was removed when conversion moved off the canvas.
import { describe, expect, it } from 'vitest';
import { DC_TYPE_SUB } from '../../src/data/typeSub';
import { DC_STEP_TYPES } from '../../src/data/nodeMeta';

describe('L1 — the picker describes what it offers', () => {
  it('Goal Check no longer calls itself unaddable, in the list that offers it', () => {
    expect(DC_STEP_TYPES).toContain('GOAL_CHECK');
    expect(DC_TYPE_SUB.GOAL_CHECK).not.toMatch(/not addable|system-generated/i);
    expect(DC_TYPE_SUB.GOAL_CHECK).toBe('Has the campaign goal been achieved?');
  });

  it('an audience entry is not called a snapshot, since it can repeat', () => {
    expect(DC_TYPE_SUB.ENTRY_SEGMENT).not.toMatch(/snapshot/i);
    expect(DC_TYPE_SUB.ENTRY_SEGMENT).toMatch(/repeating schedule/);
  });
});

// L3 and L4 were fixed, and then the code that carried both defects was
// removed outright when conversion moved off the canvas:
//
// L4 was "New Status = undefined?" on the Goal Check a Wait auto-inserted
// when the goal matched a set of statuses. Nothing auto-inserts a Goal Check
// any more, and no node builds a label out of the goal's conditions, so
// there is no longer a place for that label to be wrong.
//
// L3 was a Goal Check's Yes arm that stopped reaching Goal Reached, leaving
// those customers uncounted. There is no Goal Reached step, and conversion
// is counted for the campaign rather than from arrivals at a node.
//
// Their tests are deleted rather than adapted, because adapting them would
// mean asserting something about code that is gone. The behaviour that
// replaced them is covered by the migration and conversion suites.
