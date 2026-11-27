import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildServer } from '../src/server';
import { AIService } from '../src/modules/ai/ai.service';
import { OllamaClient } from '../src/modules/ai/providers/ollama.client';
import { GenerationMutex } from '../src/modules/ai/generation.mutex';
import { PidLockManager } from '../src/modules/ai/pid.lock';
import { RecoveryMarkerManager } from '../src/modules/ai/recovery.marker';
import { AI_PID_LOCK_PATH } from '../src/modules/ai/storage.util';
import { UserRole, AIGenerationType } from '@prisma/client';
import { prisma } from '../src/db/prisma';
import bcrypt from 'bcryptjs';
import {
  generateCarouselInputSchema,
  carouselOutputSchema,
  CarouselOutput,
} from '@devpilot/validation';

// Mock Ollama Client for deterministic Carousel testing
class MockCarouselOllamaClient extends OllamaClient {
  public mockResponse = '';
  public mockHealth = true;
  public mockDuration = 120;
  public lastPrompt = '';
  public lastSystem = '';
  public callCount = 0;

  async checkHealth() {
    if (!this.mockHealth) {
      return { online: false, error: 'Mock Ollama is offline' };
    }
    return { online: true, version: '0.40.18-mock' };
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

function createValidCarouselJson(slideCount = 7): string {
  const slides = [];
  // Slide 1: Cover
  slides.push({
    slideNumber: 1,
    slideType: 'COVER',
    title: 'Mastering TypeScript Generics in 2026',
    content: 'Stop using `any` and build rock-solid, reusable type architectures.',
    visualDirection: 'Bold purple gradient card with glowing code icon',
    hook: 'Still writing `as any` in your TypeScript code? Here is how to fix it forever.',
  });

  // Body slides
  for (let i = 2; i < slideCount; i++) {
    slides.push({
      slideNumber: i,
      slideType: 'BODY',
      title: `Step ${i - 1}: Generic Constraints & Inference`,
      content: `Use 'extends' to constrain your generic parameters to predictable object shapes.`,
      visualDirection: 'Side-by-side syntax comparison with green checkmark for correct pattern',
    });
  }

  // Final Slide: CTA
  slides.push({
    slideNumber: slideCount,
    slideType: 'CTA',
    title: 'Summary & Next Steps',
    content: 'Generics make your code type-safe and self-documenting. Try replacing your first `any` today.',
    visualDirection: 'Summary checklist card with CodeCulture follow prompt',
    cta: 'Save this post for your next refactor & follow @CodeCulture for daily web dev insights.',
  });

  return JSON.stringify({
    title: 'Mastering TypeScript Generics',
    topic: 'TypeScript generic constraints and advanced utility types',
    targetAudience: 'Intermediate TypeScript developers',
    slides,
  });
}

async function runCarouselTests() {
  console.log('\n======================================================');
  console.log('  DevPilot M2.3.1: Carousel Outline Generator Tests  ');
  console.log('======================================================\n');

  // Claim PID lock for test process (clean up stale lock from dead process if present)
  if (fs.existsSync(AI_PID_LOCK_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(AI_PID_LOCK_PATH, 'utf8'));
      let isAlive = false;
      try {
        process.kill(existing.pid, 0);
        isAlive = true;
      } catch {
        isAlive = false;
      }
      if (!isAlive) {
        fs.unlinkSync(AI_PID_LOCK_PATH);
      }
    } catch {
      fs.unlinkSync(AI_PID_LOCK_PATH);
    }
  }

  const claimResult = await PidLockManager.acquireOwnership();
  assert.equal(claimResult.acquired, true, 'Test process must acquire PID lock');
  await RecoveryMarkerManager.purgeAllMarkers();
  GenerationMutex.completeReset();

  const server = buildServer();
  await server.ready();

  const mockClient = new MockCarouselOllamaClient();
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
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  const frontendOrigin = 'http://localhost:3000';
  const defaultPassword = 'TestPassword123!';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  async function ensureUser(email: string, name: string, role: UserRole) {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, name, passwordHash, role },
      });
    }
    return user;
  }

  const owner = await ensureUser('owner.carousel@codeculture.dev', 'Carousel Owner', UserRole.OWNER);
  const admin = await ensureUser('admin.carousel@codeculture.dev', 'Carousel Admin', UserRole.ADMIN);
  const editor = await ensureUser('editor.carousel@codeculture.dev', 'Carousel Editor', UserRole.EDITOR);
  const approver = await ensureUser('approver.carousel@codeculture.dev', 'Carousel Approver', UserRole.APPROVER);
  const analyst = await ensureUser('analyst.carousel@codeculture.dev', 'Carousel Analyst', UserRole.ANALYST);

  async function loginAs(email: string): Promise<string> {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: frontendOrigin },
      payload: { email, password: defaultPassword },
    });
    assert.equal(res.statusCode, 200, `Login for ${email} should succeed`);
    const cookies = res.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies) ? cookies[0] : (cookies as string);
    return cookieHeader.split(';')[0];
  }

  const ownerCookie = await loginAs(owner.email);
  const adminCookie = await loginAs(admin.email);
  const editorCookie = await loginAs(editor.email);
  const approverCookie = await loginAs(approver.email);
  const analystCookie = await loginAs(analyst.email);

  // 1. INPUT SCHEMA VALIDATION TESTS
  await test('1. Input schema validates valid payload and defaults slidesCount to 7', async () => {
    const parsed = generateCarouselInputSchema.parse({
      topic: 'How to build scalable microservices in Node.js',
    });
    assert.equal(parsed.topic, 'How to build scalable microservices in Node.js');
    assert.equal(parsed.slidesCount, 7);
  });

  await test('2. Input schema rejects topic shorter than 5 characters', async () => {
    assert.throws(
      () => generateCarouselInputSchema.parse({ topic: 'Tiny' }),
      (err: any) => err.errors.some((e: any) => e.message.includes('at least 5 characters'))
    );
  });

  await test('3. Input schema rejects topic longer than 500 characters', async () => {
    assert.throws(
      () => generateCarouselInputSchema.parse({ topic: 'A'.repeat(501) }),
      (err: any) => err.errors.some((e: any) => e.message.includes('not exceed 500 characters'))
    );
  });

  await test('4. Input schema accepts slideCount exact bounds (5 and 10)', async () => {
    const minParsed = generateCarouselInputSchema.parse({ topic: 'Valid topic', slidesCount: 5 });
    assert.equal(minParsed.slidesCount, 5);

    const maxParsed = generateCarouselInputSchema.parse({ topic: 'Valid topic', slidesCount: 10 });
    assert.equal(maxParsed.slidesCount, 10);
  });

  await test('5. Input schema rejects slideCount < 5 or > 10', async () => {
    assert.throws(() => generateCarouselInputSchema.parse({ topic: 'Valid topic', slidesCount: 4 }));
    assert.throws(() => generateCarouselInputSchema.parse({ topic: 'Valid topic', slidesCount: 11 }));
  });

  await test('6. Input schema accepts optional targetAudience, tone, and additionalInstructions', async () => {
    const parsed = generateCarouselInputSchema.parse({
      topic: 'React 19 Server Components',
      tone: 'Conversational, witty',
      slidesCount: 8,
      targetAudience: 'Senior Frontend Engineers',
      additionalInstructions: 'Include code snippet recommendations',
    });
    assert.equal(parsed.targetAudience, 'Senior Frontend Engineers');
    assert.equal(parsed.slidesCount, 8);
    assert.equal(parsed.tone, 'Conversational, witty');
  });

  // 2. OUTPUT SCHEMA VALIDATION TESTS
  await test('7. Output schema accepts valid 7-slide carousel structure', async () => {
    const json = JSON.parse(createValidCarouselJson(7));
    const validated = carouselOutputSchema.parse(json);
    assert.equal(validated.slides.length, 7);
    assert.equal(validated.slides[0].slideType, 'COVER');
    assert.equal(validated.slides[6].slideType, 'CTA');
  });

  await test('8. Output schema rejects carousel with fewer than 5 slides', async () => {
    const json = JSON.parse(createValidCarouselJson(4));
    assert.throws(
      () => carouselOutputSchema.parse(json),
      (err: any) => err.errors.some((e: any) => e.message.includes('at least 5 slides'))
    );
  });

  await test('9. Output schema rejects carousel with missing slide content or title', async () => {
    const json = JSON.parse(createValidCarouselJson(5));
    delete (json.slides[1] as any).content;
    assert.throws(() => carouselOutputSchema.parse(json));
  });

  await test('10. Output schema rejects slide with invalid slideType', async () => {
    const json = JSON.parse(createValidCarouselJson(5));
    (json.slides[0] as any).slideType = 'INVALID_TYPE';
    assert.throws(() => carouselOutputSchema.parse(json));
  });

  // 3. API ENDPOINT & PERSISTENCE TESTS
  await test('11. POST /api/v1/ai/generate/carousel generates, validates and persists CAROUSEL history', async () => {
    mockClient.mockResponse = createValidCarouselJson(7);

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {
        topic: '10 Essential Git Commands Every Developer Must Know',
        slidesCount: 7,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.slides.length, 7);
    assert.ok(body.meta.historyId);
    assert.equal(body.meta.model, 'qwen2.5:3b');

    // Verify in PostgreSQL database
    const history = await prisma.generationHistory.findUnique({
      where: { id: body.meta.historyId },
    });
    assert.ok(history, 'GenerationHistory record must exist');
    assert.equal(history.generationType, AIGenerationType.CAROUSEL);
    assert.equal(history.userId, editor.id);
    const output = history.outputPayload as CarouselOutput;
    assert.equal(output.slides.length, 7);
  });

  await test('12. Bounded 1-shot repair successfully rescues malformed JSON', async () => {
    // Initial output with trailing comma
    const rawWithTrailingComma = createValidCarouselJson(5).replace('}', '},');
    const validJson = createValidCarouselJson(5);

    let calls = 0;
    mockClient.generateCompletion = async () => {
      calls++;
      if (calls === 1) {
        return { response: rawWithTrailingComma, totalDurationMs: 80 };
      }
      return { response: validJson, totalDurationMs: 90 };
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: { topic: 'Testing 1-shot repair on carousel generation' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(calls, 2, 'Should attempt exactly 1 repair');
    GenerationMutex.completeReset();
  });

  await test('13. Unrepairable invalid JSON triggers 500/502 and fails closed to RECOVERY_REQUIRED', async () => {
    mockClient.generateCompletion = async () => ({
      response: 'THIS IS NOT VALID JSON AT ALL',
      totalDurationMs: 50,
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: { topic: 'Unrepairable JSON generation test' },
    });

    assert.equal(res.statusCode >= 500, true);
    assert.equal(GenerationMutex.getStatus(), 'RECOVERY_REQUIRED');

    // Clean recovery state for next tests
    await RecoveryMarkerManager.purgeAllMarkers();
    GenerationMutex.completeReset();
  });

  // 4. RBAC & PERMISSION TESTS
  await test('14. RBAC: OWNER is authorized to generate carousel', async () => {
    mockClient.generateCompletion = async () => ({
      response: createValidCarouselJson(5),
      totalDurationMs: 50,
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      headers: { origin: frontendOrigin, cookie: ownerCookie },
      payload: { topic: 'Testing OWNER role permissions' },
    });
    assert.equal(res.statusCode, 200);
  });

  await test('15. RBAC: ADMIN is authorized to generate carousel', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      headers: { origin: frontendOrigin, cookie: adminCookie },
      payload: { topic: 'Testing ADMIN role permissions' },
    });
    assert.equal(res.statusCode, 200);
  });

  await test('16. RBAC: APPROVER is authorized to generate carousel', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      headers: { origin: frontendOrigin, cookie: approverCookie },
      payload: { topic: 'Testing APPROVER role permissions' },
    });
    assert.equal(res.statusCode, 200);
  });

  await test('17. RBAC: ANALYST is strictly forbidden from generating carousel (403)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      headers: { origin: frontendOrigin, cookie: analystCookie },
      payload: { topic: 'Testing ANALYST role rejection' },
    });
    assert.equal(res.statusCode, 403);
  });

  await test('18. RBAC: Unauthenticated requests are rejected (401)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      headers: { origin: frontendOrigin },
      payload: { topic: 'Unauthenticated generation attempt' },
    });
    assert.equal(res.statusCode, 401);
  });

  // 5. TIMEOUT, CONCURRENCY & RECOVERY TESTS
  await test('19. Timeout handling: Ollama timeout returns 504 and marks RECOVERY_REQUIRED', async () => {
    mockClient.mockResponse = 'THROW_TIMEOUT';
    mockClient.generateCompletion = async () => {
      throw new Error('OLLAMA_TIMEOUT: Generation exceeded CPU timeout');
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: { topic: 'Testing timeout lifecycle in carousel generator' },
    });

    assert.equal(res.statusCode, 504);
    assert.equal(GenerationMutex.getStatus(), 'RECOVERY_REQUIRED');

    // Clean recovery state for subsequent tests
    await RecoveryMarkerManager.purgeAllMarkers();
    GenerationMutex.completeReset();
  });

  await test('20. Engine Busy: Concurrent claim returns 429 AI_BUSY', async () => {
    // Artificially claim mutex
    const claim = GenerationMutex.claim();
    assert.equal(claim.acquired, true);

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: { topic: 'Testing busy engine rejection' },
    });

    assert.equal(res.statusCode, 429);

    // Release
    GenerationMutex.completeReset();
  });

  await test('21. GenerationHistory query includes CAROUSEL generationType', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/history?generationType=CAROUSEL',
      headers: { origin: frontendOrigin, cookie: editorCookie },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.data.every((h: any) => h.generationType === 'CAROUSEL'));
  });

  console.log('\n======================================================');
  console.log(`  Carousel Tests Completed: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  await PidLockManager.releaseOwnership();
  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runCarouselTests().catch((err) => {
  console.error('\n❌ Carousel test runner encountered fatal error:');
  console.error(err);
  process.exit(1);
});
