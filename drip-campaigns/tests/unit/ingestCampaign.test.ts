import { beforeEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ingestCampaignJson, parseCampaignFile } from '../../src/data/ingestCampaign';
import { dcBranchWhatOf } from '../../src/data/filters';
import { DRIP_CAMPAIGNS } from '../../src/data/seedCampaigns';
import { dcNewNodeId, dcResetIdCounters, dcSeedIdCountersFrom } from '../../src/reducer/idGen';

const WRAPPER = JSON.parse(
  readFileSync(new URL('./support/designer-wrapper.legacy-who-split.json', import.meta.url), 'utf8'),
) as unknown;

describe('ingestCampaignJson', () => {
  it('unwraps a designer wrapper and keeps the who-split off Account', () => {
    const out = ingestCampaignJson(WRAPPER, 'DRIP-099');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.campaign.id).toBe('DRIP-099');
    expect(out.campaign.status).toBe('DRAFT');
    expect(out.campaign.versionOf).toBeNull();
    expect(out.campaign.name).toBe('EMI on eligible purchases');

    const who = Object.values(out.campaign.root!.nodes).find((n) => n.type === 'DECISION_SPLIT' && n.label === 'Ticket size')!;
    const cfg = who._config as { source?: string; attribute?: string; what?: { group?: string } };
    // Filed as the designer wrote it, and still readable as ticket size:
    // the Branch picker now has a real Transaction group, so the what
    // resolves to it instead of being left blank or smashed onto Account.
    expect(cfg.source).toBe('Transaction attribute');
    expect(cfg.attribute).toBe('Transaction Amount');
    expect(cfg.what?.group, 'must not smash onto Account').not.toBe('Account');
    expect(cfg.what?.group, 'Transactions is the lookback row, not ticket size').not.toBe('Transactions');
    expect(cfg.what?.group).toBe('Transaction');
    expect((cfg.what as { field?: string } | undefined)?.field).toBe('Transaction Amount');
    expect(dcBranchWhatOf(cfg)).toEqual({ group: 'Transaction', field: 'Transaction Amount' });

    const arms = out.campaign.root!.edges.filter((e) => e.from === who.id).map((e) => e.branchLabel);
    expect(arms).toEqual(expect.arrayContaining(['High', 'Low']));

    const react = Object.values(out.campaign.root!.nodes).find((n) => n.type === 'DECISION_SPLIT' && n.label === 'Read?')!;
    const rcfg = react._config as { source?: string; what?: { group?: string } };
    expect(rcfg.source).toBe('Previous step outcome');
    expect(rcfg.what?.group).toBe('Previous message');

    const send = Object.values(out.campaign.root!.nodes).find((n) => n.type === 'SEND')!;
    const scfg = send._config as { account?: string; templateId?: string; agentMessaging?: unknown };
    expect(scfg.account).toBe('');
    expect(scfg.templateId).toBe('');
    expect(scfg.agentMessaging).toBeTruthy();

  });

  it('accepts a raw campaign as well as a wrapper', () => {
    const inner = (WRAPPER as { campaign: unknown }).campaign;
    const out = ingestCampaignJson(inner, 'DRIP-100');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.campaign.name).toBe('EMI on eligible purchases');
  });

  it('rejects garbage', () => {
    expect(parseCampaignFile('not json', 'DRIP-1')).toEqual({ ok: false, error: 'This is not a drip campaign.' });
    expect(ingestCampaignJson({ foo: 1 }, 'DRIP-1').ok).toBe(false);
  });
});

describe('Create does not put Import on the list, and scratch is untouched', () => {
  it('the list still only has Create', () => {
    const list = readFileSync(new URL('../../src/list/DripList.tsx', import.meta.url), 'utf8');
    expect(list).toMatch(/Create Drip Campaign/);
    expect(list).not.toMatch(/Import/);
  });

  it('the chooser is only on create with no initial', () => {
    const app = readFileSync(new URL('../../src/DripCampaignsApp.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/CreateFlow/);
    expect(app).toMatch(/kind === 'create'/);
    const createBlock = app.match(/<CreateFlow[\s\S]*?\/>/)?.[0];
    expect(createBlock).toBeTruthy();
    expect(createBlock).toMatch(/onImported=/);
    expect(createBlock).not.toMatch(/initial=/);
    const flow = readFileSync(new URL('../../src/wizard/CreateFlow.tsx', import.meta.url), 'utf8');
    expect(flow).toMatch(/mode === 'scratch'/);
    expect(flow).not.toMatch(/<DripBuilder[^>]*initial=/);
  });
});

// Ingest is not a compiler: the four things it must leave alone, each on its
// own so a failure names the pin that broke rather than one of five concerns.
describe('what ingest must not touch', () => {
  function reingest(mutate: (raw: Record<string, any>) => void, id = 'DRIP-200') {
    const raw = JSON.parse(JSON.stringify(WRAPPER)) as Record<string, any>;
    mutate(raw);
    const out = ingestCampaignJson(raw, id);
    if (!out.ok) throw new Error('ingest rejected a valid wrapper: ' + out.error);
    return out.campaign;
  }
  const sendsOf = (c: { root: any }) => Object.values(c.root.nodes).filter((n: any) => n.type === 'SEND');

  it('a Send comes out exactly as filed — no rewrite, no invented account or template', () => {
    const before = sendsOf((WRAPPER as any).campaign);
    const after = sendsOf(reingest(() => {}, 'DRIP-201'));
    expect(after).toEqual(before);
  });

  it('agentMessaging on a Send rides along, because the Send is not rewritten', () => {
    const c = reingest(() => {});
    const send = sendsOf(c).find((n: any) => n._config?.agentMessaging) as any;
    expect(send._config.agentMessaging).toEqual({
      objective: 'Name the purchase',
      source: 'agent-suggested',
      status: 'draft',
    });
  });

  it('suggestedMessaging is never merged — it rides untouched and folds into nothing', () => {
    const c = reingest((raw) => {
      const send: any = Object.values(raw.campaign.root.nodes).find((n: any) => n.type === 'SEND');
      send._config.suggestedMessaging = { body: 'Pay in 3 easy EMIs', status: 'suggested' };
    });
    const send = sendsOf(c)[0] as any;
    expect(send._config.suggestedMessaging).toEqual({ body: 'Pay in 3 easy EMIs', status: 'suggested' });
    // not folded into agentMessaging, and not turned into a real template
    expect(send._config.agentMessaging.objective).toBe('Name the purchase');
    expect(send._config.templateId).toBe('');
    expect(send._config.message).toBeUndefined();
  });

  it('a wrapper-level suggestedMessaging is dropped rather than merged onto the campaign', () => {
    const c = reingest((raw) => { raw.campaign.suggestedMessaging = { body: 'top level' }; });
    expect((c as Record<string, unknown>).suggestedMessaging).toBeUndefined();
  });

  it('exactly one copy of the graph: no second, merged copy of any node', () => {
    const c = reingest(() => {});
    const ids = Object.keys(c.root!.nodes);
    expect(ids).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(c.root!.edges.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6']);
  });
});

describe('what ingest always decides for itself', () => {
  it("a file claiming its own id, a live status and a parent version loses all three", () => {
    const raw = JSON.parse(JSON.stringify(WRAPPER)) as Record<string, any>;
    raw.campaign.id = 'DRIP-001';
    raw.campaign.status = 'ACTIVE';
    raw.campaign.versionOf = 'DRIP-002';
    const out = ingestCampaignJson(raw, 'DRIP-300');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.campaign.id).toBe('DRIP-300');
    expect(out.campaign.status).toBe('DRAFT');
    expect(out.campaign.versionOf).toBeNull();
  });

  it('a nameless campaign is Untitled rather than blank', () => {
    const raw = JSON.parse(JSON.stringify(WRAPPER)) as Record<string, any>;
    delete raw.campaign.name;
    const out = ingestCampaignJson(raw, 'DRIP-301');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.campaign.name).toBe('Untitled');
  });

  it('an importing session never mutates the seeds', () => {
    const snapshot = JSON.stringify(DRIP_CAMPAIGNS);
    ingestCampaignJson(WRAPPER, 'DRIP-302');
    expect(JSON.stringify(DRIP_CAMPAIGNS)).toBe(snapshot);
  });
});

// The spec asks for the counters to be seeded from the imported graph. They
// are, and with this file that is a no-op — the designer's ids are n1..n5,
// and dcSeedIdCountersFrom reads the dcn/dce/dcb shape this app emits. The
// two namespaces cannot collide, which is why nothing breaks; a designer
// file carrying real dcn ids does seed past them.
describe('seeding the id counters from an imported graph', () => {
  beforeEach(() => dcResetIdCounters());

  it('a designer file with n-shaped ids seeds nothing, and cannot collide either', () => {
    const out = ingestCampaignJson(WRAPPER, 'DRIP-400');
    if (!out.ok) throw new Error('rejected');
    dcSeedIdCountersFrom(out.campaign.root!);
    const next = dcNewNodeId();
    expect(next).toBe('dcn1');
    expect(Object.keys(out.campaign.root!.nodes)).not.toContain(next);
  });

  it("a file carrying this app's own dcn ids seeds past the highest one", () => {
    const raw = JSON.parse(JSON.stringify(WRAPPER)) as Record<string, any>;
    const nodes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw.campaign.root.nodes)) nodes['dcn' + k.slice(1)] = v;
    raw.campaign.root.nodes = nodes;
    raw.campaign.root.rootId = 'dcn1';
    raw.campaign.root.edges = raw.campaign.root.edges.map((e: Record<string, any>) => ({
      ...e,
      id: 'dce' + String(e.id).slice(1),
      from: 'dcn' + String(e.from).slice(1),
      to: e.to ? 'dcn' + String(e.to).slice(1) : e.to,
    }));
    const out = ingestCampaignJson(raw, 'DRIP-401');
    if (!out.ok) throw new Error('rejected');
    dcSeedIdCountersFrom(out.campaign.root!);
    expect(dcNewNodeId()).toBe('dcn6');
  });
});

// The pin: a who-split filed as customSource alone must come out of ingest
// reading as ticket size. It used to come out carrying what.group "Account"
// — ingest asks dcBranchWhatOf for the what, so the reader's old blind spot
// was written onto the node and persisted into the saved campaign.
describe('a who-split filed as customSource rather than source', () => {
  function withCustomSourceOnly() {
    const raw = JSON.parse(JSON.stringify(WRAPPER)) as Record<string, any>;
    const node: any = Object.values(raw.campaign.root.nodes).find((n: any) => n.label === 'Ticket size');
    delete node._config.source;
    node._config.customSource = 'Transaction attribute';
    const out = ingestCampaignJson(raw, 'DRIP-500');
    if (!out.ok) throw new Error('ingest rejected a valid wrapper: ' + out.error);
    return out.campaign;
  }

  it('reads as What = Transaction Amount, never smashed onto Account', () => {
    const c = withCustomSourceOnly();
    const who: any = Object.values(c.root!.nodes).find((n: any) => n.label === 'Ticket size');
    expect(who._config.what).toEqual({ group: 'Transaction', field: 'Transaction Amount' });
    expect(who._config.what.group).not.toBe('Account');
    expect(who._config.what.group).not.toBe('Transactions');
  });

  it('leaves customSource and attribute exactly as filed', () => {
    const who: any = Object.values(withCustomSourceOnly().root!.nodes).find((n: any) => n.label === 'Ticket size');
    expect(who._config.customSource).toBe('Transaction attribute');
    expect(who._config.attribute).toBe('Transaction Amount');
    expect(who._config.source).toBeUndefined();
  });

  it('keeps the High and Low arms, and the reaction fork is still Previous message', () => {
    const c = withCustomSourceOnly();
    const who: any = Object.values(c.root!.nodes).find((n: any) => n.label === 'Ticket size');
    expect(c.root!.edges.filter((e) => e.from === who.id).map((e) => e.branchLabel)).toEqual(['High', 'Low']);
    const react: any = Object.values(c.root!.nodes).find((n: any) => n.label === 'Read?');
    expect(react._config.what.group).toBe('Previous message');
  });
});
