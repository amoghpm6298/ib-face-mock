// The real fix for the two bugs that started this migration: node/slot
// layout and branch-label positioning are now owned by React Flow +
// dagre, not hand-computed. Two-pass render — an initial layout using a
// fallback card height, then a real relayout once React Flow has actually
// measured every node's true rendered height (via useNodesInitialized,
// which becomes true only after every node's ResizeObserver has reported
// in) — is the structural fix for the original's "floating connector"
// bug, which came from feeding dagre a height estimate that didn't match
// real content.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  useNodesInitialized,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { DripGraph, DripGoal } from '../data/graphTypes';
import { dripNodeTypes } from './nodeTypes';
import { dripEdgeTypes } from './DripEdge';
import { graphToFlowElements, type ToFlowOptions, type DripCanvasMetrics } from './toFlowElements';
import './dripCanvas.css';

interface DripCanvasInnerProps {
  graph: DripGraph;
  editable: boolean;
  onEditNode?: (nodeId: string) => void;
  onRemoveRoot?: () => void;
  onReplaceAuto?: (edgeId: string) => void;
  onRemoveEdge?: (edgeId: string) => void;
  onAddAtEdge?: (edgeId: string) => void;
  onAddAtGrowLeaf?: (nodeId: string) => void;
  onAddAtMidEdge?: (edgeId: string) => void;
  onAddParallel?: (nodeId: string) => void;
  onRenameEdge?: (edgeId: string, label: string) => void;
  onRemoveGoalCheck?: (nodeId: string) => void;
  metrics?: DripCanvasMetrics;
  goal?: DripGoal | null;
  onInspectNode?: (nodeId: string) => void;
  onSelectEdge?: (edgeId: string) => void;
  pathNodeIds?: string[];
  pathEdgeIds?: string[];
}

function DripCanvasInner({ graph, editable, onEditNode, onRemoveRoot, onReplaceAuto, onRemoveEdge, onAddAtEdge, onAddAtGrowLeaf, onAddAtMidEdge, onAddParallel, onRenameEdge, onRemoveGoalCheck, metrics, goal, onInspectNode, onSelectEdge, pathNodeIds, pathEdgeIds }: DripCanvasInnerProps) {
  const opts: ToFlowOptions = useMemo(
    () => ({ editable, onEditNode, onRemoveRoot, onReplaceAuto, onRemoveEdge, onAddAtEdge, onAddAtGrowLeaf, onAddAtMidEdge, onAddParallel, onRenameEdge, onRemoveGoalCheck, metrics, goal, onInspectNode, onSelectEdge, pathNodeIds, pathEdgeIds }),
    [editable, onEditNode, onRemoveRoot, onReplaceAuto, onRemoveEdge, onAddAtEdge, onAddAtGrowLeaf, onAddAtMidEdge, onAddParallel, onRenameEdge, onRemoveGoalCheck, metrics, goal, onInspectNode, onSelectEdge, pathNodeIds, pathEdgeIds],
  );
  const initial = useMemo(() => graphToFlowElements(graph, opts), [graph, opts]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [laidOut, setLaidOut] = useState(false);
  const nodesInitialized = useNodesInitialized();
  const { getNodes, fitView, getViewport, setViewport } = useReactFlow();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Re-seed React Flow's own state whenever the underlying graph changes
  // (a different campaign selected, or — in the builder — a real edit).
  useEffect(() => {
    const next = graphToFlowElements(graph, opts);
    setNodes(next.nodes);
    setEdges(next.edges);
    setLaidOut(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, pathNodeIds, pathEdgeIds, metrics]);

  useEffect(() => {
    if (!nodesInitialized || laidOut) return;
    const measuredHeights: Record<string, number> = {};
    getNodes().forEach((n) => {
      if (n.type === 'dcCard' && n.measured?.height) measuredHeights[n.id] = n.measured.height;
    });
    const relaid = graphToFlowElements(graph, { ...opts, measuredHeights });
    setNodes(relaid.nodes);
    setEdges(relaid.edges);
    setLaidOut(true);
    // minZoom keeps the journey readable: fitting a long campaign to the
    // viewport used to shrink it until the words on the first card were
    // gone. Below this floor it stops shrinking and the manager pans
    // instead, which is the honest trade.
    requestAnimationFrame(() => {
      fitView({ padding: 0.15, duration: 200, minZoom: 0.62, maxZoom: 1 });
      // Once it stops shrinking, fitView still CENTRES what does not fit,
      // which puts the start off the top of the viewport. A journey is read
      // from its start, so when the content is taller than the frame the
      // view is anchored there instead of to the middle.
      window.setTimeout(() => {
        const el = wrapRef.current;
        const ns = getNodes();
        if (!el || !ns.length) return;
        const top = Math.min(...ns.map((n) => n.position.y));
        const bottom = Math.max(...ns.map((n) => n.position.y + (n.measured?.height ?? 0)));
        const vp = getViewport();
        if ((bottom - top) * vp.zoom > el.clientHeight) {
          setViewport({ x: vp.x, y: -top * vp.zoom + 24, zoom: vp.zoom }, { duration: 200 });
        }
      }, 260);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesInitialized, laidOut, graph]);

  return (
    <div className="dc-graph-wrap" ref={wrapRef} style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={dripNodeTypes}
        edgeTypes={dripEdgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        /* React Flow drops pointer-events on nodes it considers
           non-selectable, so a read-only card could not be clicked at all
           until this also accounted for inspection. Caught by driving the
           real DOM — the pane swallowed every click. */
        elementsSelectable={editable || !!onInspectNode}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
        {/* Kept — genuinely useful once a journey grows toward the 20-50
            node range this canvas is built to scale to — but made visually
            secondary at the sizes most journeys actually are: small,
            quiet until hovered, no heavy card chrome. */}
        <MiniMap
          pannable
          zoomable
          className="dc-minimap"
          style={{ width: 96, height: 64 }}
          maskColor="rgba(228, 231, 236, 0.5)"
          nodeColor="#d0d5dd"
          nodeStrokeWidth={0}
        />
      </ReactFlow>
    </div>
  );
}

export function DripCanvas(props: DripCanvasInnerProps & { onAddEntry?: () => void }) {
  if (!props.graph.rootId) {
    return props.editable ? (
      <div className="dc-add-entry-placeholder" onClick={props.onAddEntry}>
        + Add Entry
      </div>
    ) : (
      <div style={{ padding: 40, color: 'var(--gray-500)', fontSize: 13 }}>No steps yet — still a draft.</div>
    );
  }
  return (
    <ReactFlowProvider>
      <DripCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
