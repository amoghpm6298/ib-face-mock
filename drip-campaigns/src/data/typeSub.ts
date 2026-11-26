// Ported from journeysnudgesemi/emi-conversions-prototype.html.
import type { DcNodeType } from './nodeMeta';

export const DC_ENTRY_TYPES: DcNodeType[] = ['ENTRY_SEGMENT', 'ENTRY_EVENT'];

export const DC_TYPE_SUB: Record<DcNodeType, string> = {
  ENTRY_SEGMENT: 'Start everyone who matches, once or on a repeating schedule',
  ENTRY_EVENT: 'Start when an event occurs',
  SEND: 'Send a message through a selected channel',
  PAUSE: 'Wait for a fixed duration',
  WAIT_UNTIL: 'Wait until an event occurs',
  SPLIT: 'Splits into Yes or No, based on conditions you set',
  DECISION_SPLIT: 'Splits into multiple paths, one per attribute value',
  RANDOM_SPLIT: 'Split traffic between variants',
  // Addable by hand since 2026-10-12, and in DC_STEP_TYPES under Decisions.
  // This line used to say "system-generated, not addable" — in the picker
  // that offers it.
  GOAL_CHECK: 'Has the campaign goal been achieved?',
  EXIT: 'End the journey for this path',
};
