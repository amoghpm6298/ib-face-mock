// Commit 4 — where the conversions came from.
//
// The campaign total is one number; these are the two breakdowns a reader
// actually asks for, and they are deliberately worded as different claims. A
// Send is CREDITED with conversions, as the last message those accounts
// received — not as their cause. A wait is simply where people WERE standing
// when it happened.
import { describe, expect, it } from 'vitest';
import type { DripCampaign } from '../../src/data/graphTypes';
import { generateDripAnalytics } from '../../src/data/dripAnalytics';
import { DRIP_CAMPAIGNS } from '../../src/data/seedCampaigns';

const withGoal = (c: DripCampaign, patch: Partial<NonNullable<DripCampaign['goal']>>): DripCampaign => ({
  ...c,
  goal: { ...c.goal!, ...patch },
});

describe('credit goes to the last message received', () => {
  it('every conversion is credited to exactly one Send, and they sum to the total', () => {
    for (const c of DRIP_CAMPAIGNS) {
      if (!c.root || !c.goal?.eventType) continue;
      const { metrics, totals } = generateDripAnalytics(c);
      const credited = Object.values(metrics.conversionsByNodeId).reduce((t, n) => t + n, 0);
      expect({ id: c.id, credited }).toEqual({ id: c.id, credited: totals.reachedGoal });
    }
  });

  it('only Sends are credited — a wait never earns a conversion', () => {
    for (const c of DRIP_CAMPAIGNS) {
      if (!c.root || !c.goal?.eventType) continue;
      const { metrics } = generateDripAnalytics(c);
      for (const id of Object.keys(metrics.conversionsByNodeId)) {
        expect({ id, type: c.root.nodes[id].type }).toEqual({ id, type: 'SEND' });
      }
    }
  });

  it('a later message takes the credit from an earlier one', () => {
    // DRIP-001 is a straight chain of three sends. Everyone who reaches the
    // third received the first two, so the third's pool is its own arrivals
    // and the first's is only those who never got as far as the second.
    const c = DRIP_CAMPAIGNS.find((x) => x.id === 'DRIP-001')!;
    const { metrics } = generateDripAnalytics(c);
    const sends = Object.values(c.root!.nodes).filter((n) => n.type === 'SEND');
    const counts = sends.map((n) => metrics.nodeCounts[n.id] || 0);
    // Reach falls along the chain...
    expect(counts[0]).toBeGreaterThan(counts[2]);
    // ...and no Send is credited with more conversions than reached it.
    for (const n of sends) {
      expect((metrics.conversionsByNodeId[n.id] || 0)).toBeLessThanOrEqual(metrics.nodeCounts[n.id] || 0);
    }
  });

  it('a campaign with no goal credits nothing anywhere', () => {
    const c = DRIP_CAMPAIGNS.find((x) => x.id === 'DRIP-003')!; // no goal
    const { metrics, totals } = generateDripAnalytics(c);
    expect(totals.reachedGoal).toBe(0);
    expect(Object.values(metrics.conversionsByNodeId).reduce((t, n) => t + n, 0)).toBe(0);
  });
});

describe('where they were standing', () => {
  const c = DRIP_CAMPAIGNS.find((x) => x.id === 'DRIP-001')!;

  it('is counted only when converting takes them out of the journey', () => {
    const on = generateDripAnalytics(c).metrics.convertedHereByNodeId;
    expect(Object.keys(on).length).toBeGreaterThan(0);

    // With exit off nobody leaves at the moment of conversion, so there is
    // no "here" to name — and saying nothing beats inventing a step.
    const off = generateDripAnalytics(withGoal(c, { exitOnConversion: false })).metrics.convertedHereByNodeId;
    expect(off).toEqual({});
  });

  it('adds up to the same campaign total as the credited conversions', () => {
    const { metrics, totals } = generateDripAnalytics(c);
    const here = Object.values(metrics.convertedHereByNodeId).reduce((t, n) => t + n, 0);
    expect(here).toBe(totals.reachedGoal);
  });

  it('names the step people were waiting at, not the message they received', () => {
    const { metrics } = generateDripAnalytics(c);
    const types = Object.keys(metrics.convertedHereByNodeId).map((id) => c.root!.nodes[id].type);
    expect(types).toContain('PAUSE');
  });
});

describe('both groups on the same clock', () => {
  it('reports the window it measured, in days', () => {
    const c = DRIP_CAMPAIGNS.find((x) => x.id === 'DRIP-001')!;
    const { totals } = generateDripAnalytics(c);
    expect(totals.conversionWindowDays).toBe(Number(c.goal!.conversionWindow!.duration));
  });

  it('reads hours as a fraction of a day rather than as days', () => {
    const c = withGoal(DRIP_CAMPAIGNS.find((x) => x.id === 'DRIP-001')!, { conversionWindow: { duration: 12, unit: 'hours' } });
    expect(generateDripAnalytics(c).totals.conversionWindowDays).toBe(0.5);
  });

  it('has no window to report when there is no goal', () => {
    const c = DRIP_CAMPAIGNS.find((x) => x.id === 'DRIP-003')!;
    expect(generateDripAnalytics(c).totals.conversionWindowDays).toBe(null);
  });

  it('gives the held-back group its own rate, which can beat the messaged one', () => {
    // The point of H8: if control can only come in under treatment, the
    // dashboard can never show a campaign that failed.
    const rates = DRIP_CAMPAIGNS.filter((c) => c.goal?.eventType).map((c) => {
      const { totals } = generateDripAnalytics(c);
      return { t: totals.conversionRate, c: totals.controlConversionRate };
    });
    for (const r of rates) {
      expect(r.c).toBeGreaterThanOrEqual(0);
      expect(r.c).toBeLessThanOrEqual(1);
    }
    // Independent draws, so the two are not a fixed ratio of each other.
    const ratios = rates.map((r) => (r.c > 0 ? r.t / r.c : 0));
    expect(new Set(ratios.map((x) => x.toFixed(3))).size).toBeGreaterThan(1);
  });
});
