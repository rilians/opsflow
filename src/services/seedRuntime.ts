import type { AppState } from '@/types';
import { createSeedState } from '@/data/seed';
import { runAutomation, syncWorkflow } from '@/services/automationEngine';
import { reconcileState } from '@/lib/domain';

/**
 * Bootstraps the workspace on first load.
 *
 * The static seed ships with pre-computed counters and history, but no single BOT
 * run has "really" happened in this browser yet. To keep the demo honest we run
 * every *enabled* BOT once against the seeded data, exactly the way the user would
 * trigger it later from the Automation Center. Every execution record, notification
 * and activity entry produced here is real engine output — nothing is pre-baked.
 *
 * Order matters: validation and assignment first so the reminder/escalation BOTs
 * see a settled queue, then duplicate detection last because it flags records the
 * earlier passes may have touched.
 */
const BOOT_ORDER = [
  'data_validation',
  'smart_assignment',
  'deadline_reminder',
  'sla_escalation',
  'duplicate_detection',
  'auto_reporting',
];

export function prepareInitialState(): AppState {
  let state = createSeedState();

  // 1. Repair any invariant the seed generator could not know about, and rebuild
  //    workflow instances so they line up with task statuses.
  reconcileState(state);
  state.tasks.forEach((t) => syncWorkflow(state, t));

  // 2. Execute enabled BOTs for real, in dependency order.
  for (const botKey of BOOT_ORDER) {
    const rule = state.automations.find((a) => a.botKey === botKey);
    if (!rule?.enabled) continue;
    const result = runAutomation(state, rule.id, { mode: 'Scheduled simulation' });
    if ('state' in result) state = result.state;
  }

  // 3. Final sweep — a BOT that ran last (duplicate detection, reporting) may have
  //    changed statuses after earlier passes reconciled them.
  reconcileState(state);
  return state;
}
