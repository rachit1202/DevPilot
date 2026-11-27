export type ResetOperationStatus =
  | 'PENDING_ATTEMPTED'
  | 'PENDING_AUTHORIZED'
  | 'VALIDLY_COMPLETED'
  | 'CORRUPTED_SEQUENCE';

export interface EvaluatedResetOperation {
  key: string;
  status: ResetOperationStatus;
  authorizedPayload?: Record<string, unknown>;
  corruptionReason?: string;
  eventsCount: number;
}

export interface ActivityLogResetRecord {
  id: string;
  entityId: string | null; // idempotencyKey
  action: string;
  metadata: unknown;
  createdAt: Date;
}

export const RECOGNIZED_RESET_ACTIONS: Record<string, number> = {
  AI_ENGINE_RESET_ATTEMPTED: 1,
  AI_ENGINE_RESET_AUTHORIZED: 2,
  AI_ENGINE_RESET_COMPLETED: 3,
};

/**
 * Validates the event set for a single idempotency key purely on mathematical set properties,
 * strictly independent of physical array order, timestamps, or UUIDs.
 */
export function evaluateEventSequence(
  key: string,
  events: ActivityLogResetRecord[]
): EvaluatedResetOperation {
  if (!events || events.length === 0) {
    return {
      key,
      status: 'CORRUPTED_SEQUENCE',
      corruptionReason: 'Empty event sequence provided.',
      eventsCount: 0,
    };
  }

  // Exactly at most 3 stages can exist for a single key
  if (events.length > 3) {
    return {
      key,
      status: 'CORRUPTED_SEQUENCE',
      corruptionReason: `Excess events for key: expected at most 3, found ${events.length}.`,
      eventsCount: events.length,
    };
  }

  const seenSequences = new Set<number>();
  const seenActions = new Set<string>();
  let authorizedPayload: Record<string, unknown> | undefined;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];

    // 1. Action recognition check
    const expectedSeq = RECOGNIZED_RESET_ACTIONS[ev.action];
    if (expectedSeq === undefined) {
      return {
        key,
        status: 'CORRUPTED_SEQUENCE',
        corruptionReason: `Unrecognized or malformed reset action: ${ev.action}.`,
        eventsCount: events.length,
      };
    }

    // 2. Duplicate action check
    if (seenActions.has(ev.action)) {
      return {
        key,
        status: 'CORRUPTED_SEQUENCE',
        corruptionReason: `Duplicate action detected: ${ev.action}.`,
        eventsCount: events.length,
      };
    }
    seenActions.add(ev.action);

    // 3. Metadata object validation
    if (!ev.metadata || typeof ev.metadata !== 'object' || Array.isArray(ev.metadata)) {
      return {
        key,
        status: 'CORRUPTED_SEQUENCE',
        corruptionReason: `Record ${ev.id} (${ev.action}) has missing or invalid metadata object.`,
        eventsCount: events.length,
      };
    }

    const meta = ev.metadata as Record<string, unknown>;
    const seq = meta.sequence;

    // 4. Sequence number strict integer validation
    if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1 || seq > 3) {
      return {
        key,
        status: 'CORRUPTED_SEQUENCE',
        corruptionReason: `Record ${ev.id} (${ev.action}) has invalid sequence: ${JSON.stringify(seq)} (must be integer 1, 2, or 3).`,
        eventsCount: events.length,
      };
    }

    // 5. Exact action-to-sequence bijection check
    if (seq !== expectedSeq) {
      return {
        key,
        status: 'CORRUPTED_SEQUENCE',
        corruptionReason: `Action/sequence mismatch in record ${ev.id}: action ${ev.action} has sequence ${seq} (expected ${expectedSeq}).`,
        eventsCount: events.length,
      };
    }

    // 6. Duplicate sequence check
    if (seenSequences.has(seq)) {
      return {
        key,
        status: 'CORRUPTED_SEQUENCE',
        corruptionReason: `Duplicate sequence number ${seq} detected.`,
        eventsCount: events.length,
      };
    }
    seenSequences.add(seq);

    if (ev.action === 'AI_ENGINE_RESET_AUTHORIZED') {
      authorizedPayload = meta;
    }
  }

  // 7. Pure Set-Based Stage Validation (order-independent)
  const hasSeq1 = seenSequences.has(1);
  const hasSeq2 = seenSequences.has(2);
  const hasSeq3 = seenSequences.has(3);

  // Exact set {1} -> PENDING_ATTEMPTED
  if (seenSequences.size === 1 && hasSeq1) {
    return { key, status: 'PENDING_ATTEMPTED', eventsCount: 1 };
  }

  // Exact set {1, 2} -> PENDING_AUTHORIZED
  if (seenSequences.size === 2 && hasSeq1 && hasSeq2) {
    return { key, status: 'PENDING_AUTHORIZED', authorizedPayload, eventsCount: 2 };
  }

  // Exact set {1, 2, 3} -> VALIDLY_COMPLETED
  if (seenSequences.size === 3 && hasSeq1 && hasSeq2 && hasSeq3) {
    return { key, status: 'VALIDLY_COMPLETED', eventsCount: 3 };
  }

  // Any other combination (e.g. {2}, {3}, {1, 3}, {2, 3}) is a gap or illegal prefix -> CORRUPTED
  return {
    key,
    status: 'CORRUPTED_SEQUENCE',
    corruptionReason: `Illegal sequence combination: {${Array.from(seenSequences).sort().join(', ')}}.`,
    eventsCount: events.length,
  };
}

/**
 * Scans all AI_ENGINE ActivityLogs grouped by idempotencyKey.
 * If ANY key has CORRUPTED_SEQUENCE or multiple keys are pending, FAILS CLOSED.
 */
export function auditAllResetOperations(
  records: ActivityLogResetRecord[]
): {
  safeToReconcile: boolean;
  status: 'IDLE' | 'RECOVERY_REQUIRED';
  pendingOperation?: EvaluatedResetOperation;
  diagnosticError?: string;
} {
  const grouped = new Map<string, ActivityLogResetRecord[]>();

  for (const r of records) {
    if (!r.entityId) {
      return {
        safeToReconcile: false,
        status: 'RECOVERY_REQUIRED',
        diagnosticError: `Found reset record with null entityId (id: ${r.id}).`,
      };
    }
    const list = grouped.get(r.entityId) || [];
    list.push(r);
    grouped.set(r.entityId, list);
  }

  let incompleteOp: EvaluatedResetOperation | undefined;

  for (const [key, keyEvents] of grouped.entries()) {
    const evaluated = evaluateEventSequence(key, keyEvents);

    if (evaluated.status === 'CORRUPTED_SEQUENCE') {
      return {
        safeToReconcile: false,
        status: 'RECOVERY_REQUIRED',
        diagnosticError: `Corrupted reset sequence for key [REDACTED]: ${evaluated.corruptionReason}`,
      };
    }

    if (evaluated.status === 'PENDING_ATTEMPTED' || evaluated.status === 'PENDING_AUTHORIZED') {
      if (incompleteOp) {
        return {
          safeToReconcile: false,
          status: 'RECOVERY_REQUIRED',
          diagnosticError: 'Multiple incomplete reset operations detected.',
        };
      }
      incompleteOp = evaluated;
    }
  }

  return {
    safeToReconcile: true,
    status: incompleteOp ? 'RECOVERY_REQUIRED' : 'IDLE',
    pendingOperation: incompleteOp,
  };
}
