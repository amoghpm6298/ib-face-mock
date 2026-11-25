// Every seeded node's canvas text must be rebuildable from its own _config.
//
// The canvas reads `label`/`meta` off the stored node, while the drawer reads
// `_config` — two copies of the same facts. When they disagree the canvas
// states something no form can produce, and nothing catches it: the campaign
// opens, saves and validates cleanly while showing the wrong question.
//
// Four real defects were sitting in the seeds when this test was written, all
// of this shape:
//   - DRIP-005/006 read "Previous step: Clicked?" over an outcome of READ.
//     The preceding send is WhatsApp, whose vocabulary has no CLICKED at all
//     (DELIVERY_STATUS_BY_CHANNEL), so the question on canvas was one the
//     campaign could never ask. The config is right; the label was stale.
//   - DRIP-003's four milestone checks still read the invented spend ladder
//     ("Spend ₹25,000 in first 30 days — Completed?") that was deleted on
//     2026-10-23, even though their configs had been migrated to real offers.
//     The existing seed test only checked sentences built FROM the config, so
//     it passed while the canvas showed names that no longer exist anywhere.
//   - Twelve sends carried a channel or a bare time in `meta` ("WhatsApp",
//     "11:00"), left over from before Send grew its own per-fact rows. Dead
//     text — the card renders those rows from _config and never reads meta
//     for a SEND — but dead text that reads as current.
//   - Both experiments' allocation lines were hand-written rather than
//     derived, so one was less specific than its config (50/50) and the other
//     broke the ≤24-character rule that exists to keep an allocation off the
//     canvas when it is too long to read.
//
// Asserting the whole rebuild, rather than any one of those, is what makes
// the next instance fail here instead of being noticed in a screenshot.
import { describe, it, expect } from 'vitest';
import { DRIP_CAMPAIGNS } from '../../src/data/seedCampaigns';
import { dcRecomputeLabelMeta } from '../../src/reducer/labelMeta';

describe('seeded labels rebuild from their own config', () => {
  for (const c of DRIP_CAMPAIGNS) {
    if (!c.root) continue;
    it(`${c.id} ${c.name}`, () => {
      const drift: Record<string, { stored: string; rebuilt: string }> = {};
      for (const n of Object.values(c.root!.nodes)) {
        // GOAL_CHECK is included deliberately even though the canvas already
        // recomputes its question live from the campaign Goal: a stored label
        // that disagrees is still a wrong answer in the saved file, and in
        // every read-only path that has no goal to recompute from.
        const r = dcRecomputeLabelMeta(n.type, n._config, c.goal);
        const stored = `${n.label} / ${n.meta || ''}`;
        const rebuilt = `${r.label} / ${r.meta}`;
        if (stored !== rebuilt) drift[`${n.id} ${n.type}`] = { stored, rebuilt };
      }
      expect(drift).toEqual({});
    });
  }

  it('covers every seeded node, so a campaign losing its graph cannot pass vacuously', () => {
    const counted = DRIP_CAMPAIGNS.reduce((t, c) => t + (c.root ? Object.keys(c.root.nodes).length : 0), 0);
    expect(counted).toBe(94);
    expect(DRIP_CAMPAIGNS.filter((c) => c.root).length).toBe(6);
  });
});
