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
  createCarouselOutputSchema,
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

  let ipCounter = 1;
  function getNextIp() {
    return `127.0.1.${ipCounter++}`;
  }

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

  // F-01: EXACT SLIDE COUNT VALIDATION TESTS
  await test('10a. [F-01] createCarouselOutputSchema(5) accepts exactly 5 slides', async () => {
    const json = JSON.parse(createValidCarouselJson(5));
    const schema = createCarouselOutputSchema(5);
    const validated = schema.parse(json);
    assert.equal(validated.slides.length, 5);
  });

  await test('10b. [F-01] createCarouselOutputSchema(5) rejects 6 slides with exact count error', async () => {
    const json = JSON.parse(createValidCarouselJson(6));
    const schema = createCarouselOutputSchema(5);
    assert.throws(
      () => schema.parse(json),
      (err: any) => err.errors.some((e: any) => e.message.includes('Carousel must contain exactly 5 slides (got 6)'))
    );
  });

  // F-02: SLIDE SEQUENCE INTEGRITY TESTS
  await test('10c. [F-02] Rejects carousel when first slide is not COVER', async () => {
    const json = JSON.parse(createValidCarouselJson(5));
    json.slides[0].slideType = 'BODY';
    assert.throws(
      () => carouselOutputSchema.parse(json),
      (err: any) => err.errors.some((e: any) => e.message.includes('First slide must have slideType "COVER"'))
    );
  });

  await test('10d. [F-02] Rejects carousel when last slide is not CTA', async () => {
    const json = JSON.parse(createValidCarouselJson(5));
    json.slides[4].slideType = 'BODY';
    assert.throws(
      () => carouselOutputSchema.parse(json),
      (err: any) => err.errors.some((e: any) => e.message.includes('Last slide must have slideType "CTA"'))
    );
  });

  await test('10e. [F-02] Rejects carousel when intermediate slide is not BODY', async () => {
    const json = JSON.parse(createValidCarouselJson(5));
    json.slides[2].slideType = 'COVER';
    assert.throws(
      () => carouselOutputSchema.parse(json),
      (err: any) => err.errors.some((e: any) => e.message.includes('Intermediate slide 3 must have slideType "BODY"'))
    );
  });

  await test('10f. [F-02] Rejects carousel when slide numbers are not sequential starting at 1', async () => {
    const json = JSON.parse(createValidCarouselJson(5));
    json.slides[1].slideNumber = 4; // Expected 2, got 4
    assert.throws(
      () => carouselOutputSchema.parse(json),
      (err: any) => err.errors.some((e: any) => e.message.includes('Slide at position 2 must have slideNumber 2 (got 4)'))
    );
  });

  // 3. API ENDPOINT & PERSISTENCE TESTS
  await test('11. POST /api/v1/ai/generate/carousel generates, validates and persists CAROUSEL history', async () => {
    mockClient.mockResponse = createValidCarouselJson(7);

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      remoteAddress: getNextIp(),
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
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: { topic: 'Testing 1-shot repair on carousel generation', slidesCount: 5 },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(calls, 2, 'Should attempt exactly 1 repair');
    GenerationMutex.completeReset();
  });

  await test('12b. [F-03] Bounded 1-shot repair successfully rescues slide count mismatch', async () => {
    // Requested 5 slides, but model initially returns 6 slides
    const initial6Slides = createValidCarouselJson(6);
    const repaired5Slides = createValidCarouselJson(5);

    let calls = 0;
    mockClient.generateCompletion = async (options: any) => {
      calls++;
      if (calls === 1) {
        return { response: initial6Slides, totalDurationMs: 80 };
      }
      // Verify repair prompt mentions the validation error
      assert.ok(options.prompt.includes('IMPORTANT REPAIR REQUEST'), 'Repair prompt must contain repair instructions');
      assert.ok(options.prompt.includes('Carousel must contain exactly 5 slides'), 'Repair prompt must explain count mismatch');
      return { response: repaired5Slides, totalDurationMs: 90 };
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {
        topic: 'Testing 1-shot repair on slide count mismatch',
        slidesCount: 5,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(calls, 2, 'Should trigger exactly 1 repair attempt');
    const body = JSON.parse(res.body);
    assert.equal(body.data.slides.length, 5);
    GenerationMutex.completeReset();
  });

  await test('12c. [F-03] Bounded 1-shot repair successfully rescues slide sequence integrity failure', async () => {
    // Initial output has first slide as BODY instead of COVER
    const invalidSequenceObj = JSON.parse(createValidCarouselJson(5));
    invalidSequenceObj.slides[0].slideType = 'BODY';
    const invalidSequenceJson = JSON.stringify(invalidSequenceObj);
    const validJson = createValidCarouselJson(5);

    let calls = 0;
    mockClient.generateCompletion = async (options: any) => {
      calls++;
      if (calls === 1) {
        return { response: invalidSequenceJson, totalDurationMs: 80 };
      }
      assert.ok(options.prompt.includes('First slide must have slideType'), 'Repair prompt must explain sequence error');
      return { response: validJson, totalDurationMs: 90 };
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {
        topic: 'Testing 1-shot repair on slide sequence error',
        slidesCount: 5,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(calls, 2, 'Should trigger exactly 1 repair attempt');
    const body = JSON.parse(res.body);
    assert.equal(body.data.slides[0].slideType, 'COVER');
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
      remoteAddress: getNextIp(),
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
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: ownerCookie },
      payload: { topic: 'Testing OWNER role permissions', slidesCount: 5 },
    });
    assert.equal(res.statusCode, 200);
  });

  await test('15. RBAC: ADMIN is authorized to generate carousel', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: adminCookie },
      payload: { topic: 'Testing ADMIN role permissions', slidesCount: 5 },
    });
    assert.equal(res.statusCode, 200);
  });

  await test('16. RBAC: APPROVER is authorized to generate carousel', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: approverCookie },
      payload: { topic: 'Testing APPROVER role permissions', slidesCount: 5 },
    });
    assert.equal(res.statusCode, 200);
  });

  await test('16b. RBAC: EDITOR is authorized to generate carousel', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: { topic: 'Testing EDITOR role permissions explicitly', slidesCount: 5 },
    });
    assert.equal(res.statusCode, 200);
  });

  await test('17. RBAC: ANALYST is strictly forbidden from generating carousel (403)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: analystCookie },
      payload: { topic: 'Testing ANALYST role rejection' },
    });
    assert.equal(res.statusCode, 403);
  });

  await test('18. RBAC: Unauthenticated requests are rejected (401)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/carousel',
      remoteAddress: getNextIp(),
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
      remoteAddress: getNextIp(),
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
      remoteAddress: getNextIp(),
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

  // 6. CAROUSEL SAVE-TO-DRAFT INTEGRATION TESTS (M2.3.3.1)
  await test('22. [M2.3.3.1] Successful Carousel promotion creates Draft ContentPost and links history', async () => {
    const validJson = createValidCarouselJson(5);
    const history = await prisma.generationHistory.create({
      data: {
        generationType: AIGenerationType.CAROUSEL,
        userId: editor.id,
        model: 'qwen2.5:3b',
        durationMs: 250,
        inputPayload: { topic: 'Testing Save-to-Draft promotion for carousel' },
        outputPayload: JSON.parse(validJson),
      },
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {},
    });

    assert.equal(res.statusCode, 201, 'Successful Save-to-Draft returns HTTP 201');
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.data.post.id);
    assert.equal(body.data.post.contentType, 'CAROUSEL');
    assert.equal(body.data.post.status, 'DRAFT');
    assert.equal(body.data.post.sourceType, 'AI_GENERATED');
    assert.equal(body.data.post.createdById, editor.id);
    assert.equal(body.data.history.resultingPostId, body.data.post.id);

    // Verify deterministic Markdown serialization in caption
    const caption: string = body.data.post.caption;
    assert.ok(caption.startsWith('# Mastering TypeScript Generics'));
    assert.ok(caption.includes('**Topic:** TypeScript generic constraints and advanced utility types'));
    assert.ok(caption.includes('**Target Audience:** Intermediate TypeScript developers'));
    assert.ok(caption.includes('**Slides:** 5'));
    assert.ok(caption.includes('### [Slide 1: COVER] Mastering TypeScript Generics in 2026'));
    assert.ok(caption.includes('*Hook:* Still writing `as any` in your TypeScript code? Here is how to fix it forever.'));
    assert.ok(caption.includes('> **Visual Direction:** Bold purple gradient card with glowing code icon'));
    assert.ok(caption.includes('### [Slide 2: BODY] Step 1: Generic Constraints & Inference'));
    assert.ok(caption.includes('### [Slide 5: CTA] Summary & Next Steps'));
    assert.ok(caption.includes('*CTA:* Save this post for your next refactor & follow @CodeCulture for daily web dev insights.'));

    // Verify closing CTA mapped from CTA slide
    assert.equal(body.data.post.cta, 'Save this post for your next refactor & follow @CodeCulture for daily web dev insights.');

    // Verify database record directly
    const dbPost = await prisma.contentPost.findUnique({ where: { id: body.data.post.id } });
    assert.ok(dbPost);
    assert.equal(dbPost.contentType, 'CAROUSEL');

    // Verify atomic ActivityLog entry
    const auditLog = await prisma.activityLog.findFirst({
      where: {
        action: 'CONTENT_DRAFT_CREATED_FROM_AI',
        entityId: body.data.post.id,
      },
    });
    assert.ok(auditLog);
    const meta = auditLog.metadata as any;
    assert.equal(meta.generationType, 'CAROUSEL');
    assert.equal(meta.contentType, 'CAROUSEL');
  });

  await test('23. [M2.3.3.1] Custom title override in request payload is respected', async () => {
    const history = await prisma.generationHistory.create({
      data: {
        generationType: AIGenerationType.CAROUSEL,
        userId: editor.id,
        model: 'qwen2.5:3b',
        durationMs: 200,
        inputPayload: { topic: 'Testing custom title' },
        outputPayload: JSON.parse(createValidCarouselJson(5)),
      },
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: { title: 'My Custom Git Carousel Title' },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.data.post.title, 'My Custom Git Carousel Title');
  });

  await test('24. [M2.3.3.1] Cross-user promotion is strictly forbidden (403)', async () => {
    // History owned by editor
    const history = await prisma.generationHistory.create({
      data: {
        generationType: AIGenerationType.CAROUSEL,
        userId: editor.id,
        model: 'qwen2.5:3b',
        durationMs: 200,
        inputPayload: { topic: 'Testing cross-user promotion forbidden' },
        outputPayload: JSON.parse(createValidCarouselJson(5)),
      },
    });

    // Admin attempts to promote editor's history
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { origin: frontendOrigin, cookie: adminCookie },
      payload: {},
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.ok(body.message.includes('CROSS_USER_PROMOTION_FORBIDDEN'));
  });

  await test('25. [M2.3.3.1] APPROVER and ANALYST are forbidden from promoting to draft (403)', async () => {
    const approverHistory = await prisma.generationHistory.create({
      data: {
        generationType: AIGenerationType.CAROUSEL,
        userId: approver.id,
        model: 'qwen2.5:3b',
        durationMs: 200,
        inputPayload: { topic: 'Testing approver promotion' },
        outputPayload: JSON.parse(createValidCarouselJson(5)),
      },
    });

    const resApprover = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${approverHistory.id}/save-to-draft`,
      headers: { origin: frontendOrigin, cookie: approverCookie },
      payload: {},
    });
    assert.equal(resApprover.statusCode, 403);

    const resAnalyst = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${approverHistory.id}/save-to-draft`,
      headers: { origin: frontendOrigin, cookie: analystCookie },
      payload: {},
    });
    assert.equal(resAnalyst.statusCode, 403);
  });

  await test('26. [M2.3.3.1] Duplicate promotion returns HTTP 409 DRAFT_ALREADY_EXISTS', async () => {
    const history = await prisma.generationHistory.create({
      data: {
        generationType: AIGenerationType.CAROUSEL,
        userId: editor.id,
        model: 'qwen2.5:3b',
        durationMs: 200,
        inputPayload: { topic: 'Testing duplicate promotion' },
        outputPayload: JSON.parse(createValidCarouselJson(5)),
      },
    });

    // First promotion succeeds
    const res1 = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {},
    });
    assert.equal(res1.statusCode, 201);

    // Second promotion is rejected
    const res2 = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {},
    });
    assert.equal(res2.statusCode, 409);
    const body2 = JSON.parse(res2.body);
    assert.ok(body2.message.includes('DRAFT_ALREADY_EXISTS'));
  });

  await test('27. [M2.3.3.1] Concurrent promotion attempts create exactly one Draft', async () => {
    const history = await prisma.generationHistory.create({
      data: {
        generationType: AIGenerationType.CAROUSEL,
        userId: editor.id,
        model: 'qwen2.5:3b',
        durationMs: 200,
        inputPayload: { topic: 'Testing concurrent promotion' },
        outputPayload: JSON.parse(createValidCarouselJson(5)),
      },
    });

    const [resA, resB] = await Promise.all([
      server.inject({
        method: 'POST',
        url: `/api/v1/ai/history/${history.id}/save-to-draft`,
        headers: { origin: frontendOrigin, cookie: editorCookie },
        payload: {},
      }),
      server.inject({
        method: 'POST',
        url: `/api/v1/ai/history/${history.id}/save-to-draft`,
        headers: { origin: frontendOrigin, cookie: editorCookie },
        payload: {},
      }),
    ]);

    const statuses = [resA.statusCode, resB.statusCode].sort();
    assert.deepEqual(statuses, [201, 409], 'One concurrent request must succeed (201) and the other fail with 409');
  });

  await test('28. [M2.3.3.1] Re-promotion is allowed after deleting the linked Draft (SetNull)', async () => {
    const history = await prisma.generationHistory.create({
      data: {
        generationType: AIGenerationType.CAROUSEL,
        userId: editor.id,
        model: 'qwen2.5:3b',
        durationMs: 200,
        inputPayload: { topic: 'Testing re-promotion after deletion' },
        outputPayload: JSON.parse(createValidCarouselJson(5)),
      },
    });

    // 1. Promote to draft
    const res1 = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {},
    });
    assert.equal(res1.statusCode, 201);
    const draftId = JSON.parse(res1.body).data.post.id;

    // 2. Delete the created Draft
    await prisma.contentPost.delete({ where: { id: draftId } });

    // 3. Verify history resultingPostId is now NULL via SetNull
    const refreshed = await prisma.generationHistory.findUnique({ where: { id: history.id } });
    assert.equal(refreshed?.resultingPostId, null);

    // 4. Re-promotion succeeds cleanly
    const res2 = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {},
    });
    assert.equal(res2.statusCode, 201);
  });

  await test('29. [M2.3.3.1] Malformed persisted Carousel output returns 400 VALIDATION_ERROR', async () => {
    const corruptedHistory = await prisma.generationHistory.create({
      data: {
        generationType: AIGenerationType.CAROUSEL,
        userId: editor.id,
        model: 'qwen2.5:3b',
        durationMs: 200,
        inputPayload: { topic: 'Testing corrupted output' },
        outputPayload: { title: 'Corrupted', slides: [{ slideNumber: 1, slideType: 'INVALID' }] },
      },
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${corruptedHistory.id}/save-to-draft`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {},
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.message.includes('VALIDATION_ERROR'));
  });

  await test('30. [M2.3.3.1] Oversized carousel caption (>10000 chars) is rejected with CAROUSEL_CONTENT_TOO_LONG without partial writes', async () => {
    // Construct a valid Carousel JSON where slide contents exceed 10,000 characters total
    const hugeContent = 'a'.repeat(980); // 10 slides * 980 chars = ~10,500 chars with headers
    const hugeSlides = Array.from({ length: 10 }, (_, i) => ({
      slideNumber: i + 1,
      slideType: i === 0 ? 'COVER' : i === 9 ? 'CTA' : 'BODY',
      title: `Slide Title ${i + 1}`,
      content: hugeContent,
      visualDirection: 'Visual note',
      hook: i === 0 ? 'Big hook' : undefined,
      cta: i === 9 ? 'Big cta' : undefined,
    }));

    const hugeHistory = await prisma.generationHistory.create({
      data: {
        generationType: AIGenerationType.CAROUSEL,
        userId: editor.id,
        model: 'qwen2.5:3b',
        durationMs: 200,
        inputPayload: { topic: 'Testing oversized carousel' },
        outputPayload: {
          title: 'Oversized Carousel Test',
          topic: 'Massive Slides',
          targetAudience: 'Testing Audience',
          slides: hugeSlides,
        },
      },
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${hugeHistory.id}/save-to-draft`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {},
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.message.includes('CAROUSEL_CONTENT_TOO_LONG'));

    // Verify history was NOT updated
    const refreshed = await prisma.generationHistory.findUnique({ where: { id: hugeHistory.id } });
    assert.equal(refreshed?.resultingPostId, null);

    // Verify no ContentPost was created
    const postCount = await prisma.contentPost.count({ where: { title: 'Oversized Carousel Test' } });
    assert.equal(postCount, 0);
  });

  await test('31. [M2.3.3.1] Content Library retrieval and update of created Carousel Draft', async () => {
    // Promote a carousel
    const history = await prisma.generationHistory.create({
      data: {
        generationType: AIGenerationType.CAROUSEL,
        userId: editor.id,
        model: 'qwen2.5:3b',
        durationMs: 200,
        inputPayload: { topic: 'Testing library integration' },
        outputPayload: JSON.parse(createValidCarouselJson(5)),
      },
    });

    const resSave = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {},
    });
    assert.equal(resSave.statusCode, 201);
    const draftId = JSON.parse(resSave.body).data.post.id;

    // 1. Fetch via Content Library endpoint
    const resGet = await server.inject({
      method: 'GET',
      url: `/api/v1/content/${draftId}`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
    });
    assert.equal(resGet.statusCode, 200);
    const postData = JSON.parse(resGet.body).data.post;
    assert.equal(postData.contentType, 'CAROUSEL');
    assert.equal(postData.status, 'DRAFT');

    // 2. Edit the draft via PATCH /content/:id
    const updatedCaption = postData.caption + '\n\n---\n*Edited by user in Content Library*';
    const resPatch = await server.inject({
      method: 'PATCH',
      url: `/api/v1/content/${draftId}`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {
        caption: updatedCaption,
      },
    });
    assert.equal(resPatch.statusCode, 200);

    // 3. Confirm update persisted
    const dbPost = await prisma.contentPost.findUnique({ where: { id: draftId } });
    assert.ok(dbPost?.caption.includes('*Edited by user in Content Library*'));
  });

  await test('32. [Regression] CTA and HASHTAGS continue to return 422 SAVE_TO_DRAFT_UNSUPPORTED', async () => {
    const ctaHistory = await prisma.generationHistory.create({
      data: {
        generationType: AIGenerationType.CTA,
        userId: editor.id,
        model: 'qwen2.5:3b',
        durationMs: 100,
        inputPayload: { goal: 'Test CTA' },
        outputPayload: { ctas: ['CTA 1', 'CTA 2', 'CTA 3'] },
      },
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${ctaHistory.id}/save-to-draft`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {},
    });

    assert.equal(res.statusCode, 422);
    const body = JSON.parse(res.body);
    assert.ok(body.message.includes('SAVE_TO_DRAFT_UNSUPPORTED'));
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
