import assert from 'node:assert/strict';
import { buildServer } from '../src/server';
import { prisma } from '../src/db/prisma';
import { UserRole, AIGenerationType, PostStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

async function runSaveToDraftTests() {
  console.log('\n======================================================');
  console.log('  DevPilot M2.2.2.3: Save-to-Draft Integration Tests  ');
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

  // Ensure test users across all 5 roles
  const owner = await ensureUser('owner.draft@codeculture.dev', 'Draft Owner', UserRole.OWNER);
  const admin = await ensureUser('admin.draft@codeculture.dev', 'Draft Admin', UserRole.ADMIN);
  const editor = await ensureUser('editor.draft@codeculture.dev', 'Draft Editor', UserRole.EDITOR);
  const approver = await ensureUser('approver.draft@codeculture.dev', 'Draft Approver', UserRole.APPROVER);
  const analyst = await ensureUser('analyst.draft@codeculture.dev', 'Draft Analyst', UserRole.ANALYST);

  // Helper to login and get session cookie
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
        tagline: 'Local-first developer content engine',
        toneOfVoice: 'Informative, concise, developer-centric',
        targetAudience: 'Software engineers & tech founders',
      },
    });
  }

  // Cleanup past test data for these users
  const testUserIds = [owner.id, admin.id, editor.id, approver.id, analyst.id];
  await prisma.contentPost.deleteMany({ where: { createdById: { in: testUserIds } } });
  await prisma.generationHistory.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.activityLog.deleteMany({
    where: { action: 'CONTENT_DRAFT_CREATED_FROM_AI' },
  });

  // Helper to create test history records
  async function createHistoryRecord(
    userId: string,
    generationType: AIGenerationType,
    outputPayload: any,
    inputPayload: any = { topic: 'Testing Save-to-Draft' }
  ) {
    return await prisma.generationHistory.create({
      data: {
        userId,
        generationType,
        inputPayload,
        outputPayload,
        model: 'qwen2.5:3b',
        durationMs: 150,
      },
    });
  }

  // =========================================================================
  // 1. GENERATION-TYPE MAPPING & PROMOTION
  // =========================================================================

  await test('1. CAPTION: Successful promotion maps title, hook+caption, hashtags, and cta', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.CAPTION, {
      title: 'Mastering TypeScript Generics',
      hook: 'Stop writing any in your TypeScript code!',
      caption: 'Generics allow you to create reusable and type-safe components. Here is how to use them effectively.',
      hashtags: ['#typescript', '#webdev', '#coding'],
      cta: 'Follow @CodeCulture for daily engineering tips!',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.data.post.title, 'Mastering TypeScript Generics');
    assert.equal(
      body.data.post.caption,
      'Stop writing any in your TypeScript code!\n\nGenerics allow you to create reusable and type-safe components. Here is how to use them effectively.'
    );
    assert.deepEqual(body.data.post.hashtags, ['#typescript', '#webdev', '#coding']);
    assert.equal(body.data.post.cta, 'Follow @CodeCulture for daily engineering tips!');
    assert.equal(body.data.post.status, 'DRAFT');
    assert.equal(body.data.post.sourceType, 'AI_GENERATED');
    assert.equal(body.data.post.createdById, editor.id);
    assert.equal(body.data.history.resultingPostId, body.data.post.id);

    // Verify DB state
    const dbHistory = await prisma.generationHistory.findUnique({ where: { id: history.id } });
    assert.equal(dbHistory?.resultingPostId, body.data.post.id);
  });

  await test('2. IDEAS: Successful promotion with selectedIdeaIndex 0', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.IDEAS, {
      ideas: [
        {
          title: 'Dockerizing Next.js 15',
          concept: 'Step-by-step guide on multi-stage builds with standalone output.',
          suggestedFormat: 'CAROUSEL',
          angle: 'Practical guide',
        },
        {
          title: 'React Server Actions vs API Routes',
          concept: 'Comprehensive performance comparison in high-traffic apps.',
          suggestedFormat: 'SINGLE_IMAGE',
          angle: 'Comparison',
        },
        {
          title: 'PostgreSQL Row Locking in Node.js',
          concept: 'How SELECT FOR UPDATE protects financial transactions.',
          suggestedFormat: 'CODE_TIP',
          angle: 'Deep dive',
        },
      ],
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { selectedIdeaIndex: 0 },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.post.title, 'Dockerizing Next.js 15');
    assert.equal(body.data.post.caption, 'Step-by-step guide on multi-stage builds with standalone output.');
    assert.equal(body.data.post.contentType, 'CAROUSEL');
    assert.deepEqual(body.data.post.hashtags, []);
    assert.equal(body.data.post.cta, null);
  });

  await test('3. IDEAS: Successful promotion with selectedIdeaIndex 2', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.IDEAS, {
      ideas: [
        { title: 'Idea 1', concept: 'Concept 1 for testing purposes', suggestedFormat: 'POST', angle: 'A1' },
        { title: 'Idea 2', concept: 'Concept 2 for testing purposes', suggestedFormat: 'POST', angle: 'A2' },
        { title: 'Idea 3', concept: 'Concept 3 for testing purposes', suggestedFormat: 'CODE_TIP', angle: 'A3' },
      ],
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { selectedIdeaIndex: 2 },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.post.title, 'Idea 3');
    assert.equal(body.data.post.caption, 'Concept 3 for testing purposes');
    assert.equal(body.data.post.contentType, 'CODE_TIP');
  });

  await test('4. IDEAS: Fails with 400 if selectedIdeaIndex is missing', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.IDEAS, {
      ideas: [
        { title: 'Idea 1', concept: 'Concept 1', suggestedFormat: 'POST', angle: 'A1' },
        { title: 'Idea 2', concept: 'Concept 2', suggestedFormat: 'POST', angle: 'A2' },
        { title: 'Idea 3', concept: 'Concept 3', suggestedFormat: 'POST', angle: 'A3' },
      ],
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, false);
  });

  await test('5. IDEAS: Fails with 400 if selectedIdeaIndex is out of range (< 0 or > 2)', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.IDEAS, {
      ideas: [
        { title: 'Idea 1', concept: 'Concept 1', suggestedFormat: 'POST', angle: 'A1' },
        { title: 'Idea 2', concept: 'Concept 2', suggestedFormat: 'POST', angle: 'A2' },
        { title: 'Idea 3', concept: 'Concept 3', suggestedFormat: 'POST', angle: 'A3' },
      ],
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { selectedIdeaIndex: 3 },
    });

    assert.equal(res.statusCode, 400);
  });

  await test('6. REWRITE: Successful promotion with user-supplied title and rewrittenText as caption', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.REWRITE, {
      rewrittenText: 'Here is the polished and professional version of your architectural proposal.',
      mode: 'REWRITE',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { title: 'Clean Architecture Proposal' },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.post.title, 'Clean Architecture Proposal');
    assert.equal(body.data.post.caption, 'Here is the polished and professional version of your architectural proposal.');
    assert.deepEqual(body.data.post.hashtags, []);
    assert.equal(body.data.post.cta, null);
  });

  await test('7. REWRITE: Fails with 400 if title is missing or shorter than 3 characters', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.REWRITE, {
      rewrittenText: 'Polished text for testing rewrite promotion without title.',
      mode: 'REWRITE',
    });

    const res1 = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });
    assert.equal(res1.statusCode, 400);

    const res2 = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { title: 'AB' },
    });
    assert.equal(res2.statusCode, 400);
  });

  await test('8. HOOKS: Successful promotion with selected hook, user caption and user title', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.HOOKS, {
      hooks: [
        '99% of developers do not know this Git trick.',
        'Why senior engineers write less code than juniors.',
        'The hidden cost of Microservices nobody talks about.',
        'Stop using console.log for debugging React state!',
        'How we cut AWS bills by 40% with one config change.',
      ],
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {
        selectedHookIndex: 1,
        title: 'Senior Engineer Productivity',
        caption: 'Focusing on architecture, documentation, and automated tests yields far greater business value.',
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.post.title, 'Senior Engineer Productivity');
    assert.equal(
      body.data.post.caption,
      'Why senior engineers write less code than juniors.\n\nFocusing on architecture, documentation, and automated tests yields far greater business value.'
    );
  });

  await test('9. HOOKS: Fails with 400 if selectedHookIndex is missing or invalid', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.HOOKS, {
      hooks: ['Hook 1', 'Hook 2', 'Hook 3', 'Hook 4', 'Hook 5'],
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {
        selectedHookIndex: 5,
        title: 'Valid Title Here',
        caption: 'Valid caption body text here.',
      },
    });

    assert.equal(res.statusCode, 400);
  });

  await test('10. HOOKS: Fails with 400 if user caption is missing or < 5 characters', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.HOOKS, {
      hooks: ['Hook 1', 'Hook 2', 'Hook 3', 'Hook 4', 'Hook 5'],
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {
        selectedHookIndex: 0,
        title: 'Valid Title Here',
        caption: 'Tiny',
      },
    });

    assert.equal(res.statusCode, 400);
  });

  await test('11. CTA: Fails with HTTP 422 SAVE_TO_DRAFT_UNSUPPORTED', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.CTA, {
      ctas: ['Follow for more', 'Subscribe to newsletter', 'Download the cheat sheet'],
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 422);
    const body = JSON.parse(res.payload);
    assert.equal(body.message.includes('SAVE_TO_DRAFT_UNSUPPORTED') || body.error?.includes('SAVE_TO_DRAFT_UNSUPPORTED') || body.message?.includes('Direct Save-to-Draft is not supported'), true);
  });

  await test('12. HASHTAGS: Fails with HTTP 422 SAVE_TO_DRAFT_UNSUPPORTED', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.HASHTAGS, {
      hashtags: ['#webdev', '#coding', '#typescript', '#react', '#nodejs', '#devops', '#fullstack', '#software', '#tech', '#javascript'],
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 422);
    const body = JSON.parse(res.payload);
    assert.equal(body.message.includes('SAVE_TO_DRAFT_UNSUPPORTED') || body.error?.includes('SAVE_TO_DRAFT_UNSUPPORTED') || body.message?.includes('Direct Save-to-Draft is not supported'), true);
  });

  // =========================================================================
  // 2. AUTHORIZATION & RBAC
  // =========================================================================

  await test('13. OWNER: Permitted to promote own history record (HTTP 201)', async () => {
    const history = await createHistoryRecord(owner.id, AIGenerationType.CAPTION, {
      title: 'Owner Post Title',
      hook: 'Owner Hook Line',
      caption: 'Owner Caption Body text for testing.',
      hashtags: ['#owner'],
      cta: 'Follow Owner',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201);
  });

  await test('14. ADMIN: Permitted to promote own history record (HTTP 201)', async () => {
    const history = await createHistoryRecord(admin.id, AIGenerationType.CAPTION, {
      title: 'Admin Post Title',
      hook: 'Admin Hook Line',
      caption: 'Admin Caption Body text for testing.',
      hashtags: ['#admin'],
      cta: 'Follow Admin',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: adminCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201);
  });

  await test('15. EDITOR: Permitted to promote own history record (HTTP 201)', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.CAPTION, {
      title: 'Editor Post Title',
      hook: 'Editor Hook Line',
      caption: 'Editor Caption Body text for testing.',
      hashtags: ['#editor'],
      cta: 'Follow Editor',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201);
  });

  await test('16. APPROVER: Blocked by route guard (HTTP 403 Forbidden)', async () => {
    const history = await createHistoryRecord(approver.id, AIGenerationType.CAPTION, {
      title: 'Approver Post',
      caption: 'Approver Caption',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: approverCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 403);
  });

  await test('17. ANALYST: Blocked by route guard (HTTP 403 Forbidden)', async () => {
    const history = await createHistoryRecord(analyst.id, AIGenerationType.CAPTION, {
      title: 'Analyst Post',
      caption: 'Analyst Caption',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: analystCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 403);
  });

  await test('18. OWNER: Cannot promote another user record (HTTP 403 CROSS_USER_PROMOTION_FORBIDDEN)', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.CAPTION, {
      title: 'Editor Caption For Owner Test',
      hook: 'Hook',
      caption: 'Caption body text',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.payload);
    assert.equal(body.message.includes('CROSS_USER_PROMOTION_FORBIDDEN'), true);
  });

  await test('19. ADMIN: Cannot promote another user record (HTTP 403 CROSS_USER_PROMOTION_FORBIDDEN)', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.CAPTION, {
      title: 'Editor Caption For Admin Test',
      hook: 'Hook',
      caption: 'Caption body text',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: adminCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.payload);
    assert.equal(body.message.includes('CROSS_USER_PROMOTION_FORBIDDEN'), true);
  });

  await test('20. EDITOR: Cannot promote another user record (HTTP 403 CROSS_USER_PROMOTION_FORBIDDEN)', async () => {
    const history = await createHistoryRecord(admin.id, AIGenerationType.CAPTION, {
      title: 'Admin Caption For Editor Test',
      hook: 'Hook',
      caption: 'Caption body text',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.payload);
    assert.equal(body.message.includes('CROSS_USER_PROMOTION_FORBIDDEN'), true);
  });

  await test('21. Unauthenticated request: Denied (HTTP 401 Unauthorized)', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.CAPTION, {
      title: 'Unauthenticated Test',
      caption: 'Caption body',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 401);
  });

  // =========================================================================
  // 3. LIFECYCLE & RE-PROMOTION (DECISION A)
  // =========================================================================

  await test('22. Already-promoted history returns HTTP 409 DRAFT_ALREADY_EXISTS', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.CAPTION, {
      title: 'Duplicate Promotion Test',
      hook: 'Hook',
      caption: 'Caption body text',
    });

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
    const body = JSON.parse(res2.payload);
    assert.equal(body.message.includes('DRAFT_ALREADY_EXISTS'), true);
  });

  await test('23. Deleting linked Draft sets resultingPostId to null via onDelete SetNull', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.CAPTION, {
      title: 'Draft Deletion Cascade Test',
      hook: 'Hook',
      caption: 'Caption body text',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });
    assert.equal(res.statusCode, 201);
    const draftId = JSON.parse(res.payload).data.post.id;

    // Delete the ContentPost
    await prisma.contentPost.delete({ where: { id: draftId } });

    // Verify resultingPostId is now null in database
    const refreshedHistory = await prisma.generationHistory.findUnique({ where: { id: history.id } });
    assert.equal(refreshedHistory?.resultingPostId, null);
  });

  await test('24. Re-promotion after Draft deletion succeeds with HTTP 201 and links new Draft', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.CAPTION, {
      title: 'Re-promotion Test Post',
      hook: 'Hook for re-promotion',
      caption: 'Caption for re-promotion test.',
    });

    // 1. First promotion
    const res1 = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });
    assert.equal(res1.statusCode, 201);
    const draft1Id = JSON.parse(res1.payload).data.post.id;

    // 2. Delete the created Draft
    await prisma.contentPost.delete({ where: { id: draft1Id } });

    // 3. Re-promote the same history record
    const res2 = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });
    assert.equal(res2.statusCode, 201);
    const draft2Id = JSON.parse(res2.payload).data.post.id;
    assert.notEqual(draft1Id, draft2Id);

    // 4. Verify DB link is updated to draft2Id
    const updatedHistory = await prisma.generationHistory.findUnique({ where: { id: history.id } });
    assert.equal(updatedHistory?.resultingPostId, draft2Id);

    // 5. Another immediate promotion fails with 409
    const res3 = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });
    assert.equal(res3.statusCode, 409);
  });

  await test('25. Deleted or non-existent history returns HTTP 404 HISTORY_RECORD_NOT_FOUND', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${fakeId}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.payload);
    assert.equal(body.message.includes('HISTORY_RECORD_NOT_FOUND'), true);
  });

  // =========================================================================
  // 4. TRANSACTION ATOMICITY & POSTGRESQL ROW LOCKING
  // =========================================================================

  await test('26. Concurrency: Two simultaneous requests produce exactly 1 Draft and 1 HTTP 409', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.CAPTION, {
      title: 'Concurrent Race Test Title',
      hook: 'Race Hook',
      caption: 'Race Caption Body Text',
      hashtags: ['#concurrency'],
    });

    // Fire 2 simultaneous requests
    const [res1, res2] = await Promise.all([
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

    const statuses = [res1.statusCode, res2.statusCode].sort();
    assert.deepEqual(statuses, [201, 409], 'Exactly one request must succeed (201) and one must conflict (409)');

    // Verify exactly one ContentPost exists for this title
    const posts = await prisma.contentPost.findMany({
      where: { title: 'Concurrent Race Test Title' },
    });
    assert.equal(posts.length, 1);

    // Verify exactly one ActivityLog entry exists
    const logs = await prisma.activityLog.findMany({
      where: {
        action: 'CONTENT_DRAFT_CREATED_FROM_AI',
        entityId: posts[0].id,
      },
    });
    assert.equal(logs.length, 1);
  });

  await test('27. ActivityLog atomicity: Mandatory audit log is inserted with correct metadata', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.CAPTION, {
      title: 'Audit Logging Verification Post',
      hook: 'Audit Hook',
      caption: 'Audit Caption Body Text',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201);
    const postId = JSON.parse(res.payload).data.post.id;

    const log = await prisma.activityLog.findFirst({
      where: {
        action: 'CONTENT_DRAFT_CREATED_FROM_AI',
        entityId: postId,
      },
    });

    assert.ok(log, 'ActivityLog entry must exist');
    assert.equal(log.entityType, 'CONTENT_POST');
    assert.equal(log.userId, editor.id);
    const meta = log.metadata as any;
    assert.equal(meta.historyId, history.id);
    assert.equal(meta.generationType, 'CAPTION');
    assert.equal(meta.createdPostId, postId);
  });

  await test('28. Data Integrity: ContentPost has status DRAFT, sourceType AI_GENERATED, and no side effects', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.CAPTION, {
      title: 'Integrity Check Post',
      hook: 'Hook Line',
      caption: 'Caption Body Text',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {},
    });

    assert.equal(res.statusCode, 201);
    const postId = JSON.parse(res.payload).data.post.id;

    const post = await prisma.contentPost.findUnique({ where: { id: postId } });
    assert.ok(post);
    assert.equal(post.status, PostStatus.DRAFT);
    assert.equal(post.sourceType, 'AI_GENERATED');
    assert.equal(post.scheduledAt, null);
    assert.equal(post.createdById, editor.id);
    assert.equal(post.brandSettingsId, brand.id);
  });

  await test('29. CSRF Protection: Mutation rejected if origin header is missing', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.CAPTION, {
      title: 'CSRF Check Post',
      hook: 'Hook',
      caption: 'Caption',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie }, // No origin header
      payload: {},
    });

    assert.equal(res.statusCode, 403);
  });

  await test('30. Strict validation: Arbitrary ContentPost fields in request body are rejected (.strict())', async () => {
    const history = await createHistoryRecord(editor.id, AIGenerationType.CAPTION, {
      title: 'Strict Validation Post',
      hook: 'Hook',
      caption: 'Caption',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/ai/history/${history.id}/save-to-draft`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: {
        status: 'PUBLISHED', // Forbidden field
        createdById: '00000000-0000-0000-0000-000000000000', // Forbidden field
      },
    });

    assert.equal(res.statusCode, 400);
  });

  // Cleanup test data
  await prisma.contentPost.deleteMany({ where: { createdById: { in: testUserIds } } });
  await prisma.generationHistory.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.activityLog.deleteMany({
    where: { action: 'CONTENT_DRAFT_CREATED_FROM_AI' },
  });

  await server.close();

  console.log('\n======================================================');
  console.log(`  Tests completed: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSaveToDraftTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
