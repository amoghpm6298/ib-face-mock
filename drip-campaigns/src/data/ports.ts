// What an edge MEANS, as opposed to what it says.
//
// Branch polarity used to be stored only as display text. `'Yes'` / `'No'` /
// `'Anything else'` were the sole identity of a node's outputs, and three
// different things read them: reconcile matched the catch-all by its label,
// removing a Goal Check found its arms with `=== 'Yes'`, and analytics
// decided a fork was a yes/no pair with a regex. So an import that wrote
// `"yes"` in lower case, or anyone renaming an arm, silently re-routed the
// campaign — the display text and the wiring were the same field.
//
// `port` is that identity, written on every edge the builder creates.
// `branchLabel` is display only: renaming an arm on the canvas cannot change
// where anyone goes.
//
//   next     a plain continuation. Several from one node are parallel paths,
//            each named freely by the author — names, not routes.
//   yes/no   the two arms of a Condition or a Goal Check. Also the two arms
//            of the outcome Condition auto-inserted after a multi-outcome
//            wait, whose labels read "Success outcome"/"Other outcome".
//   event    a Wait for Event's awaited event actually happened.
//   timeout  a Wait for Event gave up. (Displayed as Yes/No today; the port
//            is what the code reads, so renaming the display is now a free,
//            separate decision.)
//   branch   one arm of an Experiment or a Branch, identified by `branchId`.
//   else     a Branch's catch-all.
import type { DripEdge } from './graphTypes';

export const DC_PORTS = ['next', 'yes', 'no', 'event', 'timeout', 'branch', 'else'] as const;
export type DripPort = (typeof DC_PORTS)[number];

export function dcIsPort(value: unknown): value is DripPort {
  return typeof value === 'string' && (DC_PORTS as readonly string[]).includes(value);
}

// Legacy edges — seeded, imported, or saved before ports existed — carry no
// `port`, so it is derived from what they do say. This is a compatibility
// shim for data this app did not write, not the main path: everything the
// builder creates sets `port` explicitly, and the seeds carry it.
//
// Case-insensitive on purpose. A file writing "yes" was the audit's own
// example of silently flipped routing, and `=== 'Yes'` was why.
export function dcPortOf(edge: Pick<DripEdge, 'branchLabel' | 'branchId' | 'port'>): DripPort {
  if (dcIsPort(edge.port)) return edge.port;
  if (edge.branchId) return 'branch';
  const label = String(edge.branchLabel || '').trim().toLowerCase();
  if (!label) return 'next';
  if (label === 'yes') return 'yes';
  if (label === 'no') return 'no';
  if (label === 'anything else') return 'else';
  // A named parallel path, or an arm whose label was written by hand.
  return 'next';
}
