import { describe, it, expect } from 'vitest';
import { DRIP_CAMPAIGNS } from '../../src/data/seedCampaigns';
import { dcValidateCampaign } from '../../src/reducer/campaignReducer';

describe('seed campaigns pass the submit gate', () => {
  for (const c of DRIP_CAMPAIGNS) {
    it(`${c.id} ${c.name}`, () => {
      const issues = c.root ? dcValidateCampaign(c.root, c.goal) : [];
      if (issues.length) console.log(`\n${c.id}:`, issues.map((i) => '  - ' + i.message).join('\n'));
      expect(issues).toEqual([]);
    });
  }
});
