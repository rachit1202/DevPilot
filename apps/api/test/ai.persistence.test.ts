import assert from 'node:assert/strict';
import { buildServer } from '../src/server';
import { AIService } from '../src/modules/ai/ai.service';
import { OllamaClient } from '../src/modules/ai/providers/ollama.client';
import { GenerationMutex } from '../src/modules/ai/generation.mutex';
import { PidLockManager } from '../src/modules/ai/pid.lock';
import { RecoveryMarkerManager } from '../src/modules/ai/recovery.marker';
import { prisma } from '../src/db/prisma';
import { AIGenerationType } from '@prisma/client';

class MockPersistenceOllamaClient extends OllamaClient {
  public mockResponse = '';
  public mockHealth = true;
  public mockDuration = 80;

  async checkHealth() {
    return { online: true, version: '0.3.14-mock' };
  }

  async generateCompletion(options: any): Promise<any> {
    if (this.mockResponse === 'THROW_TIMEOUT') {
      throw new Error('OLLAMA_TIMEOUT: Mock timeout');
    }
    if (this.mockResponse === 'THROW_ERROR') {
      throw new Error('OLLAMA_HTTP_ERROR_500: Server error');
    }

    return {
      response: this.mockResponse,
      totalDurationMs: this.mockDuration,
    };
  }
}

async function runPersistenceTests() {
  console.log('\n======================================================');
  console.log('  DevPilot M2.2.2.1: Generation History Persistence Tests');
  console.log('======================================================\n');

  await PidLockManager.acquireOwnership();
  await RecoveryMarkerManager.purgeAllMarkers();
  GenerationMutex.completeReset();

  const server = buildServer();
  await server.ready();

  const mockClient = new MockPersistenceOllamaClient();
  AIService.setClient(mockClient);

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
      failed++;
    }
  }

  const frontendOrigin = 'http://localhost:3000';
  const ownerEmail = 'admin@codeculture.dev';
  const ownerPassword = process.env.INITIAL_OWNER_PASSWORD || 'ChangeMeInLocalDev123!';

  // Helper to authenticate
  async function loginAsOwner(): Promise<string> {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: frontendOrigin },
      payload: { email: ownerEmail, password: ownerPassword },
    });
    assert.equal(res.statusCode, 200);
    const cookies = res.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies) ? cookies[0] : (cookies as string);
    return cookieHeader.split(';')[0];
  }

  const ownerCookie = await loginAsOwner();
  const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });

  // Clean test history records
  await prisma.generationHistory.deleteMany({ where: { userId: ownerUser.id } });

  // 1. Ideas persistence test
  await test('POST /generate/ideas persists GenerationHistory with AIGenerationType.IDEAS and returns historyId', async () => {
    mockClient.mockResponse = JSON.stringify({
      ideas: [
        { title: 'Idea 1', concept: 'Concept 1 for testing persistence', suggestedFormat: 'POST', angle: 'Educational' },
        { title: 'Idea 2', concept: 'Concept 2 for testing persistence', suggestedFormat: 'CAROUSEL', angle: 'Tips' },
        { title: 'Idea 3', concept: 'Concept 3 for testing persistence', suggestedFormat: 'REEL', angle: 'Trends' },
      ],
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/ideas',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { topic: 'Microservices architecture in Node.js' },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.ok(json.meta.historyId, 'Response meta must include historyId');

    const history = await prisma.generationHistory.findUnique({
      where: { id: json.meta.historyId },
    });
    assert.ok(history, 'GenerationHistory record must exist in database');
    assert.equal(history.generationType, AIGenerationType.IDEAS);
    assert.equal(history.userId, ownerUser.id);
    assert.equal(history.model, 'qwen2.5:3b');
    assert.equal((history.inputPayload as any).topic, 'Microservices architecture in Node.js');
    assert.equal((history.outputPayload as any).ideas.length, 3);
  });

  // 2. Caption persistence test
  await test('POST /generate/caption persists GenerationHistory with AIGenerationType.CAPTION and returns historyId', async () => {
    mockClient.mockResponse = JSON.stringify({
      title: 'Caption Title',
      hook: 'Hook sentence for test.',
      caption: 'Main body caption text for testing.',
      cta: 'Follow for more updates!',
      hashtags: ['#webdev', '#nodejs'],
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/caption',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { topic: 'TypeScript 5.5 Features' },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.ok(json.meta.historyId);

    const history = await prisma.generationHistory.findUnique({
      where: { id: json.meta.historyId },
    });
    assert.ok(history);
    assert.equal(history.generationType, AIGenerationType.CAPTION);
    assert.equal((history.outputPayload as any).title, 'Caption Title');
  });

  // 3. Hooks persistence test
  await test('POST /generate/hooks persists GenerationHistory with AIGenerationType.HOOKS', async () => {
    mockClient.mockResponse = JSON.stringify({
      hooks: ['Hook 1', 'Hook 2', 'Hook 3', 'Hook 4', 'Hook 5'],
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/hooks',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { topic: 'PostgreSQL Indexing' },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.ok(json.meta.historyId);

    const history = await prisma.generationHistory.findUnique({
      where: { id: json.meta.historyId },
    });
    assert.ok(history);
    assert.equal(history.generationType, AIGenerationType.HOOKS);
    assert.equal((history.outputPayload as any).hooks.length, 5);
  });

  // 4. Hashtags persistence test
  await test('POST /generate/hashtags persists GenerationHistory with AIGenerationType.HASHTAGS', async () => {
    mockClient.mockResponse = JSON.stringify({
      hashtags: ['#ts', '#js', '#dev', '#coding', '#web', '#node', '#api', '#fastify', '#clean', '#architecture', '#db', '#sql'],
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/hashtags',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { content: 'Clean code architecture' },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.ok(json.meta.historyId);

    const history = await prisma.generationHistory.findUnique({
      where: { id: json.meta.historyId },
    });
    assert.ok(history);
    assert.equal(history.generationType, AIGenerationType.HASHTAGS);
    assert.equal((history.outputPayload as any).hashtags.length, 12);
  });

  // 5. CTA persistence test
  await test('POST /generate/cta persists GenerationHistory with AIGenerationType.CTA', async () => {
    mockClient.mockResponse = JSON.stringify({
      ctas: ['CTA 1', 'CTA 2', 'CTA 3'],
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/cta',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { goal: 'Increase engagement' },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.ok(json.meta.historyId);

    const history = await prisma.generationHistory.findUnique({
      where: { id: json.meta.historyId },
    });
    assert.ok(history);
    assert.equal(history.generationType, AIGenerationType.CTA);
    assert.equal((history.outputPayload as any).ctas.length, 3);
  });

  // 6. Rewrite persistence test
  await test('POST /generate/rewrite persists GenerationHistory with AIGenerationType.REWRITE', async () => {
    mockClient.mockResponse = JSON.stringify({
      rewrittenText: 'Polished developer text for rewrite testing.',
      mode: 'REWRITE',
      targetTone: 'engaging',
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/rewrite',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { text: 'Initial developer text to be rewritten.' },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.ok(json.meta.historyId);

    const history = await prisma.generationHistory.findUnique({
      where: { id: json.meta.historyId },
    });
    assert.ok(history);
    assert.equal(history.generationType, AIGenerationType.REWRITE);
    assert.equal((history.outputPayload as any).rewrittenText, 'Polished developer text for rewrite testing.');
  });

  // 7. Failed inference does not create history
  await test('Failed inference (timeout/504) does not create GenerationHistory record', async () => {
    const countBefore = await prisma.generationHistory.count({ where: { userId: ownerUser.id } });
    mockClient.mockResponse = 'THROW_TIMEOUT';

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/ideas',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { topic: 'Testing failed inference timeout' },
    });

    assert.equal(res.statusCode, 504);
    const countAfter = await prisma.generationHistory.count({ where: { userId: ownerUser.id } });
    assert.equal(countAfter, countBefore, 'No history record should be created on inference failure');

    // Reset mutex back to IDLE for next tests
    GenerationMutex.completeReset();
  });

  // 8. Invalid output does not create history
  await test('Invalid output (unfixable malformed) does not create GenerationHistory record', async () => {
    const countBefore = await prisma.generationHistory.count({ where: { userId: ownerUser.id } });
    mockClient.mockResponse = 'DEFINITELY_NOT_VALID_JSON';

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/cta',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { goal: 'Testing malformed output rejection' },
    });

    assert.equal(res.statusCode, 502);
    const countAfter = await prisma.generationHistory.count({ where: { userId: ownerUser.id } });
    assert.equal(countAfter, countBefore, 'No history record should be created on malformed output');

    GenerationMutex.completeReset();
  });

  // 9. Database persistence failure returns 500 HISTORY_PERSISTENCE_FAILED & does not lock mutex
  await test('Database persistence failure returns 500 HISTORY_PERSISTENCE_FAILED, discards output, leaves engine IDLE', async () => {
    mockClient.mockResponse = JSON.stringify({
      ctas: ['CTA 1', 'CTA 2', 'CTA 3'],
    });

    // Mock prisma.generationHistory.create to throw
    const originalCreate = prisma.generationHistory.create;
    (prisma.generationHistory as any).create = async () => {
      throw new Error('Simulated PostgreSQL connection failure');
    };

    try {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/ai/generate/cta',
        headers: { cookie: ownerCookie, origin: frontendOrigin },
        payload: { goal: 'Testing persistence failure contract' },
      });

      assert.equal(res.statusCode, 500);
      const json = JSON.parse(res.payload);
      assert.equal(json.code, 'HISTORY_PERSISTENCE_FAILED');
      assert.equal(json.message, 'AI generation succeeded but output history could not be persisted. Output discarded.');
      assert.equal(json.data, undefined, 'Must not return generated data on persistence failure');
      assert.equal(json.meta, undefined, 'Must not return meta/historyId on persistence failure');

      // Engine mutex must be IDLE (not RECOVERY_REQUIRED)
      assert.equal(GenerationMutex.getStatus(), 'IDLE');
    } finally {
      // Restore original create
      (prisma.generationHistory as any).create = originalCreate;
    }
  });

  // 10. Subsequent generation executes normally after persistence failure
  await test('Engine executes subsequent generation request normally after persistence failure', async () => {
    assert.equal(GenerationMutex.getStatus(), 'IDLE');
    mockClient.mockResponse = JSON.stringify({
      ctas: ['Normal CTA 1', 'Normal CTA 2', 'Normal CTA 3'],
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/cta',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { goal: 'Normal goal after recovery' },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.ok(json.meta.historyId);
    assert.equal(GenerationMutex.getStatus(), 'IDLE');
  });

  // Cleanup
  await PidLockManager.releaseOwnership();
  await server.close();

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runPersistenceTests();
