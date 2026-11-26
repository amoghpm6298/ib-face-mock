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
import type { DripCampaign, DripGoal, DripGraph, DripNode } from './graphTypes';
import { dcBranchWhatOf, dcFiltersOf } from './filters';
import { DC_NODE_META } from './nodeMeta';
import { DC_PORTS, dcIsPort } from './ports';
import { dcMigrateGoalNodes, dcNeedsGoalMigration } from './migrateGoal';
import { dcRecomputeLabelMeta } from '../reducer/labelMeta';

const ENTITY_ATTRIBUTE = /^(.+) attribute$/i;

export type IngestResult =
  // `notes` says what the goal migration changed, when it ran. Nothing reads
  // it on screen yet — surfacing it belongs with the validation work — but it
  // is returned rather than discarded, because restructuring someone's
  // campaign silently is not a thing to design in.
  | { ok: true; campaign: DripCampaign; notes?: string[] }
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

// A file is not guaranteed to name its steps — the designer may omit a
// node's label entirely, and a card with no name on it is unreadable. The
// name is DERIVED from the config the file did supply, through the app's own
// label function, so nothing is invented: a Send called nothing reads
// "Send", an Experiment with two arms reads "Experiment". The manager
// renames it in the drawer like any other step. A label the file DID supply
// is never overwritten — that is the designer's own wording and it stays.
function withDerivedLabel(node: DripNode, goal: DripGoal | null): DripNode {
  if (node.label && node.meta) return node;
  const { label, meta } = dcRecomputeLabelMeta(node.type, node._config, goal);
  return { ...node, label: node.label || label, meta: node.meta || meta };
}

function normalizeGraph(root: DripGraph, goal: DripGoal | null): DripGraph {
  const nodes: DripGraph['nodes'] = {};
  for (const [id, node] of Object.entries(root.nodes)) nodes[id] = withDerivedLabel(normalizeNode(node), goal);
  return { ...root, nodes };
}

// Structural integrity, checked before anything is imported.
//
// "nodes is an object and edges is an array" was the whole check, which let
// a file through whose edges pointed at steps that were not in it. The
// builder then rendered a journey with arrows into nothing, or crashed on
// the first missing lookup, and the manager had a draft they could neither
// read nor repair.
//
// Everything here is a reject, not a warning, because none of it is
// fixable in the drawer: a manager cannot retype an edge. It is deliberately
// NOT the submit gate (dcValidateCampaign). That gate reports what is
// unfinished — an open branch, a step with nothing configured — and an
// import is allowed to be unfinished: it lands as a DRAFT, straight in the
// builder, where that same gate is already on screen listing exactly those
// things. Rejecting an import for them would refuse a file whose only fault
// is that it is not done yet.
function graphIntegrityError(root: DripGraph): string | null {
  if (!root.nodes || typeof root.nodes !== 'object' || Array.isArray(root.nodes)) return 'This is not a drip campaign.';
  if (!Array.isArray(root.edges)) return 'This is not a drip campaign.';

  const ids = Object.keys(root.nodes);
  if (!ids.length) return 'This file has no steps in it.';

  for (const id of ids) {
    const node = root.nodes[id] as DripNode | null | undefined;
    if (!node || typeof node !== 'object') return `The step "${id}" is empty.`;
    // An id that disagrees with its own key breaks every edge pointing at
    // it, silently — the edge resolves by key and the node reports another.
    if (node.id !== id) return `The step "${id}" is filed under a different id ("${String(node.id)}").`;
    if (!Object.prototype.hasOwnProperty.call(DC_NODE_META, node.type)) {
      return `The step "${id}" is a kind of step this builder does not have ("${String(node.type)}").`;
    }
  }

  if (root.rootId == null) return 'This file does not say which step starts the journey.';
  if (!Object.prototype.hasOwnProperty.call(root.nodes, root.rootId)) {
    return `The journey starts at a step that is not in the file ("${root.rootId}").`;
  }

  const seenEdgeIds = new Set<string>();
  for (const edge of root.edges) {
    if (!edge || typeof edge !== 'object') return 'One of the connections in this file is empty.';
    if (!edge.id || typeof edge.id !== 'string') return 'One of the connections in this file has no id.';
    // The reducer reconciles branches by edge id, so a duplicate makes two
    // different arms the same arm.
    if (seenEdgeIds.has(edge.id)) return `Two connections in this file share one id ("${edge.id}").`;
    seenEdgeIds.add(edge.id);
    if (!Object.prototype.hasOwnProperty.call(root.nodes, edge.from)) {
      return `A connection comes from a step that is not in the file ("${String(edge.from)}").`;
    }
    // to === null is a real, intended state: an open slot the manager fills
    // in the builder. Only a named step that is missing is wrong.
    if (edge.to != null && !Object.prototype.hasOwnProperty.call(root.nodes, edge.to)) {
      return `A connection goes to a step that is not in the file ("${String(edge.to)}").`;
    }
    // A port it does not recognise is worse than none at all: with no port,
    // dcPortOf falls back to reading the label and the campaign still routes
    // the way it reads, but an unknown value would be carried into the graph
    // and silently match nothing.
    if (edge.port !== undefined && !dcIsPort(edge.port)) {
      return `A connection has a kind this builder does not have ("${String(edge.port)}"). Expected one of: ${DC_PORTS.join(', ')}.`;
    }
  }
  return null;
}

export function ingestCampaignJson(raw: unknown, nextId: string, sourceText?: string): IngestResult {
  const parsed = asCampaign(raw);
  if (!parsed?.root || typeof parsed.root.nodes !== 'object' || !Array.isArray(parsed.root.edges)) {
    return { ok: false, error: 'This is not a drip campaign.' };
  }
  // Goal nodes are migrated BEFORE the integrity check, not after: a file
  // written against the old model carries GOAL_EXIT, which is no longer a
  // kind of step this builder has, and the integrity check would reject the
  // whole file for it. Migrating first means an old file imports as the new
  // model rather than being refused for being old.
  const migrated = dcNeedsGoalMigration(parsed.root) ? dcMigrateGoalNodes(parsed.root) : { graph: parsed.root, notes: [] };
  const root = migrated.graph;

  const integrity = graphIntegrityError(root);
  if (integrity) return { ok: false, error: integrity };
  const name = String(parsed.name ?? '').trim() || 'Untitled';
  const src = parsed as Partial<DripCampaign>;
  const campaign: DripCampaign = {
    id: nextId,
    name,
    description: src.description ?? '',
    issuer: src.issuer ?? '',
    applyToAllPrograms: src.applyToAllPrograms ?? false,
    programs: Array.isArray(src.programs) ? src.programs : [],
    // A campaign that names a goal gets the new conversion settings, since
    // the old model had no way to express them. Exit on conversion matches
    // the default a new campaign gets.
    goal: src.goal ? { ...src.goal, exitOnConversion: src.goal.exitOnConversion ?? true } : null,
    controlPct: typeof src.controlPct === 'number' ? src.controlPct : 10,
    status: 'DRAFT',
    root: normalizeGraph(root, src.goal ?? null),
    startDate: src.startDate ?? '',
    endDate: src.endDate ?? '',
    versionOf: null,
    // Verbatim when we have the original text; otherwise a faithful
    // re-encoding of what was handed in.
    importedJson: sourceText ?? JSON.stringify(raw, null, 2),
    importedAt: new Date().toISOString(),
    allowReEntry: src.allowReEntry,
    reEntryCooloffDuration: src.reEntryCooloffDuration,
    reEntryCooloffUnit: src.reEntryCooloffUnit,
    guardrails: src.guardrails,
  };
  return { ok: true, campaign, notes: migrated.notes };
}

export function parseCampaignFile(text: string, nextId: string): IngestResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This is not a drip campaign.' };
  }
  // The text itself is kept, not a re-encoding of the parse, so the file can
  // be handed back out exactly as it arrived.
  return ingestCampaignJson(raw, nextId, text);
}
