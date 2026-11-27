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
  generateReelScriptInputSchema,
  createReelScriptOutputSchema,
  reelScriptOutputSchema,
  ReelScriptOutput,
} from '@devpilot/validation';

// Mock Ollama Client for deterministic Reel Script testing
class MockReelOllamaClient extends OllamaClient {
  public mockResponse = '';
  public mockHealth = true;
  public mockDuration = 150;
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

export function createValidReelJson(options?: {
  duration?: 30 | 60 | 90;
  platform?: string;
  topic?: string;
}): string {
  const duration = options?.duration || 60;
  const platform = options?.platform || 'INSTAGRAM_REELS';
  const topic = options?.topic || 'VS Code Debugging Tools';

  let scenes: any[] = [];

  if (duration === 30) {
    scenes = [
      {
        sceneNumber: 1,
        sceneTitle: 'Hook',
        visualDirection: 'Developer looking frustrated at console log spam',
        voiceover: 'Stop debugging with console logs. Here is the better way.',
        onScreenText: 'Stop console log ❌',
        durationSeconds: 5,
      },
      {
        sceneNumber: 2,
        sceneTitle: 'Tip 1: Logpoints',
        visualDirection: 'Screen recording of VS Code gutter setting a logpoint',
        voiceover: 'Right click the gutter and add a logpoint. Zero code changes required.',
        onScreenText: '1. Logpoints 📝',
        durationSeconds: 9,
      },
      {
        sceneNumber: 3,
        sceneTitle: 'Tip 2: Conditional Breakpoints',
        visualDirection: 'Screencast setting condition items length check',
        voiceover: 'Use conditional breakpoints to pause only when your state matches.',
        onScreenText: '2. Conditional Breakpoints 🛑',
        durationSeconds: 9,
      },
      {
        sceneNumber: 4,
        sceneTitle: 'CTA Outro',
        visualDirection: 'Developer smiling, pointing to bookmark icon below',
        voiceover: 'Save this reel for your next debugging session and follow for more.',
        onScreenText: 'Save this Reel 💾',
        durationSeconds: 7,
      },
    ];
  } else if (duration === 90) {
    scenes = [
      {
        sceneNumber: 1,
        sceneTitle: 'Hook',
        visualDirection: 'Fast cuts of buggy web apps crashing in production',
        voiceover: 'These common TypeScript mistakes cost engineering teams many hours.',
        onScreenText: 'TypeScript Mistakes ⚠️',
        durationSeconds: 6,
      },
      {
        sceneNumber: 2,
        sceneTitle: 'Mistake 1: Using Any',
        visualDirection: 'Code comparison with red X and green checkmark',
        voiceover: 'First: using any instead of unknown with type guards.',
        onScreenText: '1. Avoid any ❌',
        durationSeconds: 12,
      },
      {
        sceneNumber: 3,
        sceneTitle: 'Mistake 2: Type Assertions',
        visualDirection: 'Hovering over inferred types versus casting',
        voiceover: 'Second: force casting with as keyword bypasses compiler safety.',
        onScreenText: '2. Excessive Type Assertions ⚠️',
        durationSeconds: 12,
      },
      {
        sceneNumber: 4,
        sceneTitle: 'Mistake 3: Non-Null Assertion',
        visualDirection: 'Highlighting runtime crash caused by exclamation mark operator',
        voiceover: 'Third: the exclamation operator hides undefined errors until production.',
        onScreenText: '3. Non-null Assertion Pitfall 💥',
        durationSeconds: 12,
      },
      {
        sceneNumber: 5,
        sceneTitle: 'Mistake 4: Missing Return Types',
        visualDirection: 'Function signature showing unexpected any inference',
        voiceover: 'Fourth: exported functions without explicit return types leak internal state.',
        onScreenText: '4. Explicit Return Types 📌',
        durationSeconds: 12,
      },
      {
        sceneNumber: 6,
        sceneTitle: 'Mistake 5: Enums vs Const Objects',
        visualDirection: 'Transpiled bundle size comparison showing enum overhead',
        voiceover: 'Fifth: numeric enums add unnecessary runtime code; use const objects.',
        onScreenText: '5. Const Objects > Enums ⚡',
        durationSeconds: 12,
      },
      {
        sceneNumber: 7,
        sceneTitle: 'Summary Checklist',
        visualDirection: 'Quick bullet point checklist animation',
        voiceover: 'Audit your codebase with strict null checks to catch these automatically.',
        onScreenText: 'Summary Checklist 📋',
        durationSeconds: 12,
      },
      {
        sceneNumber: 8,
        sceneTitle: 'Call to Action',
        visualDirection: 'Developer pointing to follow and comment prompts',
        voiceover: 'Share this with your team and comment your favorite TypeScript tip below.',
        onScreenText: 'Share with your team 🚀',
        durationSeconds: 12,
      },
    ];
  } else {
    // 60 seconds (default)
    scenes = [
      {
        sceneNumber: 1,
        sceneTitle: 'Hook',
        visualDirection: 'Close up of developer typing console logs furiously',
        voiceover: 'Still debugging with console logs? Here is a much faster way in VS Code.',
        onScreenText: 'Stop console log ❌',
        durationSeconds: 6,
      },
      {
        sceneNumber: 2,
        sceneTitle: 'Technique 1: Logpoints',
        visualDirection: 'Right click editor gutter and choose Add Logpoint',
        voiceover: 'First: Logpoints. Log runtime values without touching git diffs or restarting.',
        onScreenText: '1. Zero diff Logpoints 📝',
        durationSeconds: 13,
      },
      {
        sceneNumber: 3,
        sceneTitle: 'Technique 2: Conditional Breakpoints',
        visualDirection: 'Setting condition in breakpoint modal',
        voiceover: 'Second: Conditional Breakpoints. Only pause when your specific condition occurs.',
        onScreenText: '2. Conditional Breakpoints 🛑',
        durationSeconds: 14,
      },
      {
        sceneNumber: 4,
        sceneTitle: 'Technique 3: Inline Inspection',
        visualDirection: 'Hovering over complex object in paused state',
        voiceover: 'Third: Inline evaluation. Step through code and inspect the live heap directly.',
        onScreenText: '3. Inline Evaluation 🔍',
        durationSeconds: 15,
      },
      {
        sceneNumber: 5,
        sceneTitle: 'Outro & CTA',
        visualDirection: 'Developer smiling, pointing to save and share icons',
        voiceover: 'Save this reel for your next sprint and comment your top debugging trick.',
        onScreenText: 'Save & Share 💾',
        durationSeconds: 12,
      },
    ];
  }

  return JSON.stringify({
    title: `${topic} in 2026`,
    topic,
    targetAudience: 'Web Developers',
    duration,
    platform,
    hook: `Stop debugging blindly: master ${topic} in under a minute.`,
    scenes,
    cta: `Save this reel for later and follow @CodeCulture for daily dev tips.`,
    suggestedCaption: `Master ${topic} with these actionable developer tips! 🚀\n\nWhich tool do you use most? Drop a comment below!`,
    suggestedHashtags: ['#webdev', '#coding', '#softwareengineering', '#developer'],
  });
}

async function runReelTests() {
  console.log('\n======================================================');
  console.log('  DevPilot M2.3.4.1: Reel Scripts Generator Tests     ');
  console.log('======================================================\n');

  // Claim PID lock for test process
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

  const mockClient = new MockReelOllamaClient();
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

  const owner = await ensureUser('owner.reel@codeculture.dev', 'Reel Owner', UserRole.OWNER);
  const admin = await ensureUser('admin.reel@codeculture.dev', 'Reel Admin', UserRole.ADMIN);
  const editor = await ensureUser('editor.reel@codeculture.dev', 'Reel Editor', UserRole.EDITOR);
  const approver = await ensureUser('approver.reel@codeculture.dev', 'Reel Approver', UserRole.APPROVER);
  const analyst = await ensureUser('analyst.reel@codeculture.dev', 'Reel Analyst', UserRole.ANALYST);

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
    return `127.0.2.${ipCounter++}`;
  }

  // ==========================================
  // 1. INPUT SCHEMA VALIDATION TESTS
  // ==========================================
  await test('1. Input schema validates valid 60s payload with defaults', async () => {
    const parsed = generateReelScriptInputSchema.parse({
      topic: 'How to build robust microservices in Node.js',
    });
    assert.equal(parsed.topic, 'How to build robust microservices in Node.js');
    assert.equal(parsed.duration, 60);
    assert.equal(parsed.platform, 'INSTAGRAM_REELS');
    assert.equal(parsed.language, 'en');
  });

  await test('2. Input schema validates 30s and 90s durations and custom platform', async () => {
    const p30 = generateReelScriptInputSchema.parse({
      topic: 'Quick CSS grid trick',
      duration: 30,
      platform: 'TIKTOK',
    });
    assert.equal(p30.duration, 30);
    assert.equal(p30.platform, 'TIKTOK');

    const p90 = generateReelScriptInputSchema.parse({
      topic: 'Deep dive into React 19 Server Components',
      duration: 90,
      platform: 'YOUTUBE_SHORTS',
      language: 'es',
    });
    assert.equal(p90.duration, 90);
    assert.equal(p90.platform, 'YOUTUBE_SHORTS');
    assert.equal(p90.language, 'es');
  });

  await test('3. Input schema rejects topic shorter than 5 characters', async () => {
    assert.throws(
      () => generateReelScriptInputSchema.parse({ topic: 'Tiny' }),
      /Topic must be at least 5 characters/
    );
  });

  await test('4. Input schema rejects topic longer than 500 characters', async () => {
    assert.throws(
      () => generateReelScriptInputSchema.parse({ topic: 'a'.repeat(501) }),
      /Topic must not exceed 500 characters/
    );
  });

  await test('5. Input schema rejects invalid durations (e.g. 45s, 120s)', async () => {
    assert.throws(() => generateReelScriptInputSchema.parse({ topic: 'Valid Topic', duration: 45 }));
    assert.throws(() => generateReelScriptInputSchema.parse({ topic: 'Valid Topic', duration: 120 }));
  });

  await test('6. Input schema rejects invalid platform', async () => {
    assert.throws(() =>
      generateReelScriptInputSchema.parse({
        topic: 'Valid Topic',
        platform: 'INVALID_PLATFORM' as any,
      })
    );
  });

  await test('7. Input schema enforces optional field maximum boundaries', async () => {
    assert.throws(() =>
      generateReelScriptInputSchema.parse({
        topic: 'Valid Topic',
        targetAudience: 'a'.repeat(201),
      })
    );
    assert.throws(() =>
      generateReelScriptInputSchema.parse({
        topic: 'Valid Topic',
        tone: 'a'.repeat(101),
      })
    );
    assert.throws(() =>
      generateReelScriptInputSchema.parse({
        topic: 'Valid Topic',
        additionalInstructions: 'a'.repeat(501),
      })
    );
  });

  // ==========================================
  // 2. DYNAMIC OUTPUT SCHEMA VALIDATION TESTS
  // ==========================================
  await test('8. Output schema validates valid 30s Reel JSON (3-6 scenes, duration within ±15%)', async () => {
    const jsonStr = createValidReelJson({ duration: 30 });
    const schema = createReelScriptOutputSchema({ duration: 30 });
    const parsed = schema.parse(JSON.parse(jsonStr));
    assert.equal(parsed.duration, 30);
    assert.equal(parsed.scenes.length, 4);
    assert.ok(parsed.scenes.length >= 3 && parsed.scenes.length <= 6);
  });

  await test('9. Output schema validates valid 60s Reel JSON (5-9 scenes, duration within ±15%)', async () => {
    const jsonStr = createValidReelJson({ duration: 60 });
    const schema = createReelScriptOutputSchema({ duration: 60 });
    const parsed = schema.parse(JSON.parse(jsonStr));
    assert.equal(parsed.duration, 60);
    assert.equal(parsed.scenes.length, 5);
  });

  await test('10. Output schema validates valid 90s Reel JSON (7-13 scenes, duration within ±15%)', async () => {
    const jsonStr = createValidReelJson({ duration: 90 });
    const schema = createReelScriptOutputSchema({ duration: 90 });
    const parsed = schema.parse(JSON.parse(jsonStr));
    assert.equal(parsed.duration, 90);
    assert.equal(parsed.scenes.length, 8);
  });

  await test('11. Output schema rejects duration mismatch between input and output', async () => {
    const jsonStr = createValidReelJson({ duration: 30 });
    const schema = createReelScriptOutputSchema({ duration: 60 });
    assert.throws(
      () => schema.parse(JSON.parse(jsonStr)),
      /Generated script duration \(30s\) does not match requested duration \(60s\)/
    );
  });

  await test('12. Output schema rejects platform mismatch when expectedPlatform is provided', async () => {
    const jsonStr = createValidReelJson({ duration: 60, platform: 'TIKTOK' });
    const schema = createReelScriptOutputSchema({ duration: 60, platform: 'INSTAGRAM_REELS' });
    assert.throws(
      () => schema.parse(JSON.parse(jsonStr)),
      /Generated script platform \(TIKTOK\) does not match requested platform \(INSTAGRAM_REELS\)/
    );
  });

  await test('13. Output schema rejects topic mismatch when expectedTopic is provided', async () => {
    const jsonStr = createValidReelJson({ duration: 60, topic: 'Completely Unrelated Subject' });
    const schema = createReelScriptOutputSchema({ duration: 60, topic: 'TypeScript Debugging' });
    assert.throws(
      () => schema.parse(JSON.parse(jsonStr)),
      /Generated script topic does not match requested topic/
    );
  });

  await test('14. Output schema rejects non-sequential scene numbers or gaps', async () => {
    const data = JSON.parse(createValidReelJson({ duration: 60 }));
    data.scenes[2].sceneNumber = 99; // corrupt sequence
    const schema = createReelScriptOutputSchema({ duration: 60 });
    assert.throws(
      () => schema.parse(data),
      /Scene at index 2 must have sceneNumber 3 \(got 99\)/
    );
  });

  await test('15. Output schema rejects scene duration outside bounds (e.g. 1s or 35s)', async () => {
    const dataUnder = JSON.parse(createValidReelJson({ duration: 60 }));
    dataUnder.scenes[0].durationSeconds = 1;
    const schema = createReelScriptOutputSchema({ duration: 60 });
    assert.throws(() => schema.parse(dataUnder), /Scene duration must be at least 2 seconds/);

    const dataOver = JSON.parse(createValidReelJson({ duration: 60 }));
    dataOver.scenes[0].durationSeconds = 35;
    assert.throws(() => schema.parse(dataOver), /Scene duration must not exceed 30 seconds/);
  });

  await test('16. Output schema rejects total duration outside ±15% window', async () => {
    // 60s reel: ±15% is [51s, 69s].
    // Create scenes totaling 40s (too short)
    const dataShort = JSON.parse(createValidReelJson({ duration: 60 }));
    dataShort.scenes.forEach((s: any) => (s.durationSeconds = 8)); // 5 * 8 = 40s
    const schema = createReelScriptOutputSchema({ duration: 60 });
    assert.throws(
      () => schema.parse(dataShort),
      /Total scene duration \(40s\) must be within 51s–69s/
    );

    // Create scenes totaling 80s (too long)
    const dataLong = JSON.parse(createValidReelJson({ duration: 60 }));
    dataLong.scenes.forEach((s: any) => (s.durationSeconds = 16)); // 5 * 16 = 80s
    assert.throws(
      () => schema.parse(dataLong),
      /Total scene duration \(80s\) must be within 51s–69s/
    );
  });

  await test('17. Output schema rejects scene count outside bounds for duration', async () => {
    // 30s allows 3-6 scenes; provide 2 scenes totaling 30s
    const schema30 = createReelScriptOutputSchema({ duration: 30 });
    const dataFew = {
      title: 'Short Reel',
      topic: 'Topic',
      duration: 30,
      hook: 'Hook statement here',
      scenes: [
        { sceneNumber: 1, sceneTitle: 'A', visualDirection: 'Visual A', voiceover: 'Voice A', durationSeconds: 15 },
        { sceneNumber: 2, sceneTitle: 'B', visualDirection: 'Visual B', voiceover: 'Voice B', durationSeconds: 15 },
      ],
      cta: 'CTA here',
    };
    assert.throws(
      () => schema30.parse(dataFew),
      /A 30s Reel must contain between 3 and 6 scenes \(got 2\)/
    );
  });

  // ==========================================
  // 3. INFERENCE LIFECYCLE & HTTP ENDPOINT TESTS
  // ==========================================
  await test('18. Successful Reel generation via POST /api/v1/ai/generate/reel-script', async () => {
    mockClient.mockResponse = createValidReelJson({ duration: 60, topic: 'Modern Docker Techniques' });

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/reel-script',
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {
        topic: 'Modern Docker Techniques',
        duration: 60,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.duration, 60);
    assert.equal(body.data.topic, 'Modern Docker Techniques');
    assert.equal(body.data.scenes.length, 5);
    assert.ok(body.meta.historyId);
    assert.ok(body.meta.durationMs >= 0);

    // Verify GenerationHistory persistence
    const history = await prisma.generationHistory.findUnique({
      where: { id: body.meta.historyId },
    });
    assert.ok(history);
    assert.equal(history?.generationType, AIGenerationType.REEL_SCRIPT);
    assert.equal(history?.userId, editor.id);
  });

  await test('19. Generation works for 30s and 90s durations via HTTP endpoint', async () => {
    // 30s
    mockClient.mockResponse = createValidReelJson({ duration: 30, topic: 'Quick CSS Tip' });
    const res30 = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/reel-script',
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: { topic: 'Quick CSS Tip', duration: 30 },
    });
    assert.equal(res30.statusCode, 200);
    assert.equal(JSON.parse(res30.body).data.duration, 30);

    // 90s
    mockClient.mockResponse = createValidReelJson({ duration: 90, topic: 'Deep Dive WebSockets' });
    const res90 = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/reel-script',
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: { topic: 'Deep Dive WebSockets', duration: 90 },
    });
    assert.equal(res90.statusCode, 200);
    assert.equal(JSON.parse(res90.body).data.duration, 90);
  });

  await test('20. Bounded 1-shot JSON repair on malformed initial response', async () => {
    let callNum = 0;
    const validJson = createValidReelJson({ duration: 60, topic: 'Database Indexing' });

    mockClient.generateCompletion = async (options: any) => {
      callNum++;
      if (callNum === 1) {
        // Initial invalid JSON
        return { response: 'NOT_VALID_JSON{malformed', totalDurationMs: 100 };
      }
      // Repaired JSON
      return { response: validJson, totalDurationMs: 120 };
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/reel-script',
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: { topic: 'Database Indexing', duration: 60 },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(callNum, 2, 'Must have attempted exactly 1 repair call');

    // Restore standard mock completion
    mockClient.generateCompletion = async (options: any) => ({
      response: mockClient.mockResponse,
      totalDurationMs: mockClient.mockDuration,
    });
  });

  await test('21. Repair failure follows existing error semantics (HTTP 502 AI_MALFORMED_OUTPUT)', async () => {
    mockClient.mockResponse = 'PERMANENTLY_MALFORMED_OUTPUT';

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/reel-script',
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: { topic: 'Database Indexing', duration: 60 },
    });

    assert.equal(res.statusCode, 502);
    assert.equal(GenerationMutex.getStatus(), 'RECOVERY_REQUIRED');

    // Reset mutex for remaining tests
    await RecoveryMarkerManager.purgeAllMarkers();
    GenerationMutex.completeReset();
  });

  await test('22. Mutex blocks concurrent requests with HTTP 429', async () => {
    GenerationMutex.completeReset();
    const claim = GenerationMutex.claim();
    assert.equal(claim.acquired, true);

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/reel-script',
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: { topic: 'Concurrent Request Test' },
    });

    assert.equal(res.statusCode, 429);

    // Release artificial lock
    await GenerationMutex.release(claim.taskId!);
  });

  await test('23. Timeout handling triggers HTTP 504 and RECOVERY_REQUIRED', async () => {
    mockClient.generateCompletion = async () => {
      throw new Error('OLLAMA_TIMEOUT: Generation exceeded CPU timeout');
    };

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/reel-script',
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: { topic: 'Timeout Test Topic' },
    });

    assert.equal(res.statusCode, 504);
    assert.equal(GenerationMutex.getStatus(), 'RECOVERY_REQUIRED');

    // Reset mutex for remaining tests
    await RecoveryMarkerManager.purgeAllMarkers();
    GenerationMutex.completeReset();
  });

  // ==========================================
  // 4. AUTHORIZATION AND RBAC TESTS
  // ==========================================
  await test('24. RBAC: OWNER, ADMIN, APPROVER are permitted (HTTP 200)', async () => {
    const validJson = createValidReelJson({ duration: 60, topic: 'Role Authorization Check' });
    mockClient.generateCompletion = async () => ({
      response: validJson,
      totalDurationMs: 50,
    });

    const rolesToTest = [
      { name: 'OWNER', cookie: ownerCookie },
      { name: 'ADMIN', cookie: adminCookie },
      { name: 'APPROVER', cookie: approverCookie },
    ];

    for (const r of rolesToTest) {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/ai/generate/reel-script',
        remoteAddress: getNextIp(),
        headers: { origin: frontendOrigin, cookie: r.cookie },
        payload: { topic: 'Role Authorization Check' },
      });
      assert.equal(res.statusCode, 200, `Role ${r.name} should be permitted`);
    }
  });

  await test('25. RBAC: ANALYST is denied (HTTP 403 Forbidden)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/reel-script',
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin, cookie: analystCookie },
      payload: { topic: 'Role Authorization Check' },
    });
    assert.equal(res.statusCode, 403);
  });

  await test('26. Unauthenticated request is denied (HTTP 401 Unauthorized)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/ai/generate/reel-script',
      remoteAddress: getNextIp(),
      headers: { origin: frontendOrigin },
      payload: { topic: 'Unauthenticated Request' },
    });
    assert.equal(res.statusCode, 401);
  });

  // Cleanup
  await server.close();
  await PidLockManager.releaseOwnership();

  console.log('\n------------------------------------------------------');
  console.log(`  Tests Passed: ${passed}`);
  console.log(`  Tests Failed: ${failed}`);
  console.log('------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runReelTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
