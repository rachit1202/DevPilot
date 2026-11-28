import assert from 'node:assert/strict';
import net from 'node:net';
import cp from 'node:child_process';
import { GenerationMutex } from '../src/modules/ai/generation.mutex';
import { RecoveryMarkerManager } from '../src/modules/ai/recovery.marker';
import { ResetMutex } from '../src/modules/ai/reset.mutex';
import { PidLockManager } from '../src/modules/ai/pid.lock';
import { getCanonicalStorageDir } from '../src/modules/ai/storage.util';

async function runMutexUnitTests() {
  console.log('\n======================================================');
  console.log('  M2.3.5.2.11.1 Unit Tests: Kernel Socket Ownership & Mutex');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Storage resolution test
  await test('Canonical storage dir resolves deterministically', async () => {
    const dir = getCanonicalStorageDir();
    assert.ok(dir.endsWith('storage'), `Storage dir should end with storage: ${dir}`);
    assert.ok(!dir.includes('apps\\storage'), `Storage dir should not be in apps/storage: ${dir}`);
  });

  // Acquire kernel socket ownership for test process
  await PidLockManager.acquireOwnership();
  assert.equal(PidLockManager.isEngineOwner(), true, 'Test process should acquire socket ownership');
  assert.ok(PidLockManager.getOwnerToken(), 'Test process should have non-null ownerToken');

  // Verify second bind collision returns EADDRINUSE conflict
  await test('Second concurrent process / bind attempt receives ownership conflict', async () => {
    // Attempt raw bind on the same AI_LOCK_PORT
    await new Promise<void>((resolve, reject) => {
      const s = net.createServer();
      s.on('error', (err: any) => {
        try {
          assert.equal(err.code, 'EADDRINUSE');
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      s.listen(54321, '127.0.0.1', () => {
        s.close();
        reject(new Error('Second server should not have bound'));
      });
    });
  });

  // Verify child-process abrupt termination releases port immediately
  await test('Abrupt child-process termination releases port automatically', async () => {
    const testPort = 54329;
    const child = cp.spawn(process.execPath, [
      '-e',
      `const net = require("net"); const s = net.createServer().listen(${testPort}, "127.0.0.1", () => console.log("CHILD_BOUND"));`
    ], { stdio: ['inherit', 'pipe', 'inherit'] });

    await new Promise<void>((resolve, reject) => {
      child.stdout.on('data', async (d) => {
        if (d.toString().includes('CHILD_BOUND')) {
          // Verify port is occupied
          const s = net.createServer();
          s.on('error', (err: any) => {
            assert.equal(err.code, 'EADDRINUSE');
            // Abruptly kill child
            child.kill('SIGKILL');
            
            // Give kernel a brief tick to close fd
            setTimeout(async () => {
              try {
                const s2 = net.createServer();
                await new Promise<void>((res2, rej2) => {
                  s2.on('error', rej2);
                  s2.listen(testPort, '127.0.0.1', () => {
                    s2.close(() => res2());
                  });
                });
                resolve();
              } catch (e) {
                reject(e);
              }
            }, 50);
          });
          s.listen(testPort, '127.0.0.1');
        }
      });
    });
  });

  // Clean any markers before testing
  await RecoveryMarkerManager.purgeAllMarkers();

  // 2. Generation Mutex Synchronous Claim & Concurrency
  await test('First generation claims lock, second concurrent claim receives AI_BUSY', async () => {
    // Force mutex into IDLE
    GenerationMutex.completeReset();
    assert.equal(GenerationMutex.getStatus(), 'IDLE');

    const claim1 = GenerationMutex.claim();
    assert.equal(claim1.acquired, true);
    assert.ok(claim1.taskId);
    assert.equal(GenerationMutex.getStatus(), 'GENERATING');

    // Second claim must be rejected immediately
    const claim2 = GenerationMutex.claim();
    assert.equal(claim2.acquired, false);
    assert.equal(claim2.reason, 'AI_BUSY');
    assert.equal(claim2.retryAfter, 30);

    // Stale task cannot release the lock
    await GenerationMutex.release('wrong-task-id');
    assert.equal(GenerationMutex.getStatus(), 'GENERATING');

    // Correct task releases lock
    await GenerationMutex.release(claim1.taskId!);
    assert.equal(GenerationMutex.getStatus(), 'IDLE');
  });

  // 3. Pre-Inference Marker Persistence
  await test('Pre-inference marker is persisted and removed on normal completion', async () => {
    GenerationMutex.completeReset();
    const claim = GenerationMutex.claim();
    assert.equal(claim.acquired, true);

    await GenerationMutex.persistPreInferenceMarker(claim.taskId!, 'qwen2.5:3b');
    const scan = await RecoveryMarkerManager.scanForRecoveryMarkers();
    assert.equal(scan.hasMarkers, true);
    assert.ok(scan.details.includes('ai-recovery.lock'));

    await GenerationMutex.release(claim.taskId!);
    assert.equal(GenerationMutex.getStatus(), 'IDLE');

    const scanAfter = await RecoveryMarkerManager.scanForRecoveryMarkers();
    assert.equal(scanAfter.hasMarkers, false);
  });

  // 4. Timeout transitions to RECOVERY_REQUIRED
  await test('Generation timeout transitions engine to RECOVERY_REQUIRED', async () => {
    GenerationMutex.completeReset();
    const claim = GenerationMutex.claim();
    assert.equal(claim.acquired, true);

    GenerationMutex.markRecoveryRequired(claim.taskId!, 'Inference timeout on CPU');
    assert.equal(GenerationMutex.getStatus(), 'RECOVERY_REQUIRED');

    // Subsequent claim rejected with AI_RECOVERY_REQUIRED
    const claimAfter = GenerationMutex.claim();
    assert.equal(claimAfter.acquired, false);
    assert.equal(claimAfter.reason, 'AI_RECOVERY_REQUIRED');

    GenerationMutex.completeReset();
  });

  // 5. Reset Mutex Concurrency
  await test('ResetMutex serializes concurrent reset requests', async () => {
    const key1 = '00000000-0000-0000-0000-000000000001';
    const key2 = '00000000-0000-0000-0000-000000000002';

    const claim1 = ResetMutex.claim(key1);
    assert.equal(claim1.acquired, true);

    // Same key concurrent request
    const claimSame = ResetMutex.claim(key1);
    assert.equal(claimSame.acquired, false);
    assert.equal(claimSame.reason, 'CONCURRENT_SAME_KEY_IN_PROGRESS');

    // Different key concurrent request
    const claimDiff = ResetMutex.claim(key2);
    assert.equal(claimDiff.acquired, false);
    assert.equal(claimDiff.reason, 'CONCURRENT_RESET_IN_PROGRESS');

    ResetMutex.release(key1);
    assert.equal(ResetMutex.getActiveKey(), null);

    const claimAfter = ResetMutex.claim(key2);
    assert.equal(claimAfter.acquired, true);
    ResetMutex.release(key2);
  });

  // Release socket ownership on finish
  await PidLockManager.releaseOwnership();
  assert.equal(PidLockManager.isEngineOwner(), false, 'Ownership should be false after release');

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runMutexUnitTests();
