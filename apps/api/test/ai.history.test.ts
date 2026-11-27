import assert from 'node:assert/strict';
import { buildServer } from '../src/server';
import { prisma } from '../src/db/prisma';
import { UserRole, AIGenerationType } from '@prisma/client';
import bcrypt from 'bcryptjs';

async function runHistoryApiTests() {
  console.log('\n======================================================');
  console.log('  DevPilot M2.2.2.2: AI Generation History & RBAC Tests');
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

  // Create test users for all 5 roles
  const owner = await ensureUser('owner.hist@codeculture.dev', 'History Owner', UserRole.OWNER);
  const admin = await ensureUser('admin.hist@codeculture.dev', 'History Admin', UserRole.ADMIN);
  const editor = await ensureUser('editor.hist@codeculture.dev', 'History Editor', UserRole.EDITOR);
  const approver = await ensureUser('approver.hist@codeculture.dev', 'History Approver', UserRole.APPROVER);
  const analyst = await ensureUser('analyst.hist@codeculture.dev', 'History Analyst', UserRole.ANALYST);

  // Helper to login and get cookie
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

  // Clean previous test records
  const allUserIds = [owner.id, admin.id, editor.id, approver.id, analyst.id];
  await prisma.generationHistory.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.activityLog.deleteMany({
    where: { action: { in: ['AI_HISTORY_CROSS_USER_READ', 'AI_HISTORY_CROSS_USER_DELETE'] } },
  });

  // Seed history records for testing
  const seedRecord = async (userId: string, generationType: AIGenerationType, topic: string) => {
    return prisma.generationHistory.create({
      data: {
        userId,
        generationType,
        inputPayload: { topic },
        outputPayload: { result: `Generated content for ${topic}` },
        model: 'qwen2.5:3b',
        durationMs: 120,
      },
    });
  };

  const ownerRec1 = await seedRecord(owner.id, AIGenerationType.IDEAS, 'Owner Idea 1');
  const ownerRec2 = await seedRecord(owner.id, AIGenerationType.CAPTION, 'Owner Caption 2');
  const adminRec1 = await seedRecord(admin.id, AIGenerationType.HOOKS, 'Admin Hook 1');
  const editorRec1 = await seedRecord(editor.id, AIGenerationType.HASHTAGS, 'Editor Hashtags 1');
  const approverRec1 = await seedRecord(approver.id, AIGenerationType.CTA, 'Approver CTA 1');

  // ==========================================
  // 1. LIST API TESTS & DEFAULT SCOPING
  // ==========================================

  await test('OWNER reads own history by default (no cross-user records)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/history',
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.length, 2);
    assert.ok(json.data.every((r: any) => r.userId === owner.id));
  });

  await test('ADMIN reads own history by default', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/history',
      headers: { cookie: adminCookie },
    });
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].id, adminRec1.id);
  });

  await test('EDITOR reads own history by default', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/history',
      headers: { cookie: editorCookie },
    });
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].id, editorRec1.id);
  });

  await test('APPROVER reads own history by default', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/history',
      headers: { cookie: approverCookie },
    });
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].id, approverRec1.id);
  });

  await test('ANALYST is blocked from reading history (403 Forbidden)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/history',
      headers: { cookie: analystCookie },
    });
    assert.equal(res.statusCode, 403);
  });

  // ==========================================
  // 2. ADMINISTRATIVE CROSS-USER SCOPES
  // ==========================================

  await test('OWNER with allUsers=true succeeds and writes AI_HISTORY_CROSS_USER_READ audit log', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/history?allUsers=true',
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.ok(json.data.length >= 5, 'Should include records across all users');

    const audit = await prisma.activityLog.findFirst({
      where: { action: 'AI_HISTORY_CROSS_USER_READ', userId: owner.id },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(audit, 'Cross-user read must be audited');
    assert.equal((audit.metadata as any).allUsers, true);
  });

  await test('ADMIN with allUsers=true succeeds and writes AI_HISTORY_CROSS_USER_READ audit log', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/history?allUsers=true',
      headers: { cookie: adminCookie },
    });
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.ok(json.data.length >= 5);

    const audit = await prisma.activityLog.findFirst({
      where: { action: 'AI_HISTORY_CROSS_USER_READ', userId: admin.id },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(audit);
  });

  await test('OWNER with targetUserId succeeds and writes audit log', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/ai/history?targetUserId=${editor.id}`,
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].id, editorRec1.id);

    const audit = await prisma.activityLog.findFirst({
      where: { action: 'AI_HISTORY_CROSS_USER_READ', userId: owner.id },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(audit);
    assert.equal((audit.metadata as any).targetUserId, editor.id);
  });

  await test('ADMIN with targetUserId succeeds', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/ai/history?targetUserId=${approver.id}`,
      headers: { cookie: adminCookie },
    });
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].id, approverRec1.id);
  });

  await test('EDITOR with allUsers=true is rejected with 403 Forbidden', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/history?allUsers=true',
      headers: { cookie: editorCookie },
    });
    assert.equal(res.statusCode, 403);
  });

  await test('APPROVER with targetUserId is rejected with 403 Forbidden', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/ai/history?targetUserId=${owner.id}`,
      headers: { cookie: approverCookie },
    });
    assert.equal(res.statusCode, 403);
  });

  await test('Both allUsers=true and targetUserId simultaneously returns 400 Bad Request', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/ai/history?allUsers=true&targetUserId=${editor.id}`,
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 400);
    const json = JSON.parse(res.payload);
    assert.ok(json.message.includes('INVALID_SCOPE_PARAMETERS'));
  });

  await test('Invalid targetUserId UUID format returns 400 Bad Request', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/history?targetUserId=not-a-valid-uuid',
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 400);
  });

  await test('Unknown targetUserId returns 404 Not Found', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/ai/history?targetUserId=${fakeUuid}`,
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 404);
    const json = JSON.parse(res.payload);
    assert.ok(json.message.includes('USER_NOT_FOUND'));
  });

  // ==========================================
  // 3. DETAIL API TESTS
  // ==========================================

  await test('User can read their own history detail', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/ai/history/${editorRec1.id}`,
      headers: { cookie: editorCookie },
    });
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.id, editorRec1.id);
    assert.equal(json.data.generationType, AIGenerationType.HASHTAGS);
  });

  await test('EDITOR reading another user record returns 404 (does not leak existence)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/ai/history/${ownerRec1.id}`,
      headers: { cookie: editorCookie },
    });
    assert.equal(res.statusCode, 404);
  });

  await test('OWNER reading another user record succeeds and logs AI_HISTORY_CROSS_USER_READ', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/ai/history/${editorRec1.id}`,
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);
    assert.equal(json.data.id, editorRec1.id);

    const audit = await prisma.activityLog.findFirst({
      where: { action: 'AI_HISTORY_CROSS_USER_READ', entityId: editorRec1.id },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(audit, 'Cross-user detail read must be audited');
  });

  await test('Invalid detail ID returns 400 Bad Request', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ai/history/invalid-uuid-string',
      headers: { cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 400);
  });

  // ==========================================
  // 4. DELETE API TESTS & ATOMIC AUDIT LOGGING
  // ==========================================

  await test('User can delete their own history record', async () => {
    const toDelete = await seedRecord(editor.id, AIGenerationType.CTA, 'To Delete Own');
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/ai/history/${toDelete.id}`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
    });
    assert.equal(res.statusCode, 200);

    const found = await prisma.generationHistory.findUnique({ where: { id: toDelete.id } });
    assert.equal(found, null);
  });

  await test('EDITOR cannot delete another user history record (404/denied)', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/ai/history/${ownerRec1.id}`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
    });
    assert.equal(res.statusCode, 404);

    const stillExists = await prisma.generationHistory.findUnique({ where: { id: ownerRec1.id } });
    assert.ok(stillExists);
  });

  await test('OWNER can delete another user record with atomic AI_HISTORY_CROSS_USER_DELETE log', async () => {
    const toDeleteCross = await seedRecord(approver.id, AIGenerationType.HOOKS, 'Cross Delete Target');

    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/ai/history/${toDeleteCross.id}`,
      headers: { cookie: ownerCookie, origin: frontendOrigin },
    });
    assert.equal(res.statusCode, 200);

    // Verify deleted
    const found = await prisma.generationHistory.findUnique({ where: { id: toDeleteCross.id } });
    assert.equal(found, null);

    // Verify atomic audit log
    const audit = await prisma.activityLog.findFirst({
      where: { action: 'AI_HISTORY_CROSS_USER_DELETE', entityId: toDeleteCross.id },
    });
    assert.ok(audit, 'Atomic cross-user delete audit record must exist');
    assert.equal(audit.userId, owner.id);
    assert.equal((audit.metadata as any).targetUserId, approver.id);
  });

  await test('Deleting history does NOT delete linked ContentPost', async () => {
    // Create a brand and ContentPost draft
    const brand = await prisma.brandSettings.findFirstOrThrow();
    const post = await prisma.contentPost.create({
      data: {
        title: 'Preserved Draft Post',
        caption: 'This draft must survive history deletion.',
        createdById: owner.id,
        brandSettingsId: brand.id,
      },
    });

    // Create history linked to this post
    const linkedHist = await prisma.generationHistory.create({
      data: {
        userId: owner.id,
        generationType: AIGenerationType.CAPTION,
        inputPayload: { topic: 'Preserved Draft Test' },
        outputPayload: { caption: 'Preserved Draft Post' },
        model: 'qwen2.5:3b',
        durationMs: 100,
        resultingPostId: post.id,
      },
    });

    // Delete the history
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/ai/history/${linkedHist.id}`,
      headers: { cookie: ownerCookie, origin: frontendOrigin },
    });
    assert.equal(res.statusCode, 200);

    // Verify post still exists intact in database!
    const postStillExists = await prisma.contentPost.findUnique({ where: { id: post.id } });
    assert.ok(postStillExists, 'ContentPost must survive history deletion');

    // Cleanup test post
    await prisma.contentPost.delete({ where: { id: post.id } });
  });

  // Cleanup
  await prisma.generationHistory.deleteMany({ where: { userId: { in: allUserIds } } });
  await server.close();

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runHistoryApiTests();
