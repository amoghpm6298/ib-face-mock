// Every step that carries filters, read back as one sentence per filter in
// the order the rows were added. Shown on Review before submitting and on a
// saved campaign afterwards, from this one component so the two cannot
// disagree.
//
// Reads through dcFiltersOf, so a campaign saved before the one-row rewrite
// lists its old conditions here too.
import { dcStepSentences } from '../data/filters';
import type { DripGraph, DripNode } from '../data/graphTypes';

export function FilterReadback({ graph, title = 'Filters' }: { graph: DripGraph | null; title?: string }) {
  if (!graph) return null;
  // Object.values keeps insertion order, which is the order the steps were
  // added, and each node's rows are already in the order they were added.
  const withFilters = Object.values(graph.nodes)
    .map((n: DripNode) => ({ node: n, sentences: dcStepSentences(n.type, n._config) }))
    .filter((x: { sentences: string[] }) => x.sentences.length > 0);
  if (!withFilters.length) return null;
  return (
    <div className="wiz-section">
      <div className="wiz-group-label">{title}</div>
      {withFilters.map(({ node, sentences }) => (
        <div key={node.id} style={{ marginBottom: 8 }}>
          <div className="dl-row-sub">{node.label}</div>
          {sentences.map((sentence, i) => (
            <div className="review-row-main" key={i}>
              {sentence}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
