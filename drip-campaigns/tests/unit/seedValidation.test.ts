import { describe, it, expect } from 'vitest';
import { DRIP_CAMPAIGNS } from '../../src/data/seedCampaigns';
import { dcValidateCampaign } from '../../src/reducer/campaignReducer';

describe('seed campaigns pass the submit gate', () => {
  for (const c of DRIP_CAMPAIGNS) {
    it(`${c.id} ${c.name}`, () => {
      // The seeds are held to the setup rules too, not just the journey
      // ones — they are the fixture every other test reads, so "a real
      // campaign would pass this" has to be true of them.
      const issues = c.root
        ? dcValidateCampaign(c.root, c.goal, {
            name: c.name,
            issuer: c.issuer,
            applyToAllPrograms: c.applyToAllPrograms,
            programs: c.programs,
            controlPct: c.controlPct,
            startDate: c.startDate,
            endDate: c.endDate,
          })
        : [];
      if (issues.length) console.log(`\n${c.id}:`, issues.map((i) => '  - ' + i.message).join('\n'));
      expect(issues).toEqual([]);
    });
  }
});
