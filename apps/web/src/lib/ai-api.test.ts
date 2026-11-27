import assert from 'node:assert/strict';
import {
  getAIStatus,
  AIStatusData,
  AIStatusResponse,
  generateIdeas,
  generateCaption,
  generateHooks,
  generateHashtags,
  generateCta,
  generateRewrite,
  getAIHistory,
  getAIHistoryItem,
  deleteAIHistoryItem,
  saveToDraft,
} from './ai-api';
import { ApiError } from './api';

async function runAIClientTests() {
  console.log('\n======================================================');
  console.log('  DevPilot M2.2.2.4.1: AI Client & Banner Logic Tests ');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Error: ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  // Preserve global fetch
  const originalFetch = global.fetch;

  // 1. Successful online status response
  await test('1. Successful online status response returns typed AIStatusData', async () => {
    const mockData: AIStatusData = {
      provider: 'ollama',
      model: 'qwen2.5:3b',
      online: true,
      version: '0.3.14',
      engineStatus: 'IDLE',
      isEngineOwner: true,
      lockReason: null,
    };

    global.fetch = async (url: any) => {
      assert.ok(String(url).endsWith('/ai/status'));
      return {
        ok: true,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
        },
        json: async () => ({ success: true, data: mockData }),
      } as any;
    };

    const res = await getAIStatus();
    assert.equal(res.success, true);
    assert.equal(res.data.online, true);
    assert.equal(res.data.engineStatus, 'IDLE');
    assert.equal(res.data.model, 'qwen2.5:3b');
    assert.equal(res.data.provider, 'ollama');
  });

  // 2. Engine GENERATING state
  await test('2. Engine GENERATING state parses correctly', async () => {
    const mockData: AIStatusData = {
      provider: 'ollama',
      model: 'qwen2.5:3b',
      online: true,
      version: '0.3.14',
      engineStatus: 'GENERATING',
      isEngineOwner: true,
      lockReason: null,
    };

    global.fetch = async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: mockData }),
    } as any);

    const res = await getAIStatus();
    assert.equal(res.data.engineStatus, 'GENERATING');
  });

  // 3. Engine RECOVERY_REQUIRED state
  await test('3. Engine RECOVERY_REQUIRED state contains lockReason', async () => {
    const mockData: AIStatusData = {
      provider: 'ollama',
      model: 'qwen2.5:3b',
      online: true,
      version: '0.3.14',
      engineStatus: 'RECOVERY_REQUIRED',
      isEngineOwner: true,
      lockReason: 'Inference aborted. Administrator recovery required.',
    };

    global.fetch = async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: mockData }),
    } as any);

    const res = await getAIStatus();
    assert.equal(res.data.engineStatus, 'RECOVERY_REQUIRED');
    assert.equal(res.data.lockReason, 'Inference aborted. Administrator recovery required.');
  });

  // 4. Offline/unavailable status
  await test('4. Offline status reports online: false safely', async () => {
    const mockData: AIStatusData = {
      provider: 'ollama',
      model: 'qwen2.5:3b',
      online: false,
      version: null,
      engineStatus: 'IDLE',
      isEngineOwner: false,
      lockReason: null,
    };

    global.fetch = async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: mockData }),
    } as any);

    const res = await getAIStatus();
    assert.equal(res.data.online, false);
  });

  // 5. API failure throws ApiError with proper status
  await test('5. Backend 500 error throws ApiError without uncaught crash', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 500,
      headers: { get: () => 'application/json' },
      json: async () => ({ message: 'Internal Server Error' }),
    } as any);

    await assert.rejects(
      async () => {
        await getAIStatus();
      },
      (err: any) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 500);
        assert.equal(err.message, 'Internal Server Error');
        return true;
      }
    );
  });

  // 6. Network failure throws ApiError with status 0
  await test('6. Network timeout/disconnect throws ApiError with status 0', async () => {
    global.fetch = async () => {
      throw new Error('Failed to fetch');
    };

    await assert.rejects(
      async () => {
        await getAIStatus();
      },
      (err: any) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 0);
        assert.equal(err.message, 'Failed to fetch');
        return true;
      }
    );
  });

  // 7. Concurrency guard logic
  await test('7. Client wrapper sends credentials: include on requests', async () => {
    let capturedOptions: any = null;
    global.fetch = async (_url: any, opts: any) => {
      capturedOptions = opts;
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true, data: {} }),
      } as any;
    };

    await getAIStatus();
    assert.equal(capturedOptions.credentials, 'include');
  });

  // 8. Correct configured model display in payload
  await test('8. Correct model name and version are preserved in output', async () => {
    const mockData: AIStatusData = {
      provider: 'ollama',
      model: 'deepseek-r1:1.5b',
      online: true,
      version: '0.4.1',
      engineStatus: 'IDLE',
      isEngineOwner: true,
      lockReason: null,
    };

    global.fetch = async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: mockData }),
    } as any);

    const res = await getAIStatus();
    assert.equal(res.data.model, 'deepseek-r1:1.5b');
    assert.equal(res.data.version, '0.4.1');
  });

  // 9. History query serializer
  await test('9. getAIHistory correctly encodes query parameters', async () => {
    let capturedUrl = '';
    global.fetch = async (url: any) => {
      capturedUrl = String(url);
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true, data: [], pagination: {} }),
      } as any;
    };

    await getAIHistory({
      page: 2,
      limit: 20,
      generationType: 'CAPTION',
      allUsers: true,
    });

    assert.ok(capturedUrl.includes('page=2'));
    assert.ok(capturedUrl.includes('limit=20'));
    assert.ok(capturedUrl.includes('generationType=CAPTION'));
    assert.ok(capturedUrl.includes('allUsers=true'));
  });

  // 10. saveToDraft endpoint serialization
  await test('10. saveToDraft invokes correct endpoint with body payload', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    global.fetch = async (url: any, opts: any) => {
      capturedUrl = String(url);
      capturedBody = opts.body;
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true, data: {} }),
      } as any;
    };

    const targetId = '123e4567-e89b-12d3-a456-426614174000';
    await saveToDraft(targetId, {
      selectedIdeaIndex: 1,
    });

    assert.ok(capturedUrl.endsWith(`/ai/history/${targetId}/save-to-draft`));
    assert.deepEqual(JSON.parse(capturedBody), { selectedIdeaIndex: 1 });
  });

  // Restore fetch
  global.fetch = originalFetch;

  console.log('\n======================================================');
  console.log(`  API Client Tests completed: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  // Run M2.2.2.4.2 Studio Generation & Gating Tests
  const { runAIStudioTests } = await import('../components/studio/ai-studio.test');
  const studioResults = await runAIStudioTests();

  const totalPassed = passed + studioResults.passed;
  const totalFailed = failed + studioResults.failed;

  console.log('======================================================');
  console.log(`  Overall Web Tests: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('======================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runAIClientTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
