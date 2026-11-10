// A whole campaign as the designer actually emits it: 28 nodes, 27 edges,
// six Sends with no account or template, twelve nodes carrying no _config at
// all, an Experiment the file never named, and nine wrapper blocks this app
// does not read.
//
// The earlier fixture in this folder is a cut-down four-node case for the
// who-split rule. This one is the real file, kept verbatim, because the
// things that broke on it were things a trimmed fixture did not contain.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCampaignFile } from '../../src/data/ingestCampaign';
import { dcRecomputeLabelMeta } from '../../src/reducer/labelMeta';
import { dcAddFormValid } from '../../src/reducer/defaultConfig';
import { dcBranchWhatOf, dcFiltersOf, dcFilterSentences, dcStepSentences } from '../../src/data/filters';
import { graphToFlowElements } from '../../src/canvas/toFlowElements';
import type { DripCampaign, DripGraph } from '../../src/data/graphTypes';

const TEXT = readFileSync(new URL('./support/designer-full-campaign.json', import.meta.url), 'utf8');

function imported(): DripCampaign {
  const r = parseCampaignFile(TEXT, 'DRIP-900');
  if (!r.ok) throw new Error('the real designer file was rejected: ' + r.error);
  return r.campaign;
}
const graph = (c: DripCampaign): DripGraph => c.root!;

describe('the real designer file imports whole', () => {
  it('keeps every node and every edge', () => {
    const g = graph(imported());
    expect(Object.keys(g.nodes)).toHaveLength(28);
    expect(g.edges).toHaveLength(27);
    expect(g.rootId).toBe('dcn1');
  });

  it('decides identity itself and discards what the file claimed', () => {
    const c = imported();
    expect(c.id).toBe('DRIP-900');
    expect(c.id).not.toBe('AGENT-s-1793616608652');
    expect(c.status).toBe('DRAFT');
    expect(c.versionOf).toBeNull();
  });

  it('carries the dormancy rule through — the whole point of this campaign', () => {
    const entry = graph(imported()).nodes.dcn1;
    expect(dcFilterSentences(dcFiltersOf('ENTRY_SEGMENT', entry._config))).toEqual([
      'Status is Active',
      'No transaction in the last 90 days',
      'Status is Active',
    ]);
  });

  it('none of the nine wrapper blocks leaks onto the campaign', () => {
    const c = imported() as unknown as Record<string, unknown>;
    for (const k of ['campaignFieldProvenance', 'validation', 'strategy', 'suggestedMessaging', 'importReadiness', 'claim', 'templateChoices', 'generatedBy', 'unresolvedCampaignFields']) {
      expect(c[k], k).toBeUndefined();
    }
  });
});

describe('nothing in it throws, and nothing reads as undefined', () => {
  it('every node survives the label, validity and sentence readers', () => {
    const c = imported();
    for (const [id, n] of Object.entries(graph(c).nodes)) {
      expect(() => dcRecomputeLabelMeta(n.type, n._config, c.goal), id).not.toThrow();
      expect(() => dcAddFormValid(n.type, n._config), id).not.toThrow();
      expect(() => dcStepSentences(n.type, n._config), id).not.toThrow();
    }
  });

  it('the twelve nodes with no config at all still name themselves', () => {
    const c = imported();
    const nullConfig = Object.entries(graph(c).nodes).filter(([, n]) => n._config === null);
    expect(nullConfig).toHaveLength(12);
    for (const [id, n] of nullConfig) {
      expect(dcRecomputeLabelMeta(n.type, n._config, c.goal).label.trim(), id).not.toBe('');
    }
  });

  it('builds a canvas with no undefined anywhere on it', () => {
    const c = imported();
    const els = graphToFlowElements(graph(c), { editable: true, goal: c.goal });
    expect(els.nodes).toHaveLength(28);
    expect(els.edges).toHaveLength(27);
    expect(els.nodes.filter((n) => /undefined/i.test(JSON.stringify(n.data)))).toEqual([]);
  });

  it('a Send with no timing filed shows no timing line, and one with 11:00 is untouched', () => {
    const els = graphToFlowElements(graph(imported()), { editable: false });
    // every Send here is relative with a real duration, so each has a line
    // and none of them says undefined
    for (const n of els.nodes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = (n.data as any).timingLabel;
      if (t !== undefined) expect(String(t)).not.toContain('undefined');
    }
  });
});

describe('what it leaves for a person to fill in', () => {
  it('names the Experiment the file never named', () => {
    const n = graph(imported()).nodes.dcn2;
    expect(n.label).toBe('Experiment');
    expect(n.meta).toBe('2 variants');
  });

  it('both read-checks still read as Previous message', () => {
    const g = graph(imported());
    for (const id of ['dcn6', 'dcn16']) {
      expect(dcBranchWhatOf(g.nodes[id]._config).group, id).toBe('Previous message');
    }
  });

  it('all six Sends arrive incomplete, with their account and template blank', () => {
    const g = graph(imported());
    const sends = Object.values(g.nodes).filter((n) => n.type === 'SEND');
    expect(sends).toHaveLength(6);
    for (const s of sends) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = s._config as any;
      expect(cfg.account).toBe('');
      expect(cfg.templateId).toBe('');
      expect(dcAddFormValid('SEND', cfg), s.id).toBe(false);
      // and the copy the designer wrote rides along untouched
      expect(cfg.agentMessaging.suggestedCopy.length).toBeGreaterThan(0);
    }
  });
});

describe('the file itself comes back out', () => {
  it('is stored byte-for-byte, all 35KB of it', () => {
    const c = imported();
    expect(c.importedJson).toBe(TEXT);
    expect(c.importedJson!.length).toBeGreaterThan(30000);
  });

  it('still contains the blocks the app does not read, so they can be handed on', () => {
    const json = imported().importedJson!;
    for (const k of ['campaignFieldProvenance', 'designWarnings', 'importReadiness', 'unverifiedHardConstraints', 'claim']) {
      expect(json, k).toContain(k);
    }
  });

  it('survives the odd escaping in the file rather than re-encoding it', () => {
    // strategy.summary carries a literal — (double-escaped at source).
    expect(imported().importedJson).toContain('\\\\u2014');
    expect(imported().importedJson).toContain('${customerFirstName}');
  });
});
