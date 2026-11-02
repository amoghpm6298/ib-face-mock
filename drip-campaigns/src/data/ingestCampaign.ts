// Turn a designer Download (or a raw campaign) into a DRAFT this builder can open.
//
// Not a compiler. The agent already compiled the graph. We unwrap, give it an
// id, and write today's filter/what only where that does not smash a who-split
// onto Account.
//
// Designer who-splits arrive as source/customSource "{Entity} attribute"
// (e.g. "Transaction attribute" + attribute "Transaction Amount").
// Ticket size is ELIGIBILITY_META.Transaction / Transaction Amount.
//
// The Branch what picker now HAS a Transaction group (singular: one
// transaction's own attributes), so a who-split filed against Transaction
// resolves to it and writing what { group: "Transaction", field:
// "Transaction Amount" } is correct. What must never be written is
// "Transactions" — that is the lookback row, a different question — or
// "Account", which is the reader's own default and would smash ticket size
// onto an account attribute. Either way source and attribute stay exactly
// as filed, and previous-step-outcome forks stay Previous message.
//
// A who-split filed against any entity the picker has no group for is left
// untouched instead: there is no field to light up, so resolving it would
// only produce the Account smash.
import type { DripCampaign, DripGraph, DripNode } from './graphTypes';
import { dcBranchWhatOf, dcFiltersOf } from './filters';

const ENTITY_ATTRIBUTE = /^(.+) attribute$/i;

export type IngestResult =
  | { ok: true; campaign: DripCampaign }
  | { ok: false; error: string };

function asCampaign(raw: unknown): { name?: string; root?: DripGraph | null } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.campaign && typeof o.campaign === 'object') {
    const inner = o.campaign as Record<string, unknown>;
    if (inner.root && typeof inner.root === 'object') return inner as { name?: string; root?: DripGraph };
  }
  if (o.root && typeof o.root === 'object') return o as { name?: string; root?: DripGraph };
  return null;
}

// Entities the Branch what picker has a real group for. A who-split filed
// against one of these can be resolved; one filed against anything else is
// left exactly as it came, because there is no field to light up and the
// reader's own default would smash it onto Account.
const RESOLVABLE_WHO_ENTITIES = ['account', 'transaction'];

function isWhoAttributeSource(source: unknown): boolean {
  const m = String(source ?? '').trim().match(ENTITY_ATTRIBUTE);
  if (!m) return false;
  return !RESOLVABLE_WHO_ENTITIES.includes(m[1].toLowerCase());
}

function whoSourceOf(cfg: Record<string, unknown> | null | undefined): unknown {
  if (!cfg) return undefined;
  return cfg.source ?? cfg.customSource;
}

function normalizeNode(node: DripNode): DripNode {
  const cfg = (node._config ?? null) as Record<string, unknown> | null;
  if (!cfg) return node;
  if (isWhoAttributeSource(whoSourceOf(cfg))) return node;

  const type = node.type;
  if (type === 'DECISION_SPLIT') {
    if (cfg.what && typeof cfg.what === 'object' && (cfg.what as { group?: string }).group) return node;
    const what = dcBranchWhatOf(cfg);
    return { ...node, _config: { ...cfg, what } };
  }
  if (type === 'ENTRY_SEGMENT' || type === 'SPLIT') {
    if (Array.isArray(cfg.filters) && cfg.filters.length) return node;
    const filters = dcFiltersOf(type, cfg);
    if (!filters.length) return node;
    return { ...node, _config: { ...cfg, filters } };
  }
  return node;
}

function normalizeGraph(root: DripGraph): DripGraph {
  const nodes: DripGraph['nodes'] = {};
  for (const [id, node] of Object.entries(root.nodes)) nodes[id] = normalizeNode(node);
  return { ...root, nodes };
}

export function ingestCampaignJson(raw: unknown, nextId: string): IngestResult {
  const parsed = asCampaign(raw);
  if (!parsed?.root || typeof parsed.root.nodes !== 'object' || !Array.isArray(parsed.root.edges)) {
    return { ok: false, error: 'This is not a drip campaign.' };
  }
  const name = String(parsed.name ?? '').trim() || 'Untitled';
  const src = parsed as Partial<DripCampaign>;
  const campaign: DripCampaign = {
    id: nextId,
    name,
    description: src.description ?? '',
    issuer: src.issuer ?? '',
    applyToAllPrograms: src.applyToAllPrograms ?? false,
    programs: Array.isArray(src.programs) ? src.programs : [],
    goal: src.goal ?? null,
    controlPct: typeof src.controlPct === 'number' ? src.controlPct : 10,
    status: 'DRAFT',
    root: normalizeGraph(parsed.root),
    startDate: src.startDate ?? '',
    endDate: src.endDate ?? '',
    versionOf: null,
    allowReEntry: src.allowReEntry,
    reEntryCooloffDuration: src.reEntryCooloffDuration,
    reEntryCooloffUnit: src.reEntryCooloffUnit,
    guardrails: src.guardrails,
  };
  return { ok: true, campaign };
}

export function parseCampaignFile(text: string, nextId: string): IngestResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This is not a drip campaign.' };
  }
  return ingestCampaignJson(raw, nextId);
}
