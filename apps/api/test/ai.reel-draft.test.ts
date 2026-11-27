import assert from 'node:assert/strict';
import { buildServer } from '../src/server';
import { prisma } from '../src/db/prisma';
import { UserRole, AIGenerationType, PostStatus, ContentType, ContentCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ActivityService } from '../src/modules/activity/activity.service';

async function runReelDraftTests() {
  console.log('\n======================================================');
  console.log('  DevPilot M2.3.4.5.1: Reel Script Save-to-Draft Tests  ');
  console.log('======================================================\n');

  const server = buildServer();
  await server.ready();

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

  // Helper to ensure user exists
  async function ensureUser(email: string, name: string, role: UserRole) {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          role,
        },
      });
    }
    return user;
  }

  // Ensure test users across roles
  const owner = await ensureUser('owner.reeldraft@codeculture.dev', 'Reel Draft Owner', UserRole.OWNER);
  const admin = await ensureUser('admin.reeldraft@codeculture.dev', 'Reel Draft Admin', UserRole.ADMIN);
  const editor = await ensureUser('editor.reeldraft@codeculture.dev', 'Reel Draft Editor', UserRole.EDITOR);
  const approver = await ensureUser('approver.reeldraft@codeculture.dev', 'Reel Draft Approver', UserRole.APPROVER);
  const analyst = await ensureUser('analyst.reeldraft@codeculture.dev', 'Reel Draft Analyst', UserRole.ANALYST);

  // Login helper
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

  // Ensure BrandSettings exist
  let brand = await prisma.brandSettings.findFirst();
  if (!brand) {
    brand = await prisma.brandSettings.create({
      data: {
        brandName: 'CodeCulture',
        tagline: 'Code. Create. Build. Repeat.',
        tone: 'Informative, modern, developer-friendly, humorous',
        audience: 'Web developers, students, freelancers, AI enthusiasts',
      },
    });
  }

  // Cleanup past test data for these users
  const testUserIds = [owner.id, admin.id, editor.id, approver.id, analyst.id];
  await prisma.contentPost.deleteMany({ where: { createdById: { in: testUserIds } } });
  await prisma.generationHistory.deleteMany({ where: { userId: { in: testUserIds } } });

  // Standard valid 30s Reel Script output
  function createValidReelOutput(overrides: any = {}): any {
    return {
      title: '5 Clean Code Habits Every React Dev Needs',
      topic: 'Clean Code in React',
      targetAudience: 'Frontend Developers',
      duration: 30,
      platform: 'INSTAGRAM_REELS',
      hook: 'Stop writing messy components! Here are 3 habits that will transform your React codebase in 30 seconds.',
      scenes: [
        {
          sceneNumber: 1,
          sceneTitle: 'The Bloated Component',
          visualDirection: 'Fast zoom into a bloated 500-line React component with nested ternary operators.',
          voiceover: 'If your component files look like a phonebook, you are doing React wrong.',
          onScreenText: 'Stop Bloating Components',
          durationSeconds: 5,
        },
        {
          sceneNumber: 2,
          sceneTitle: 'Extract Custom Hooks',
          visualDirection: 'Code editor refactoring stateful logic out into a neat useUserQuery custom hook.',
          voiceover: 'First: extract all data-fetching and complex side effects into custom hooks.',
          onScreenText: 'Rule 1: Extract Custom Hooks',
          durationSeconds: 10,
        },
        {
          sceneNumber: 3,
          sceneTitle: 'Atomic Components',
          visualDirection: 'Splitting a large JSX tree into atomic presentational sub-components.',
          voiceover: 'Second: split large JSX blocks into atomic, focused components under 100 lines.',
          onScreenText: 'Rule 2: Keep Components Focused',
          durationSeconds: 8,
        },
        {
          sceneNumber: 4,
          sceneTitle: 'Closing & CTA',
          visualDirection: 'Presenter smiling at desk, points down toward the save button.',
          voiceover: 'Which of these do you do daily? Save this reel and drop your thoughts below!',
          onScreenText: 'Save & Follow for More',
          durationSeconds: 7,
        },
      ],
      cta: 'Save this post and share your favorite React clean-code tip in the comments!',
      suggestedCaption: 'Are your React components getting out of hand? Clean architecture does not have to be complicated. Try these simple habits today! 🚀',
      suggestedHashtags: ['#reactjs', '#cleancode', '#webdev', '#frontend'],
      ...overrides,
    };
  }

  async function createReelHistory(userId: string, outputPayload: any, inputPayload: any = { topic: 'React Clean Code', duration: 30 }) {
    return await prisma.generationHistory.create({
      data: {
        userId,
        generationType: AIGenerationType.REEL_SCRIPT,
        model: 'qwen2.5:3b',
        durationMs: 250,
        inputPayload,
        outputPayload,
      },
    });
  }

  // =========================================================================
  // 1. SUCCESSFUL PROMOTION, MAPPING & FIELDS
  // =========================================================================

  await test('1. Successful Reel Script promotion returns HTTP 201 with resulting post and updated history', async () => {
    const history = await createReelHistory(editor.id, createValidReelOutput());

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.ok(body.data.post.id);
    assert.equal(body.data.history.resultingPostId, body.data.post.id);

    // Verify DB state
    const dbHistory = await prisma.generationHistory.findUnique({ where: { id: history.id } });
    assert.equal(dbHistory?.resultingPostId, body.data.post.id);
  });

  await test('2. Correct REEL contentType and DRAFT status mapped on ContentPost', async () => {
    const history = await createReelHistory(editor.id, createValidReelOutput());

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.post.contentType, ContentType.REEL);
    assert.equal(body.data.post.status, PostStatus.DRAFT);

    const dbPost = await prisma.contentPost.findUnique({ where: { id: body.data.post.id } });
    assert.equal(dbPost?.contentType, ContentType.REEL);
    assert.equal(dbPost?.status, PostStatus.DRAFT);
  });

  await test('3. Correct sourceType, category, creator and BrandSettings on ContentPost', async () => {
    const history = await createReelHistory(editor.id, createValidReelOutput());

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.post.sourceType, 'AI_GENERATED');
    assert.equal(body.data.post.category, ContentCategory.WEB_DEV_TIPS);

    const dbPost = await prisma.contentPost.findUnique({ where: { id: body.data.post.id } });
    assert.equal(dbPost?.sourceType, 'AI_GENERATED');
    assert.equal(dbPost?.category, ContentCategory.WEB_DEV_TIPS);
    assert.equal(dbPost?.createdById, editor.id);
    assert.equal(dbPost?.brandSettingsId, brand!.id);
    assert.equal(dbPost?.scheduledAt, null);
    assert.equal(dbPost?.publishedAt, null);
  });

  await test('4. Complete Markdown serialization preserves title, topic, duration, platform, hook, all scenes, and CTA', async () => {
    const reelData = createValidReelOutput();
    const history = await createReelHistory(editor.id, reelData);

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    const caption = body.data.post.caption;

    // Header verification
    assert.ok(caption.includes(`# ${reelData.title}`));
    assert.ok(caption.includes(`**Topic:** ${reelData.topic}`));
    assert.ok(caption.includes(`**Duration:** 30s | **Platform:** INSTAGRAM_REELS`));
    assert.ok(caption.includes(`**Target Audience:** ${reelData.targetAudience}`));

    // Hook verification
    assert.ok(caption.includes(`### Opening Hook\n> ${reelData.hook}`));

    // Scenes breakdown verification
    assert.ok(caption.includes(`#### [Scene 1: The Bloated Component] (5s)`));
    assert.ok(caption.includes(`> **Visual:** ${reelData.scenes[0].visualDirection}`));
    assert.ok(caption.includes(`**Voiceover:** "${reelData.scenes[0].voiceover}"`));
    assert.ok(caption.includes(`*On-Screen Text:* \`Stop Bloating Components\``));

    assert.ok(caption.includes(`#### [Scene 2: Extract Custom Hooks] (10s)`));
    assert.ok(caption.includes(`#### [Scene 3: Atomic Components] (8s)`));
    assert.ok(caption.includes(`#### [Scene 4: Closing & CTA] (7s)`));

    // CTA verification
    assert.ok(caption.includes(`### Call to Action\n${reelData.cta}`));
  });

  await test('5. Suggested hashtags preserved in ContentPost.hashtags array', async () => {
    const reelData = createValidReelOutput({
      suggestedHashtags: ['#react', '#cleancode', '#typescript'],
    });
    const history = await createReelHistory(editor.id, reelData);

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.deepEqual(body.data.post.hashtags, ['#react', '#cleancode', '#typescript']);

    const dbPost = await prisma.contentPost.findUnique({ where: { id: body.data.post.id } });
    assert.deepEqual(dbPost?.hashtags, ['#react', '#cleancode', '#typescript']);
  });

  await test('6. CTA mapped to dedicated ContentPost.cta column', async () => {
    const reelData = createValidReelOutput({
      cta: 'Follow @CodeCulture for daily web dev tips!',
    });
    const history = await createReelHistory(editor.id, reelData);

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.post.cta, 'Follow @CodeCulture for daily web dev tips!');

    const dbPost = await prisma.contentPost.findUnique({ where: { id: body.data.post.id } });
    assert.equal(dbPost?.cta, 'Follow @CodeCulture for daily web dev tips!');
  });

  await test('7. Suggested social caption preserved in serialized draft', async () => {
    const reelData = createValidReelOutput({
      suggestedCaption: 'Boost your developer workflow with clean React principles! 🚀',
    });
    const history = await createReelHistory(editor.id, reelData);

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.ok(body.data.post.caption.includes('### Suggested Social Caption\nBoost your developer workflow with clean React principles! 🚀'));
  });

  await test('8. Target audience preserved in Markdown header without invalid Prisma column insertion', async () => {
    const reelData = createValidReelOutput({
      targetAudience: 'Senior Fullstack Engineers & Tech Leads',
    });
    const history = await createReelHistory(editor.id, reelData);

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.ok(body.data.post.caption.includes('**Target Audience:** Senior Fullstack Engineers & Tech Leads'));

    // Verify DB post succeeds and has valid structure
    const dbPost = await prisma.contentPost.findUnique({ where: { id: body.data.post.id } });
    assert.ok(dbPost);
  });

  await test('9. Optional title override used when provided; defaults to reel.title when omitted', async () => {
    // 9a. Default title
    const history1 = await createReelHistory(editor.id, createValidReelOutput({ title: 'Default Generated Title' }));
    const res1 = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history1.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });
    assert.equal(res1.statusCode, 201);
    assert.equal(JSON.parse(res1.payload).data.post.title, 'Default Generated Title');

    // 9b. Custom override title
    const history2 = await createReelHistory(editor.id, createValidReelOutput({ title: 'Default Generated Title' }));
    const res2 = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history2.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { title: 'Overridden Custom Title' },
    });
    assert.equal(res2.statusCode, 201);
    assert.equal(JSON.parse(res2.payload).data.post.title, 'Overridden Custom Title');
  });

  // =========================================================================
  // 2. AUTHORIZATION & RBAC
  // =========================================================================

  await test('10. Cross-user promotion rejected with HTTP 403 CROSS_USER_PROMOTION_FORBIDDEN', async () => {
    const history = await createReelHistory(editor.id, createValidReelOutput());

    // Owner attempts to promote editor's history
    const resOwner = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {},
    });
    assert.equal(resOwner.statusCode, 403);
    assert.ok(JSON.parse(resOwner.payload).message.includes('CROSS_USER_PROMOTION_FORBIDDEN'));

    // Admin attempts to promote editor's history
    const resAdmin = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: adminCookie, origin: frontendOrigin },
      payload: {},
    });
    assert.equal(resAdmin.statusCode, 403);
    assert.ok(JSON.parse(resAdmin.payload).message.includes('CROSS_USER_PROMOTION_FORBIDDEN'));
  });

  await test('11. APPROVER and ANALYST blocked by route guard (HTTP 403 Forbidden)', async () => {
    const approverHistory = await createReelHistory(approver.id, createValidReelOutput());
    const resApprover = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${approverHistory.id}/save-to-draft`,
      headers: { cookie: approverCookie, origin: frontendOrigin },
      payload: {},
    });
    assert.equal(resApprover.statusCode, 403);

    const analystHistory = await createReelHistory(analyst.id, createValidReelOutput());
    const resAnalyst = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${analystHistory.id}/save-to-draft`,
      headers: { cookie: analystCookie, origin: frontendOrigin },
      payload: {},
    });
    assert.equal(resAnalyst.statusCode, 403);
  });

  // =========================================================================
  // 3. IDEMPOTENCY & CONCURRENCY
  // =========================================================================

  await test('12. Already-promoted history rejected with HTTP 409 DRAFT_ALREADY_EXISTS', async () => {
    const history = await createReelHistory(editor.id, createValidReelOutput());

    // First promotion succeeds
    const res1 = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });
    assert.equal(res1.statusCode, 201);

    // Second promotion fails with 409
    const res2 = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });
    assert.equal(res2.statusCode, 409);
    assert.ok(JSON.parse(res2.payload).message.includes('DRAFT_ALREADY_EXISTS'));
  });

  await test('13. Concurrent promotion requests: exactly one 201 and one 409 conflict', async () => {
    const history = await createReelHistory(editor.id, createValidReelOutput({ title: 'Unique Title For Concurrency Test' }));

    // Send two concurrent promotion requests for the same history record
    const [resA, resB] = await Promise.all([
      server.inject({
        method: 'POST',
        url: `/api/v1/ai/history/${history.id}/save-to-draft`,
        headers: { cookie: editorCookie, origin: frontendOrigin },
        payload: {},
      }),
      server.inject({
        method: 'POST',
        url: `/api/v1/ai/history/${history.id}/save-to-draft`,
        headers: { cookie: editorCookie, origin: frontendOrigin },
        payload: {},
      }),
    ]);

    const statusCodes = [resA.statusCode, resB.statusCode].sort();
    assert.deepEqual(statusCodes, [201, 409], 'One concurrent request must succeed with 201 and the other fail with 409');

    // Confirm in DB that exactly one ContentPost exists
    const posts = await prisma.contentPost.findMany({ where: { title: 'Unique Title For Concurrency Test' } });
    assert.equal(posts.length, 1);
  });

  // =========================================================================
  // 4. VALIDATION & MALFORMED PAYLOADS
  // =========================================================================

  await test('14. Malformed persisted output rejected with HTTP 400 VALIDATION_ERROR', async () => {
    // Malformed: duration is 30s but contains only 1 scene (min is 3)
    const malformedOutput = createValidReelOutput({
      scenes: [
        {
          sceneNumber: 1,
          sceneTitle: 'Single Scene',
          visualDirection: 'Visual',
          voiceover: 'Voiceover',
          durationSeconds: 30,
        },
      ],
    });

    const history = await createReelHistory(editor.id, malformedOutput);

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.payload);
    assert.ok(body.message.includes('VALIDATION_ERROR') || body.error?.includes('VALIDATION_ERROR'));

    // Confirm no post was created
    const refreshed = await prisma.generationHistory.findUnique({ where: { id: history.id } });
    assert.equal(refreshed?.resultingPostId, null);
  });

  // =========================================================================
  // 5. LENGTH BOUNDARIES (10,000 / 10,001 CHARACTERS)
  // =========================================================================

  await test('15. Exactly 10,000 characters accepted with HTTP 201', async () => {
    // Helper to calculate serialized length with function matching history.service.ts
    function calcLength(output: any): number {
      const headerParts: string[] = [
        `# ${output.title.trim()}`,
        `**Topic:** ${output.topic.trim()}`,
        `**Duration:** ${output.duration}s | **Platform:** ${output.platform || 'INSTAGRAM_REELS'}`,
      ];
      if (output.targetAudience?.trim()) {
        headerParts.push(`**Target Audience:** ${output.targetAudience.trim()}`);
      }
      const hookBlock = `### Opening Hook\n> ${output.hook.trim()}`;
      const sceneBlocks = output.scenes.map((s: any) => {
        const lines: string[] = [
          `#### [Scene ${s.sceneNumber}: ${s.sceneTitle.trim()}] (${s.durationSeconds}s)`,
          `> **Visual:** ${s.visualDirection.trim()}`,
          `**Voiceover:** "${s.voiceover.trim()}"`,
        ];
        if (s.onScreenText?.trim()) {
          lines.push(`*On-Screen Text:* \`${s.onScreenText.trim()}\``);
        }
        return lines.join('\n\n');
      });
      const ctaBlock = `### Call to Action\n${output.cta.trim()}`;
      const sections: string[] = [
        headerParts.join('\n\n'),
        hookBlock,
        `### Scene Breakdown\n\n${sceneBlocks.join('\n\n')}`,
        ctaBlock,
      ];
      if (output.suggestedCaption?.trim()) {
        sections.push(`### Suggested Social Caption\n${output.suggestedCaption.trim()}`);
      }
      return sections.join('\n\n---\n\n').length;
    }

    // 90s reel with 12 scenes (valid range 7-13).
    // Total scene duration: 12 * 7 = 84s (valid ±15% window for 90s is 77s-104s).
    // Start with 12 scenes where visualDirection is 250 chars and voiceover is 400 chars.
    const scenes12: any[] = [];
    for (let i = 1; i <= 12; i++) {
      scenes12.push({
        sceneNumber: i,
        sceneTitle: `Scene ${i}`,
        visualDirection: 'V'.repeat(250),
        voiceover: 'W'.repeat(400),
        durationSeconds: 7,
      });
    }

    const test90sReel = {
      title: 'T'.repeat(50),
      topic: 'Topic of the 90s reel testing boundary',
      targetAudience: 'Engineers',
      duration: 90 as const,
      platform: 'INSTAGRAM_REELS' as const,
      hook: 'H'.repeat(100),
      scenes: scenes12,
      cta: 'C'.repeat(50),
    };

    let curLen = calcLength(test90sReel);
    assert.ok(curLen < 10000, `curLen is ${curLen}`);
    let needed = 10000 - curLen;

    // Distribute needed characters across scenes' voiceover so no scene exceeds 1000 chars
    for (let i = 0; i < test90sReel.scenes.length && needed > 0; i++) {
      const room = 900 - test90sReel.scenes[i].voiceover.length;
      const add = Math.min(room, needed);
      test90sReel.scenes[i].voiceover += 'X'.repeat(add);
      needed -= add;
    }

    assert.equal(needed, 0, 'Must distribute all needed characters');
    assert.equal(calcLength(test90sReel), 10000);

    const history = await createReelHistory(editor.id, test90sReel, { topic: test90sReel.topic, duration: 90 });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201, `Expected 201 for exactly 10,000 characters (got ${res.statusCode}: ${res.payload})`);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.post.caption.length, 10000);
  });

  await test('16. Exactly 10,001 characters rejected with HTTP 400 REEL_SCRIPT_CONTENT_TOO_LONG', async () => {
    function calcLength(output: any): number {
      const headerParts: string[] = [
        `# ${output.title.trim()}`,
        `**Topic:** ${output.topic.trim()}`,
        `**Duration:** ${output.duration}s | **Platform:** ${output.platform || 'INSTAGRAM_REELS'}`,
      ];
      if (output.targetAudience?.trim()) {
        headerParts.push(`**Target Audience:** ${output.targetAudience.trim()}`);
      }
      const hookBlock = `### Opening Hook\n> ${output.hook.trim()}`;
      const sceneBlocks = output.scenes.map((s: any) => {
        const lines: string[] = [
          `#### [Scene ${s.sceneNumber}: ${s.sceneTitle.trim()}] (${s.durationSeconds}s)`,
          `> **Visual:** ${s.visualDirection.trim()}`,
          `**Voiceover:** "${s.voiceover.trim()}"`,
        ];
        if (s.onScreenText?.trim()) {
          lines.push(`*On-Screen Text:* \`${s.onScreenText.trim()}\``);
        }
        return lines.join('\n\n');
      });
      const ctaBlock = `### Call to Action\n${output.cta.trim()}`;
      const sections: string[] = [
        headerParts.join('\n\n'),
        hookBlock,
        `### Scene Breakdown\n\n${sceneBlocks.join('\n\n')}`,
        ctaBlock,
      ];
      return sections.join('\n\n---\n\n').length;
    }

    const scenes12: any[] = [];
    for (let i = 1; i <= 12; i++) {
      scenes12.push({
        sceneNumber: i,
        sceneTitle: `Scene ${i}`,
        visualDirection: 'V'.repeat(250),
        voiceover: 'W'.repeat(400),
        durationSeconds: 7,
      });
    }

    const test90sReel = {
      title: 'T'.repeat(50),
      topic: 'Topic of the 90s reel testing boundary overflow',
      targetAudience: 'Engineers',
      duration: 90 as const,
      platform: 'INSTAGRAM_REELS' as const,
      hook: 'H'.repeat(100),
      scenes: scenes12,
      cta: 'C'.repeat(50),
    };

    let curLen = calcLength(test90sReel);
    let needed = 10001 - curLen;

    for (let i = 0; i < test90sReel.scenes.length && needed > 0; i++) {
      const room = 900 - test90sReel.scenes[i].voiceover.length;
      const add = Math.min(room, needed);
      test90sReel.scenes[i].voiceover += 'X'.repeat(add);
      needed -= add;
    }

    assert.equal(needed, 0, 'Must distribute all needed characters');
    assert.equal(calcLength(test90sReel), 10001);

    const history = await createReelHistory(editor.id, test90sReel, { topic: test90sReel.topic, duration: 90 });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.payload);
    assert.ok(body.message.includes('REEL_SCRIPT_CONTENT_TOO_LONG'));
  });

  await test('17. No partial writes after validation failure (database remains untouched)', async () => {
    const history = await createReelHistory(editor.id, createValidReelOutput());

    // Submit with invalid custom title (< 3 chars)
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { title: 'AB' },
    });

    assert.equal(res.statusCode, 400);

    // Confirm no post was created
    const postCount = await prisma.contentPost.count({ where: { createdById: editor.id, title: 'AB' } });
    assert.equal(postCount, 0);

    // Confirm history record resultingPostId is still null
    const refreshed = await prisma.generationHistory.findUnique({ where: { id: history.id } });
    assert.equal(refreshed?.resultingPostId, null);
  });

  // =========================================================================
  // 6. TRANSACTION ROLLBACK & AUDIT INTEGRITY
  // =========================================================================

  await test('18. Transaction rollback on audit failure (atomic integrity)', async () => {
    const history = await createReelHistory(editor.id, createValidReelOutput({ title: 'Rollback Test Reel Script' }));

    // Mock ActivityService.log to simulate write failure
    const originalLog = ActivityService.log;
    (ActivityService as any).log = async () => null; // simulates failure returning null

    try {
      const res = await server.inject({
        method: 'POST',
        url: `/api/v1/ai/history/${history.id}/save-to-draft`,
        headers: { cookie: editorCookie, origin: frontendOrigin },
        payload: {},
      });

      assert.equal(res.statusCode, 500);

      // Verify ContentPost was NOT persisted (rolled back)
      const post = await prisma.contentPost.findFirst({ where: { title: 'Rollback Test Reel Script' } });
      assert.equal(post, null, 'ContentPost must be rolled back on audit failure');

      // Verify history was NOT updated
      const refreshedHistory = await prisma.generationHistory.findUnique({ where: { id: history.id } });
      assert.equal(refreshedHistory?.resultingPostId, null, 'resultingPostId must remain null on rollback');
    } finally {
      (ActivityService as any).log = originalLog;
    }
  });

  // =========================================================================
  // 7. UTF-8 & EMOJI PRESERVATION
  // =========================================================================

  await test('19. UTF-8 and emoji preservation across hook, scenes, visual directions, voiceover and CTA', async () => {
    const emojiReel = createValidReelOutput({
      title: '🚀 5 Supercharged React 19 Patterns! 🔥',
      hook: '🔥 Stop doing this in React 19! Here is the future ⚡️',
      scenes: [
        {
          sceneNumber: 1,
          sceneTitle: '⚡️ Server Actions',
          visualDirection: 'Glowing neon terminal with 💻 and 🚀 flying across screen',
          voiceover: 'Server Actions simplify client-server boundaries! ✨',
          onScreenText: 'Server Actions ✨',
          durationSeconds: 5,
        },
        {
          sceneNumber: 2,
          sceneTitle: '🎯 Optimistic Updates',
          visualDirection: 'Split view of UI responding instantly with ⏱️ 0ms latency',
          voiceover: 'useOptimistic gives users instant visual feedback! 🎉',
          onScreenText: 'useOptimistic 🎉',
          durationSeconds: 10,
        },
        {
          sceneNumber: 3,
          sceneTitle: '🛡️ Document Metadata',
          visualDirection: 'Native title and meta tags updating seamlessly in JSX 📑',
          voiceover: 'No more third-party helmets! It is native now 💯',
          onScreenText: 'Native Head Tags 💯',
          durationSeconds: 8,
        },
        {
          sceneNumber: 4,
          sceneTitle: '🎉 Outro & Follow',
          visualDirection: 'Smiley developer pointing to follow badge 👇✨',
          voiceover: 'Which feature are you most excited for? Comment below! 💬',
          onScreenText: 'Comment Below! 💬',
          durationSeconds: 7,
        },
      ],
      cta: 'Double-tap if you love React 19 and share your thoughts! 💖🚀',
      suggestedCaption: 'React 19 is an absolute game-changer! 🚀 Which feature is your favorite? 💬🔥',
      suggestedHashtags: ['#reactjs', '#react19', '#webdev', '#codeculture'],
    });

    const history = await createReelHistory(editor.id, emojiReel);

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.post.title, '🚀 5 Supercharged React 19 Patterns! 🔥');
    assert.ok(body.data.post.caption.includes('🔥 Stop doing this in React 19! Here is the future ⚡️'));
    assert.ok(body.data.post.caption.includes('Glowing neon terminal with 💻 and 🚀 flying across screen'));
    assert.ok(body.data.post.caption.includes('Double-tap if you love React 19 and share your thoughts! 💖🚀'));
    assert.equal(body.data.post.cta, 'Double-tap if you love React 19 and share your thoughts! 💖🚀');

    // Verify DB post contains pristine emojis without corruption
    const dbPost = await prisma.contentPost.findUnique({ where: { id: body.data.post.id } });
    assert.equal(dbPost?.title, '🚀 5 Supercharged React 19 Patterns! 🔥');
    assert.ok(dbPost?.caption.includes('💻 and 🚀'));
    assert.equal(dbPost?.cta, 'Double-tap if you love React 19 and share your thoughts! 💖🚀');
  });

  // =========================================================================
  // 8. REGRESSION: CTA AND HASHTAGS REMAIN UNSUPPORTED
  // =========================================================================

  await test('20. Regression: CTA and HASHTAGS continue to return HTTP 422 SAVE_TO_DRAFT_UNSUPPORTED', async () => {
    const ctaHistory = await prisma.generationHistory.create({
      data: {
        userId: editor.id,
        generationType: AIGenerationType.CTA,
        model: 'qwen2.5:3b',
        durationMs: 100,
        inputPayload: { goal: 'Test CTA' },
        outputPayload: { ctas: ['CTA 1', 'CTA 2', 'CTA 3'] },
      },
    });

    const resCta = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${ctaHistory.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });
    assert.equal(resCta.statusCode, 422);

    const hashtagHistory = await prisma.generationHistory.create({
      data: {
        userId: editor.id,
        generationType: AIGenerationType.HASHTAGS,
        model: 'qwen2.5:3b',
        durationMs: 100,
        inputPayload: { content: 'Test Hashtags' },
        outputPayload: { hashtags: ['#tag1', '#tag2', '#tag3', '#tag4', '#tag5', '#tag6', '#tag7', '#tag8', '#tag9', '#tag10'] },
      },
    });

    const resHashtags = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${hashtagHistory.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });
    assert.equal(resHashtags.statusCode, 422);
  });

  console.log('\n======================================================');
  console.log(`  Reel Draft Tests Completed: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runReelDraftTests().catch((err) => {
  console.error('\n❌ Reel draft test runner encountered fatal error:');
  console.error(err);
  process.exit(1);
});
