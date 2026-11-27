import assert from 'node:assert/strict';
import { buildServer } from '../src/server';
import { AIService } from '../src/modules/ai/ai.service';
import { OllamaClient } from '../src/modules/ai/providers/ollama.client';
import { GenerationMutex } from '../src/modules/ai/generation.mutex';
import { PidLockManager } from '../src/modules/ai/pid.lock';
import { RecoveryMarkerManager } from '../src/modules/ai/recovery.marker';
import { UserRole } from '@prisma/client';
import { prisma } from '../src/db/prisma';

// Mock Ollama Client for deterministic testing
class MockOllamaClient extends OllamaClient {
  public mockResponse = '';
  public mockHealth = true;
  public mockDuration = 100;
  public lastPrompt = '';
  public lastSystem = '';
  public callCount = 0;

  async checkHealth() {
    if (!this.mockHealth) {
      return { online: false, error: 'Mock Ollama is offline' };
    }
    return { online: true, version: '0.3.14-mock' };
  }

  async generateCompletion(options: any): Promise<any> {
    this.callCount++;
    this.lastPrompt = options.prompt;
    this.lastSystem = options.system;

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

async function runM221IntegrationTests() {
  console.log('\n======================================================');
  console.log('  DevPilot M2.2.1: AI Generation & Reset Route Tests');
  console.log('======================================================\n');

  // Claim PID lock for test process
  await PidLockManager.acquireOwnership();
  await RecoveryMarkerManager.purgeAllMarkers();
  GenerationMutex.completeReset();

  const server = buildServer();
  await server.ready();

  const mockClient = new MockOllamaClient();
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
  async function loginAs(email: string, password = ownerPassword): Promise<string> {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: frontendOrigin },
      payload: { email, password },
    });
    assert.equal(res.statusCode, 200, `Login for ${email} should succeed`);
    const cookies = res.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies) ? cookies[0] : (cookies as string);
    return cookieHeader.split(';')[0];
  }

  const ownerCookie = await loginAs(ownerEmail);

  // Helper to create or fetch analyst user for RBAC test
  async function getAnalystCookie(): Promise<string> {
    const analystEmail = 'analyst.ai.test@codeculture.dev';
    let analyst = await prisma.user.findUnique({ where: { email: analystEmail } });
    if (!analyst) {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash(ownerPassword, 10);
      analyst = await prisma.user.create({
        data: {
          name: 'Analyst AI Test',
          email: analystEmail,
          passwordHash: hash,
          role: UserRole.ANALYST,
        },
      });
    }
    return loginAs(analystEmail);
  }

  const analystCookie = await getAnalystCookie();

  // Test 1: Unauthenticated request to /api/v1/ai/status is rejected (401)
  await test('GET /api/v1/ai/status returns 401 for unauthenticated request', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/status',
    });
    assert.equal(res.statusCode, 401);
  });

  // Test 2: Authenticated request to /api/v1/ai/status succeeds
  await test('GET /api/v1/ai/status succeeds with 200 and reports engine status', async () => {
    mockClient.mockHealth = true;
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/status',
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.engineStatus, 'IDLE');
    assert.equal(json.data.model, 'qwen2.5:3b');
  });

  // Test 3: Generate Ideas (200 OK)
  await test('POST /api/v1/ai/generate/ideas generates exactly 3 ideas', async () => {
    mockClient.mockResponse = JSON.stringify({
      ideas: [
        { title: 'Idea 1', concept: 'Concept description for web developers.', suggestedFormat: 'POST', angle: 'Educational' },
        { title: 'Idea 2', concept: 'Concept description for freelance coders.', suggestedFormat: 'CAROUSEL', angle: 'Tips' },
        { title: 'Idea 3', concept: 'Concept description for AI enthusiasts.', suggestedFormat: 'REEL', angle: 'Trends' },
      ],
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/ideas',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { topic: 'Docker containers for beginners', contentType: 'CAROUSEL' },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.ideas.length, 3);
    assert.equal(json.data.ideas[0].title, 'Idea 1');
    assert.ok(mockClient.lastPrompt.includes('Docker containers for beginners'));
  });

  // Test 4: Generate Caption (200 OK)
  await test('POST /api/v1/ai/generate/caption generates structured caption', async () => {
    mockClient.mockResponse = JSON.stringify({
      title: 'Next.js 15 Released',
      hook: 'Stop using deprecated router features.',
      caption: 'Next.js 15 brings powerful caching upgrades and async request updates.',
      cta: 'Bookmark this post for your next project.',
      hashtags: ['#nextjs', '#react', '#webdev'],
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/caption',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { topic: 'Next.js 15 architecture guide' },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.title, 'Next.js 15 Released');
    assert.equal(json.data.hashtags.length, 3);
  });

  // Test 5: Generate Hooks (200 OK)
  await test('POST /api/v1/ai/generate/hooks generates exactly 5 hooks', async () => {
    mockClient.mockResponse = JSON.stringify({
      hooks: ['Hook 1 for devs', 'Hook 2 for devs', 'Hook 3 for devs', 'Hook 4 for devs', 'Hook 5 for devs'],
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/hooks',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { topic: 'Database indexing strategies' },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.hooks.length, 5);
  });

  // Test 6: Generate Hashtags (200 OK)
  await test('POST /api/v1/ai/generate/hashtags outputs between 10 and 25 hashtags', async () => {
    mockClient.mockResponse = JSON.stringify({
      hashtags: ['#code', '#dev', '#webdev', '#ts', '#js', '#react', '#node', '#api', '#fastify', '#clean', '#css', '#html'],
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/hashtags',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { content: 'Clean code architecture and principles' },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.hashtags.length, 12);
  });

  // Test 7: Generate CTA (200 OK)
  await test('POST /api/v1/ai/generate/cta outputs exactly 3 CTAs', async () => {
    mockClient.mockResponse = JSON.stringify({
      ctas: ['Follow CodeCulture for more tips!', 'Comment your favorite framework below.', 'Share this with a fellow dev!'],
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/cta',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { goal: 'Increase follower engagement' },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.ctas.length, 3);
  });

  // Test 8: Generate Rewrite (200 OK)
  await test('POST /api/v1/ai/generate/rewrite rewrites text with target mode', async () => {
    mockClient.mockResponse = JSON.stringify({
      rewrittenText: 'Here is a polished and expanded explanation of microservices architecture.',
      mode: 'EXPAND',
      targetTone: 'professional',
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/rewrite',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { text: 'Microservices break apps into small services.', mode: 'EXPAND' },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.ok(json.data.rewrittenText.includes('polished'));
  });

  // Test 9: RBAC - ANALYST role is rejected on generation (403)
  await test('POST /api/v1/ai/generate/* returns 403 for ANALYST role', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/ideas',
      headers: { cookie: analystCookie, origin: frontendOrigin },
      payload: { topic: 'Analyst attempting generation' },
    });
    assert.equal(res.statusCode, 403);
  });

  // Test 10: Input validation failure (400 Bad Request)
  await test('POST /api/v1/ai/generate/ideas returns 400 when topic is too short', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/ideas',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { topic: 'no' }, // Min 5 chars required
    });
    assert.equal(res.statusCode, 400);
  });

  // Test 11: 1-Shot Bounded Repair on Malformed JSON
  await test('1-Shot repair triggers when initial output is malformed and recovers', async () => {
    // Return invalid JSON on 1st call, valid on 2nd call
    let call = 0;
    mockClient.generateCompletion = async (opts: any) => {
      call++;
      if (call === 1) {
        return { response: 'NOT_JSON_AT_ALL', totalDurationMs: 50 };
      }
      return {
        response: JSON.stringify({
          ctas: ['CTA 1 repaired', 'CTA 2 repaired', 'CTA 3 repaired'],
        }),
        totalDurationMs: 50,
      };
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/cta',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { goal: 'Repair test' },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.ctas[0], 'CTA 1 repaired');
    assert.equal(call, 2, 'Should execute exactly 1 repair attempt (2 total calls)');
  });

  // Test 12: Anti-Fabrication Detection
  await test('Anti-fabrication heuristic detects unsourced percentage and repairs', async () => {
    let call = 0;
    mockClient.generateCompletion = async (opts: any) => {
      call++;
      if (call === 1) {
        // Invented 85% not present in prompt
        return {
          response: JSON.stringify({
            ctas: ['Join now and boost speed by 85%', 'CTA 2', 'CTA 3'],
          }),
          totalDurationMs: 50,
        };
      }
      // Repaired output without invented metrics
      return {
        response: JSON.stringify({
          ctas: ['Join our community today', 'CTA 2', 'CTA 3'],
        }),
        totalDurationMs: 50,
      };
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/cta',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { goal: 'Boost development speed' }, // No 85% in input
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.ctas[0], 'Join our community today');
    assert.equal(call, 2, 'Should trigger repair for unsourced metric');
  });

  // Test 13: Generation Timeout Handling (504 Gateway Timeout)
  await test('Generation timeout marks engine in RECOVERY_REQUIRED and returns 504', async () => {
    GenerationMutex.completeReset();
    mockClient.generateCompletion = async () => {
      throw new Error('OLLAMA_TIMEOUT: CPU inference timed out');
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/ideas',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { topic: 'Timeout test on CPU' },
    });

    assert.equal(res.statusCode, 504);
    assert.equal(GenerationMutex.getStatus(), 'RECOVERY_REQUIRED');
  });

  // Test 14: Engine Reset Route - INFERENCE_SETTLED is rejected as unverifiable
  await test('POST /api/v1/ai/engine/reset rejects INFERENCE_SETTLED because health check cannot prove inference completed', async () => {
    assert.equal(GenerationMutex.getStatus(), 'RECOVERY_REQUIRED');
    await prisma.activityLog.deleteMany({ where: { entityType: 'AI_ENGINE' } });

    const resetKey = crypto.randomUUID();
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/engine/reset',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {
        idempotencyKey: resetKey,
        confirmed: true,
        recoveryCondition: 'INFERENCE_SETTLED',
        operatorNotes: 'Attempting reset with unverifiable condition.',
      },
    });

    assert.equal(res.statusCode, 422);
    const json = JSON.parse(res.payload);
    assert.ok(json.message.includes('Cannot authorize reset with INFERENCE_SETTLED'));
    assert.equal(GenerationMutex.getStatus(), 'RECOVERY_REQUIRED');
  });

  // Test 15: Engine Reset Route - OLLAMA_STOPPED clears recovery state
  await test('POST /api/v1/ai/engine/reset with OLLAMA_STOPPED clears RECOVERY_REQUIRED and transitions to IDLE', async () => {
    assert.equal(GenerationMutex.getStatus(), 'RECOVERY_REQUIRED');
    await prisma.activityLog.deleteMany({ where: { entityType: 'AI_ENGINE' } });

    const resetKey = crypto.randomUUID();
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/engine/reset',
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {
        idempotencyKey: resetKey,
        confirmed: true,
        recoveryCondition: 'OLLAMA_STOPPED',
        operatorNotes: 'Verified via Task Manager that local Ollama process was terminated.',
      },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.status, 'IDLE');
    assert.equal(GenerationMutex.getStatus(), 'IDLE');
  });

  // Test 16: Reset Route RBAC - Non-admin cannot reset (403)
  await test('POST /api/v1/ai/engine/reset returns 403 for non-admin roles', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/engine/reset',
      headers: { cookie: analystCookie, origin: frontendOrigin },
      payload: {
        idempotencyKey: '22222222-2222-2222-2222-222222222222',
        confirmed: true,
        recoveryCondition: 'OLLAMA_STOPPED',
        operatorNotes: 'Unauthorized attempt notes here.',
      },
    });
    assert.equal(res.statusCode, 403);
  });

  // Cleanup
  await PidLockManager.releaseOwnership();
  await server.close();

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runM221IntegrationTests();
