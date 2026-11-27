import assert from 'node:assert/strict';
import { evaluateEventSequence, auditAllResetOperations, ActivityLogResetRecord } from '../src/modules/ai/reset.validator';

async function runResetValidatorUnitTests() {
  console.log('\n======================================================');
  console.log('  M2.2.1 Unit Tests: Reset Event Sequence Validator');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  const key1 = '00000000-0000-0000-0000-000000000001';

  // 1. Valid Sequences & Prefixes
  test('Valid Full Sequence [1, 2, 3] evaluates to VALIDLY_COMPLETED', () => {
    const events: ActivityLogResetRecord[] = [
      { id: '1', entityId: key1, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: { sequence: 1 }, createdAt: new Date() },
      { id: '2', entityId: key1, action: 'AI_ENGINE_RESET_AUTHORIZED', metadata: { sequence: 2 }, createdAt: new Date() },
      { id: '3', entityId: key1, action: 'AI_ENGINE_RESET_COMPLETED', metadata: { sequence: 3 }, createdAt: new Date() },
    ];
    const res = evaluateEventSequence(key1, events);
    assert.equal(res.status, 'VALIDLY_COMPLETED');
  });

  test('Valid Permutations [3, 1, 2] and [2, 3, 1] evaluate to VALIDLY_COMPLETED', () => {
    const eventsPerm1: ActivityLogResetRecord[] = [
      { id: '3', entityId: key1, action: 'AI_ENGINE_RESET_COMPLETED', metadata: { sequence: 3 }, createdAt: new Date() },
      { id: '1', entityId: key1, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: { sequence: 1 }, createdAt: new Date() },
      { id: '2', entityId: key1, action: 'AI_ENGINE_RESET_AUTHORIZED', metadata: { sequence: 2 }, createdAt: new Date() },
    ];
    assert.equal(evaluateEventSequence(key1, eventsPerm1).status, 'VALIDLY_COMPLETED');

    const eventsPerm2: ActivityLogResetRecord[] = [
      { id: '2', entityId: key1, action: 'AI_ENGINE_RESET_AUTHORIZED', metadata: { sequence: 2 }, createdAt: new Date() },
      { id: '3', entityId: key1, action: 'AI_ENGINE_RESET_COMPLETED', metadata: { sequence: 3 }, createdAt: new Date() },
      { id: '1', entityId: key1, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: { sequence: 1 }, createdAt: new Date() },
    ];
    assert.equal(evaluateEventSequence(key1, eventsPerm2).status, 'VALIDLY_COMPLETED');
  });

  test('Valid Prefix 1 [ATTEMPTED] evaluates to PENDING_ATTEMPTED', () => {
    const events: ActivityLogResetRecord[] = [
      { id: '1', entityId: key1, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: { sequence: 1 }, createdAt: new Date() },
    ];
    assert.equal(evaluateEventSequence(key1, events).status, 'PENDING_ATTEMPTED');
  });

  test('Valid Prefix 2 [ATTEMPTED, AUTHORIZED] in any order evaluates to PENDING_AUTHORIZED', () => {
    const events: ActivityLogResetRecord[] = [
      { id: '2', entityId: key1, action: 'AI_ENGINE_RESET_AUTHORIZED', metadata: { sequence: 2, condition: 'INFERENCE_SETTLED' }, createdAt: new Date() },
      { id: '1', entityId: key1, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: { sequence: 1 }, createdAt: new Date() },
    ];
    const res = evaluateEventSequence(key1, events);
    assert.equal(res.status, 'PENDING_AUTHORIZED');
    assert.equal((res.authorizedPayload as any)?.condition, 'INFERENCE_SETTLED');
  });

  // 2. Corrupted Sequences
  test('Missing stage 1 [AUTHORIZED, COMPLETED] evaluates to CORRUPTED_SEQUENCE', () => {
    const events: ActivityLogResetRecord[] = [
      { id: '2', entityId: key1, action: 'AI_ENGINE_RESET_AUTHORIZED', metadata: { sequence: 2 }, createdAt: new Date() },
      { id: '3', entityId: key1, action: 'AI_ENGINE_RESET_COMPLETED', metadata: { sequence: 3 }, createdAt: new Date() },
    ];
    assert.equal(evaluateEventSequence(key1, events).status, 'CORRUPTED_SEQUENCE');
  });

  test('Sequence gap [ATTEMPTED, COMPLETED] evaluates to CORRUPTED_SEQUENCE', () => {
    const events: ActivityLogResetRecord[] = [
      { id: '1', entityId: key1, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: { sequence: 1 }, createdAt: new Date() },
      { id: '3', entityId: key1, action: 'AI_ENGINE_RESET_COMPLETED', metadata: { sequence: 3 }, createdAt: new Date() },
    ];
    assert.equal(evaluateEventSequence(key1, events).status, 'CORRUPTED_SEQUENCE');
  });

  test('Duplicate sequence numbers evaluates to CORRUPTED_SEQUENCE', () => {
    const events: ActivityLogResetRecord[] = [
      { id: '1', entityId: key1, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: { sequence: 1 }, createdAt: new Date() },
      { id: '2', entityId: key1, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: { sequence: 1 }, createdAt: new Date() },
    ];
    assert.equal(evaluateEventSequence(key1, events).status, 'CORRUPTED_SEQUENCE');
  });

  test('Action/sequence mismatch evaluates to CORRUPTED_SEQUENCE', () => {
    const events: ActivityLogResetRecord[] = [
      { id: '1', entityId: key1, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: { sequence: 2 }, createdAt: new Date() },
    ];
    assert.equal(evaluateEventSequence(key1, events).status, 'CORRUPTED_SEQUENCE');
  });

  test('Missing or non-integer sequence metadata evaluates to CORRUPTED_SEQUENCE', () => {
    const eventsString: ActivityLogResetRecord[] = [
      { id: '1', entityId: key1, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: { sequence: '1' }, createdAt: new Date() },
    ];
    assert.equal(evaluateEventSequence(key1, eventsString).status, 'CORRUPTED_SEQUENCE');

    const eventsMissing: ActivityLogResetRecord[] = [
      { id: '1', entityId: key1, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: {}, createdAt: new Date() },
    ];
    assert.equal(evaluateEventSequence(key1, eventsMissing).status, 'CORRUPTED_SEQUENCE');
  });

  test('Unknown action with AI_ENGINE_RESET_ prefix evaluates to CORRUPTED_SEQUENCE', () => {
    const events: ActivityLogResetRecord[] = [
      { id: '1', entityId: key1, action: 'AI_ENGINE_RESET_MALFORMED', metadata: { sequence: 1 }, createdAt: new Date() },
    ];
    assert.equal(evaluateEventSequence(key1, events).status, 'CORRUPTED_SEQUENCE');
  });

  test('Excess events (>3) evaluates to CORRUPTED_SEQUENCE', () => {
    const events: ActivityLogResetRecord[] = [
      { id: '1', entityId: key1, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: { sequence: 1 }, createdAt: new Date() },
      { id: '2', entityId: key1, action: 'AI_ENGINE_RESET_AUTHORIZED', metadata: { sequence: 2 }, createdAt: new Date() },
      { id: '3', entityId: key1, action: 'AI_ENGINE_RESET_COMPLETED', metadata: { sequence: 3 }, createdAt: new Date() },
      { id: '4', entityId: key1, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: { sequence: 1 }, createdAt: new Date() },
    ];
    assert.equal(evaluateEventSequence(key1, events).status, 'CORRUPTED_SEQUENCE');
  });

  // 3. Global Audit Scanner
  test('auditAllResetOperations fails closed when multiple pending resets exist', () => {
    const key2 = '00000000-0000-0000-0000-000000000002';
    const records: ActivityLogResetRecord[] = [
      { id: '1', entityId: key1, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: { sequence: 1 }, createdAt: new Date() },
      { id: '2', entityId: key2, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: { sequence: 1 }, createdAt: new Date() },
    ];
    const audit = auditAllResetOperations(records);
    assert.equal(audit.safeToReconcile, false);
    assert.equal(audit.status, 'RECOVERY_REQUIRED');
  });

  test('auditAllResetOperations fails closed when ANY key has corrupted sequence', () => {
    const key2 = '00000000-0000-0000-0000-000000000002';
    const records: ActivityLogResetRecord[] = [
      // key1 valid completed
      { id: '1', entityId: key1, action: 'AI_ENGINE_RESET_ATTEMPTED', metadata: { sequence: 1 }, createdAt: new Date() },
      { id: '2', entityId: key1, action: 'AI_ENGINE_RESET_AUTHORIZED', metadata: { sequence: 2 }, createdAt: new Date() },
      { id: '3', entityId: key1, action: 'AI_ENGINE_RESET_COMPLETED', metadata: { sequence: 3 }, createdAt: new Date() },
      // key2 corrupted sequence
      { id: '4', entityId: key2, action: 'AI_ENGINE_RESET_COMPLETED', metadata: { sequence: 3 }, createdAt: new Date() },
    ];
    const audit = auditAllResetOperations(records);
    assert.equal(audit.safeToReconcile, false);
    assert.equal(audit.status, 'RECOVERY_REQUIRED');
    assert.ok(audit.diagnosticError?.includes('Corrupted reset sequence'));
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runResetValidatorUnitTests();
