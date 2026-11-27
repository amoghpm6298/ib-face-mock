// Thin step dispatcher holding all shared state — the create/edit flow is
// five steps: Basic Details -> Goal Definition -> Builder -> Guardrails ->
// Review. `graph` is a small
// history stack rather than a bare useState, so the Builder step can
// offer real Undo/Redo. Doesn't know about the campaigns list or
// persistence; emits a finished payload via onSaveDraft/onSubmit for
// whatever owns the list (Phase 4) to persist.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react';
import { dcJourneyLengthDays, dcSuggestConversionWindow } from '../data/conversionWindow';
import type { DripCampaign, DripGoal, DripGraph, DripQuietHours } from '../data/graphTypes';
import { DC_STEP_TYPES, type DcNodeType } from '../data/nodeMeta';
import { DC_ENTRY_TYPES } from '../data/typeSub';
import type { PrevStepSend } from '../data/sharedConstants';
import { dcConfirmAddNode, dcConfirmEditNode, dcRemoveEdge, dcRemoveGoalCheck, dcRemoveRoot, dcRenameEdge, type DcAddingAt } from '../reducer/campaignReducer';
import { dcReconcileGoal, dcValidateCampaign } from '../reducer/campaignReducer';
import { dcDefaultConfig, dcDefaultExitReason } from '../reducer/defaultConfig';
import { dcPruneGraphForEvents } from '../reducer/programChange';
import { dcAppEventsForPrograms } from '../data/sharedConstants';
import { BasicDetailsStep } from './BasicDetailsStep';
import { GoalDefinitionStep } from './GoalDefinitionStep';
import { BuilderStep } from './BuilderStep';
import { GuardrailsStep } from './GuardrailsStep';
import { ReviewStep } from './ReviewStep';
import { WizardStepper } from './WizardStepper';
import { AddEditDrawer } from './AddEditDrawer';
import { Icon } from '../components/icons';
import './dripBuilder.css';

const EMPTY_GRAPH: DripGraph = { nodes: {}, edges: [], rootId: null };

// The full non-Entry taxonomy comes straight from DC_STEP_TYPES
// (nodeMeta.ts) — this file used to keep its own hand-maintained copy,
// which then silently fell out of step when GOAL_CHECK became addable:
// the shared list had it, this one didn't, so the tile never rendered.
// One list, one place. Which tiles are actually pickable right now is
// controlled by `disabledTypes` below, never by shortening the list
// (Phase 1 §10: show disabled-with-a-reason, never silently omit).

// Mid-chain insert only reattaches cleanly when the new node (plus its
// own auto-children) leaves exactly one dangling continuation edge — a
// branching type (Branch/Experiment) leaves several open arms, and a
// terminal type (Exit/Goal Reached) leaves none, with no single correct
// edge to reattach to. The reducer itself is defensive about this too
// (see campaignReducer.ts) — this list is what the UI disables/explains.
const MID_EDGE_DISABLED_REASON = "Branching and terminal steps can't be inserted mid-chain — add this after the step above instead.";
// Anything that leaves MORE THAN ONE open arm cannot be spliced into an
// existing edge: the reducer reattaches the original target only when
// exactly one dangling edge remains, so with two arms the rest of the
// chain was silently orphaned — still in `nodes`, unreachable, counted in
// Review's totals and saved in the payload. Condition and Wait For Event
// both leave two.
const MID_EDGE_RESTRICTED_TYPES: DcNodeType[] = ['DECISION_SPLIT', 'RANDOM_SPLIT', 'SPLIT', 'WAIT_UNTIL', 'EXIT'];

// Goal Reached is only a legitimate manual pick on an already-forked
// branch arm (Phase 1 §5) — anywhere else it would silently mark
// everyone who reaches that point as having achieved the goal,
// unconditionally, with no way back (the exact dead-end pattern this
// restriction exists to prevent).
const GOAL_CHECK_NO_GOAL_REASON = 'No campaign Goal is defined yet, so there is nothing for this to check. Set one on the Goal step first.';
const GOAL_CHECK_EXIT_ON_REASON = 'Customers leave the journey as soon as they convert, so this could only ever answer No. Turn off "Stop messaging customers once they convert" on the Goal step if you need to ask it.';

export interface DripBuilderPayload {
  name: string;
  description: string;
  goal: DripGoal | null;
  controlPct: number;
  issuer: string;
  applyToAllPrograms: boolean;
  programs: string[];
  startDate: string;
  endDate: string;
  allowReEntry: boolean;
  reEntryCooloffDuration: number;
  reEntryCooloffUnit: 'days' | 'hours';
  guardrails: { dnc: boolean; npa: boolean; quietHours: DripQuietHours };
  status: 'DRAFT' | 'SCHEDULED';
  root: DripGraph;
}

type BuilderStepKind = 'basicDetails' | 'goalDefinition' | 'builder' | 'guardrails' | 'review';

export function DripBuilder({
  initial,
  onSaveDraft,
  onSubmit,
  onBack,
}: {
  initial?: DripCampaign;
  onSaveDraft: (payload: DripBuilderPayload) => void;
  onSubmit: (payload: DripBuilderPayload) => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState<BuilderStepKind>(initial ? 'builder' : 'basicDetails');
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [issuer, setIssuer] = useState(initial?.issuer || '');
  const [applyToAllPrograms, setApplyToAllPrograms] = useState(initial?.applyToAllPrograms ?? false);
  const [programs, setPrograms] = useState<string[]>(initial?.programs || []);
  const [controlPct, setControlPct] = useState(initial?.controlPct ?? 10);
  const [allowReEntry, setAllowReEntry] = useState(initial?.allowReEntry ?? false);
  const [reEntryCooloffDuration, setReEntryCooloffDuration] = useState(initial?.reEntryCooloffDuration ?? 0);
  const [reEntryCooloffUnit, setReEntryCooloffUnit] = useState<'days' | 'hours'>(initial?.reEntryCooloffUnit ?? 'days');
  const [dnc, setDnc] = useState(initial?.guardrails?.dnc ?? true);
  const [npa, setNpa] = useState(initial?.guardrails?.npa ?? true);
  // On by default, like the two lists: TRAI's promotional window is the
  // rule for an Indian issuer, not a preference. A campaign saved before
  // this existed opens with the same default rather than silently
  // unprotected.
  const [quietHours, setQuietHours] = useState<DripQuietHours>(
    initial?.guardrails?.quietHours ?? { enabled: true, start: '21:00', end: '09:00', behavior: 'defer' },
  );
  const [startDate, setStartDate] = useState(initial?.startDate || '');
  const [endDate, setEndDate] = useState(initial?.endDate || '');
  const [goal, setGoal] = useState<DripGoal | null>(initial?.goal || null);

  // Graph as a history stack — every mutation pushes a new entry
  // (truncating any redo tail first), so Undo/Redo just move the index.
  const [history, setHistory] = useState<DripGraph[]>([initial?.root ? structuredClone(initial.root) : EMPTY_GRAPH]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const graph = history[historyIndex];
  function pushGraph(next: DripGraph) {
    setHistory((h) => [...h.slice(0, historyIndex + 1), next]);
    setHistoryIndex((i) => i + 1);
  }
  // Changing the program changes which events the app emits, so an
  // app-activity filter pointing at an event the new program does not have
  // is cleared. The row stays put, visibly waiting for a new event, rather
  // than disappearing along with the window and direction already set on it.
  // The goal is editable after the graph is built, and auto-generated goal
  // wiring was derived from whatever the goal was when each node was added.
  // Re-derive it here so the two cannot drift — same shape as changePrograms
  // below, which already does this for app events.
  // The window is suggested ONCE, the first time a goal gets an event, from
  // the length of the journey as it stands. Never recomputed afterwards: a
  // number that silently changes as the canvas is edited is worse than one
  // the author can see and correct.
  function withSuggestedWindow(next: DripGoal | null): DripGoal | null {
    if (!next?.eventType || next.conversionWindow) return next;
    return { ...next, conversionWindow: dcSuggestConversionWindow(graph) };
  }

  function changeGoal(incoming: DripGoal | null) {
    const next = withSuggestedWindow(incoming);
    setGoal(next);
    const reconciled = dcReconcileGoal(graph, next);
    if (reconciled !== graph) pushGraph(reconciled);
  }

  function changePrograms(next: string[]) {
    setPrograms(next);
    const available = dcAppEventsForPrograms(next).map((e) => e.id);
    const pruned = dcPruneGraphForEvents(graph, available, goal);
    if (pruned !== graph) pushGraph(pruned);
  }

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Add/edit drawer state.
  const [addingAt, setAddingAt] = useState<DcAddingAt | null>(null);
  const [addingType, setAddingType] = useState<DcNodeType | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [pendingConfig, setPendingConfig] = useState<any>({});
  const [showValidation, setShowValidation] = useState(false);

  const drawerOpen = addingAt !== null || editingNodeId !== null;

  const addingAtSourceId = useMemo(() => {
    if (!addingAt) return null;
    if (addingAt.kind === 'edge' || addingAt.kind === 'midEdge') return graph.edges.find((x) => x.id === addingAt.edgeId)?.from ?? null;
    if (addingAt.kind === 'growLeaf') return addingAt.nodeId;
    return null;
  }, [addingAt, graph]);

  // Which Add Step tiles are offered but disabled right now, and why —
  // every tile always renders (Phase 1 §10), this only controls which
  // ones are clickable. Two independent restrictions can apply at once
  // (mid-chain insert into a linear edge), so they're merged rather than
  // treated as mutually exclusive.
  const disabledTypes = useMemo((): Partial<Record<DcNodeType, string>> => {
    const d: Partial<Record<DcNodeType, string>> = {};
    if (addingAt?.kind === 'midEdge') {
      MID_EDGE_RESTRICTED_TYPES.forEach((t) => {
        d[t] = MID_EDGE_DISABLED_REASON;
      });
    }
    // A Goal Check asks one question — "has the campaign Goal been
    // achieved?" — so with no Goal defined there is nothing for it to
    // check. And with exit on conversion ON, an account that converts has
    // already left the journey, so the answer could only ever be No:
    // offered, visibly disabled, with the reason stated.
    if (!goal?.eventType) d['GOAL_CHECK'] = GOAL_CHECK_NO_GOAL_REASON;
    else if (goal.exitOnConversion !== false) d['GOAL_CHECK'] = GOAL_CHECK_EXIT_ON_REASON;
    return d;
  }, [addingAt, addingAtSourceId, graph, goal]);

  // The most recent Send before this point — walks backward via incoming
  // edges, transparently skipping the auto goal-check Split every Send
  // inserts, so "previous step outcome" means the last real message sent,
  // not just the nearest node. Carries the fallback channel along too —
  // if a fallback is configured, the primary could have failed and the
  // fallback delivered instead, so "previous step outcome" needs both
  // channels' delivery-status vocabularies, not just the primary's.
  const previousStepChannel: PrevStepSend | null = useMemo(() => {
    let nodeId = editingNodeId !== null ? editingNodeId : addingAtSourceId;
    while (nodeId) {
      const nd = graph.nodes[nodeId];
      if (nd && nd.type === 'SEND' && nd._config) {
        const cfg = nd._config as any;
        return { channel: cfg.channel, fallbackChannel: cfg.fallbackChannel || null };
      }
      const inc = graph.edges.find((e) => e.to === nodeId);
      nodeId = inc ? inc.from : null;
    }
    return null;
  }, [editingNodeId, addingAtSourceId, graph]);

  function selectAddAt(at: DcAddingAt) {
    setAddingAt(at);
    setAddingType(null);
    setPendingConfig({});
    setEditingNodeId(null);
  }

  function pickType(t: DcNodeType) {
    setAddingType(t);
    const config = dcDefaultConfig(t);
    if (t === 'EXIT') config.reason = dcDefaultExitReason(graph, addingAt);
    setPendingConfig(config);
  }

  function cancelAdd() {
    setAddingAt(null);
    setAddingType(null);
  }

  function confirmAddNode() {
    if (!addingType || !addingAt) return;
    const next = dcConfirmAddNode(graph, addingType, pendingConfig, addingAt, goal);
    pushGraph(next);
    cancelAdd();
  }

  function openEditNode(nodeId: string) {
    const node = graph.nodes[nodeId];
    if (!node) return;
    setEditingNodeId(nodeId);
    setAddingType(node.type);
    // Auto-generated nodes (a Send's goal-check Split, its GOAL_EXIT, a
    // Wait Until's outcome-check Split) are created with `_config: null`
    // by design (dcConfirmAddNode) — their label/meta is hardcoded
    // directly, not form-driven. Falling back to `{}` here left every
    // field genuinely undefined, which NodeForms.tsx renders as broken
    // rather than blank (e.g. a SPLIT's `p.basis === 'Goal reached'`
    // check silently fails and misroutes into the empty Custom-condition
    // branch). dcDefaultConfig gives a type-correct, sensibly-prefilled
    // starting point instead — exactly the shape a brand-new node of
    // this type would start from.
    setPendingConfig(node._config ? structuredClone(node._config) : dcDefaultConfig(node.type));
  }
  function cancelEdit() {
    setEditingNodeId(null);
    setAddingType(null);
  }
  function confirmEditNode() {
    if (!editingNodeId || !addingType) return;
    const next = dcConfirmEditNode(graph, editingNodeId, addingType, pendingConfig, goal);
    pushGraph(next);
    cancelEdit();
  }

  function removeEdge(edgeId: string) {
    pushGraph(dcRemoveEdge(graph, edgeId));
  }
  function renameEdge(edgeId: string, label: string) {
    pushGraph(dcRenameEdge(graph, edgeId, label));
  }
  function removeRoot() {
    pushGraph(dcRemoveRoot(graph));
  }
  function replaceAuto(edgeId: string) {
    removeEdge(edgeId);
    selectAddAt({ kind: 'edge', edgeId });
  }
  function removeGoalCheck(nodeId: string) {
    pushGraph(dcRemoveGoalCheck(graph, nodeId));
  }

  const isEntry = graph.rootId === null;
  // Every reachable node is re-checked against the same rule its own drawer
  // enforces, plus the structural ones. Submit used to check only name,
  // issuer, root and open slots, so anything that got into the graph by a
  // route other than the drawer was never examined again.
  // Setup goes through the same validator as the journey. Name and issuer
  // used to be checked here instead, in a ternary chain of their own, which
  // is the split brain C3 fixed for node config: one rule in the gate and
  // another in a component drift the moment either moves.
  const issues = dcValidateCampaign(graph, goal && goal.eventType ? goal : null, {
    name,
    issuer,
    applyToAllPrograms,
    programs,
    controlPct,
    startDate,
    endDate,
    quietHours,
    goal: goal && goal.eventType ? goal : null,
  });
  const canSubmit = issues.length === 0;

  const validationMessage: string | null = !showValidation
    ? null
    : issues.length === 0
      ? null
      : issues.length === 1
        ? issues[0].message
        : `${issues[0].message} (and ${issues.length - 1} more to resolve)`;

  function buildPayload(status: 'DRAFT' | 'SCHEDULED'): DripBuilderPayload {
    // Never persist a half-filled goal (category picked, no event type
    // yet) — same discipline the old GoalDrawer's disabled Save button
    // enforced, now applied at save time since Goal Definition no longer
    // has a separate draft/commit step of its own.
    const cleanGoal = goal && goal.eventType ? goal : null;
    return {
      name,
      description,
      goal: cleanGoal,
      controlPct: Number(controlPct),
      issuer,
      applyToAllPrograms,
      programs,
      startDate,
      endDate,
      allowReEntry,
      reEntryCooloffDuration: Number(reEntryCooloffDuration),
      reEntryCooloffUnit,
      guardrails: { dnc, npa, quietHours },
      status,
      root: graph,
    };
  }

  function handleSubmitClick() {
    if (!canSubmit) {
      setShowValidation(true);
      return;
    }
    onSubmit(buildPayload('SCHEDULED'));
  }

  // "Complete" means nothing on that step is blocking submission. A goal is
  // genuinely optional — the step says so, the gate never requires one, and a
  // campaign without one simply gets no auto goal-checks — so the rail used
  // to contradict the page it was pointing at by marking it unfinished.
  const isStepComplete = (s: BuilderStepKind) => (s === 'basicDetails' ? !!name : true);

  return (
    <div className="dcb-shell">
      <WizardStepper current={step} onNavigate={setStep} onBack={onBack} isStepComplete={isStepComplete} isEditing={!!initial} />

      <div className="dcb-main">
        {step === 'basicDetails' && (
          <div className="dcb-step-body">
            <BasicDetailsStep
              name={name}
              onNameChange={setName}
              description={description}
              onDescriptionChange={setDescription}
              issuer={issuer}
              onIssuerChange={setIssuer}
              applyToAllPrograms={applyToAllPrograms}
              onApplyToAllProgramsChange={setApplyToAllPrograms}
              programs={programs}
              onProgramsChange={changePrograms}
              controlPct={controlPct}
              onControlPctChange={setControlPct}
              allowReEntry={allowReEntry}
              onAllowReEntryChange={setAllowReEntry}
              reEntryCooloffDuration={reEntryCooloffDuration}
              onReEntryCooloffDurationChange={setReEntryCooloffDuration}
              reEntryCooloffUnit={reEntryCooloffUnit}
              onReEntryCooloffUnitChange={setReEntryCooloffUnit}
              startDate={startDate}
              onStartDateChange={setStartDate}
              endDate={endDate}
              onEndDateChange={setEndDate}
              onSaveDraft={() => onSaveDraft(buildPayload('DRAFT'))}
              onContinue={() => setStep('goalDefinition')}
            />
          </div>
        )}

        {step === 'goalDefinition' && (
          <div className="dcb-step-body">
            <GoalDefinitionStep
              goal={goal}
              onGoalChange={changeGoal}
              goalCheckCount={Object.values(graph.nodes).filter((n) => n.type === 'GOAL_CHECK').length}
              journeyLengthDays={dcJourneyLengthDays(graph)}
              onRemoveGoalChecks={() => {
                // Each removal keeps whatever was under its No arm, exactly
                // as removing it from the canvas would.
                let next = graph;
                for (const n of Object.values(graph.nodes)) {
                  if (n.type === 'GOAL_CHECK') next = dcRemoveGoalCheck(next, n.id);
                }
                if (next !== graph) pushGraph(next);
              }}
              onSaveDraft={() => onSaveDraft(buildPayload('DRAFT'))}
              onContinue={() => setStep('builder')}
            />
          </div>
        )}

        {step === 'builder' && (
          <>
            <div className="dcb-builder-topbar">
              <button className="btn secondary small" disabled={!canUndo} onClick={() => setHistoryIndex((i) => Math.max(0, i - 1))} title="Undo">
                <Icon name="undo" /> Undo
              </button>
              <button className="btn secondary small" disabled={!canRedo} onClick={() => setHistoryIndex((i) => Math.min(history.length - 1, i + 1))} title="Redo">
                <Icon name="redo" /> Redo
              </button>
              <div className="dcb-builder-topbar-spacer" />
              <button className="btn primary" onClick={() => setStep('guardrails')}>
                Continue to Guardrails →
              </button>
            </div>
            <BuilderStep
              graph={graph}
              goal={goal}
              onAddEntry={() => selectAddAt({ kind: 'root' })}
              onEditNode={openEditNode}
              onRemoveRoot={removeRoot}
              onReplaceAuto={replaceAuto}
              onRemoveEdge={removeEdge}
              onAddAtEdge={(edgeId) => selectAddAt({ kind: 'edge', edgeId })}
              onAddAtGrowLeaf={(nodeId) => selectAddAt({ kind: 'growLeaf', nodeId })}
              onAddAtMidEdge={(edgeId) => selectAddAt({ kind: 'midEdge', edgeId })}
              onAddParallel={(nodeId) => selectAddAt({ kind: 'growLeaf', nodeId })}
              onRenameEdge={renameEdge}
              onRemoveGoalCheck={removeGoalCheck}
            />
          </>
        )}

        {step === 'guardrails' && (
          <div className="dcb-step-body">
            <GuardrailsStep
              dnc={dnc}
              onDncChange={setDnc}
              npa={npa}
              onNpaChange={setNpa}
              quietHours={quietHours}
              onQuietHoursChange={setQuietHours}
              conversionCheck={!goal?.eventType ? 'noGoal' : goal.exitOnConversion === false ? 'off' : 'on'}
              onSaveDraft={() => onSaveDraft(buildPayload('DRAFT'))}
              onContinue={() => setStep('review')}
            />
          </div>
        )}

        {step === 'review' && (
          <div className="dcb-step-body">
            <ReviewStep
              name={name}
              description={description}
              issuer={issuer}
              applyToAllPrograms={applyToAllPrograms}
              programs={programs}
              controlPct={controlPct}
              startDate={startDate}
              endDate={endDate}
              allowReEntry={allowReEntry}
              reEntryCooloffDuration={reEntryCooloffDuration}
              reEntryCooloffUnit={reEntryCooloffUnit}
              dnc={dnc}
              npa={npa}
              quietHours={quietHours}
              goal={goal}
              graph={graph}
              validationMessage={validationMessage}
              onSaveDraft={() => onSaveDraft(buildPayload('DRAFT'))}
              onSubmit={handleSubmitClick}
              importedJson={initial?.importedJson}
              importedAt={initial?.importedAt}
            />
          </div>
        )}
      </div>

      <AddEditDrawer
        open={drawerOpen}
        isEditing={editingNodeId !== null}
        isEntry={isEntry}
        isMidEdge={addingAt?.kind === 'midEdge'}
        types={isEntry ? DC_ENTRY_TYPES : DC_STEP_TYPES}
        disabledTypes={isEntry ? undefined : disabledTypes}
        selectedType={addingType}
        pendingConfig={pendingConfig}
        onConfigChange={(patch) => setPendingConfig((p: any) => ({ ...p, ...patch }))}
        onPickType={pickType}
        onCancel={editingNodeId !== null ? cancelEdit : cancelAdd}
        onConfirm={editingNodeId !== null ? confirmEditNode : confirmAddNode}
        goal={goal}
        previousStepChannel={previousStepChannel}
        onGoToGoal={() => {
          cancelEdit();
          setStep('goalDefinition');
        }}
      />
    </div>
  );
}
