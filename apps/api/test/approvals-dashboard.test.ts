import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buildServer } from '../src/server';
import { prisma } from '../src/db/prisma';
import { UserRole, PostStatus, ApprovalStatus, ContentType, ContentCategory } from '@devpilot/shared';

async function runApprovalsDashboardTests() {
  console.log('\n======================================================');
  console.log('  DevPilot Milestone 1.7: Approvals & Dashboard Tests');
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
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Error: ${error.message}`);
      failed++;
    }
  }

  const frontendOrigin = 'http://localhost:3000';
  const ownerEmail = 'admin@codeculture.dev';
  const ownerPassword = process.env.INITIAL_OWNER_PASSWORD || 'ChangeMeInLocalDev123!';

  // Helper to authenticate
  async function loginAs(email: string, pass: string): Promise<string> {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: frontendOrigin },
      payload: { email, password: pass },
    });
    assert.equal(res.statusCode, 200, `Login for ${email} should succeed`);
    const cookies = res.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies) ? cookies[0] : (cookies as string);
    return cookieHeader.split(';')[0];
  }

  // 1. Setup test users
  const editorEmail = 'editor-approval-test@codeculture.dev';
  const approverEmail = 'approver-approval-test@codeculture.dev';
  const testPassword = 'Password123!Secure';
  const hashedTestPassword = await bcrypt.hash(testPassword, 10);

  const ownerCookie = await loginAs(ownerEmail, ownerPassword);
  const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });

  const editorUser = await prisma.user.upsert({
    where: { email: editorEmail },
    update: { role: UserRole.EDITOR, passwordHash: hashedTestPassword },
    create: {
      email: editorEmail,
      name: 'Approval Test Editor',
      role: UserRole.EDITOR,
      passwordHash: hashedTestPassword,
    },
  });

  const approverUser = await prisma.user.upsert({
    where: { email: approverEmail },
    update: { role: UserRole.APPROVER, passwordHash: hashedTestPassword },
    create: {
      email: approverEmail,
      name: 'Approval Test Approver',
      role: UserRole.APPROVER,
      passwordHash: hashedTestPassword,
    },
  });

  const editorCookie = await loginAs(editorEmail, testPassword);
  const approverCookie = await loginAs(approverEmail, testPassword);

  // 2. Tests
  await test('1. Editor creates a draft post and submits for review via POST /submit-review', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/content',
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {
        title: 'M1.7 Test Post For Review',
        caption: 'Testing approval workflow submission for review #codeculture',
        contentType: ContentType.TIPS,
        category: ContentCategory.TECH_NEWS,
        tags: ['review', 'workflow'],
      },
    });
    assert.equal(createRes.statusCode, 201);
    const post = JSON.parse(createRes.body).data.post;
    assert.equal(post.status, PostStatus.DRAFT);

    // Submit for review
    const submitRes = await server.inject({
      method: 'POST',
      url: `/api/v1/content/${post.id}/submit-review`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
    });
    assert.equal(submitRes.statusCode, 200);
    const submitted = JSON.parse(submitRes.body).data.post;
    assert.equal(submitted.status, PostStatus.IN_REVIEW);
  });

  await test('2. Approver queries pending approvals and verifies post appears with creator profile', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/approvals/pending?search=M1.7 Test Post For Review',
      headers: { origin: frontendOrigin, cookie: approverCookie },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.data.posts.length >= 1, 'Should find submitted post');
    const target = body.data.posts.find((p: any) => p.title === 'M1.7 Test Post For Review');
    assert.ok(target, 'Target post must exist in pending');
    assert.equal(target.status, PostStatus.IN_REVIEW);
    assert.equal(target.createdBy.name, 'Approval Test Editor');
  });

  await test('3. Editor cannot approve or reject posts (RBAC gate: 403 Forbidden)', async () => {
    const post = await prisma.contentPost.findFirstOrThrow({
      where: { title: 'M1.7 Test Post For Review' },
    });

    const approveRes = await server.inject({
      method: 'POST',
      url: `/api/v1/approvals/${post.id}/approve`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: { comment: 'Editor trying to self-approve' },
    });
    assert.equal(approveRes.statusCode, 403);

    const rejectRes = await server.inject({
      method: 'POST',
      url: `/api/v1/approvals/${post.id}/reject`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: { comment: 'Editor trying to reject' },
    });
    assert.equal(rejectRes.statusCode, 403);
  });

  await test('4. Approver approves post with comment -> status becomes APPROVED, creates Approval record', async () => {
    const post = await prisma.contentPost.findFirstOrThrow({
      where: { title: 'M1.7 Test Post For Review' },
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/approvals/${post.id}/approve`,
      headers: { origin: frontendOrigin, cookie: approverCookie },
      payload: { comment: 'Looks great! Ready to schedule.' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.post.status, PostStatus.APPROVED);

    // Verify DB Approval record
    const approval = await prisma.approval.findFirst({
      where: { contentPostId: post.id },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(approval);
    assert.equal(approval.status, ApprovalStatus.APPROVED);
    assert.equal(approval.reviewedById, approverUser.id);
    assert.equal(approval.comment, 'Looks great! Ready to schedule.');
  });

  await test('5. Rejection flow: Editor creates 2nd post, submits, Approver rejects with required reason', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/content',
      headers: { origin: frontendOrigin, cookie: editorCookie },
      payload: {
        title: 'M1.7 Post To Reject',
        caption: 'Needs more work #draft',
        contentType: ContentType.MEME,
        category: ContentCategory.MEMES,
      },
    });
    assert.equal(createRes.statusCode, 201);
    const post = JSON.parse(createRes.body).data.post;

    // Submit
    const submitRes = await server.inject({
      method: 'POST',
      url: `/api/v1/content/${post.id}/submit-review`,
      headers: { origin: frontendOrigin, cookie: editorCookie },
    });
    assert.equal(submitRes.statusCode, 200);

    // Approver rejects
    const rejectRes = await server.inject({
      method: 'POST',
      url: `/api/v1/approvals/${post.id}/reject`,
      headers: { origin: frontendOrigin, cookie: approverCookie },
      payload: { comment: 'Meme caption is not clear enough. Please revise.' },
    });
    assert.equal(rejectRes.statusCode, 200);
    const body = JSON.parse(rejectRes.body);
    assert.equal(body.data.post.status, PostStatus.REJECTED);

    // Verify DB Approval record
    const approval = await prisma.approval.findFirst({
      where: { contentPostId: post.id },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(approval);
    assert.equal(approval.status, ApprovalStatus.REJECTED);
    assert.equal(approval.comment, 'Meme caption is not clear enough. Please revise.');
  });

  await test('6. Query Approval History returns approved and rejected records with reviewer info', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/approvals/history?page=1&limit=10',
      headers: { origin: frontendOrigin, cookie: approverCookie },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.data.history.length >= 2, 'Should have at least 2 history records');

    const approvedItem = body.data.history.find((a: any) => a.contentPost.title === 'M1.7 Test Post For Review');
    assert.ok(approvedItem);
    assert.equal(approvedItem.status, ApprovalStatus.APPROVED);
    assert.equal(approvedItem.reviewedBy.name, 'Approval Test Approver');

    const rejectedItem = body.data.history.find((a: any) => a.contentPost.title === 'M1.7 Post To Reject');
    assert.ok(rejectedItem);
    assert.equal(rejectedItem.status, ApprovalStatus.REJECTED);
    assert.equal(rejectedItem.comment, 'Meme caption is not clear enough. Please revise.');
  });

  await test('7. Approvals stats endpoint returns accurate counts', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/approvals/stats',
      headers: { origin: frontendOrigin, cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    const stats = body.data.stats;
    assert.equal(typeof stats.pendingCount, 'number');
    assert.equal(typeof stats.approvedCount, 'number');
    assert.equal(typeof stats.rejectedCount, 'number');
    assert.equal(typeof stats.totalPosts, 'number');
    assert.ok(stats.totalPosts >= 2);
  });

  await test('8. Dashboard summary returns real DB aggregates, upcoming schedules, and activity logs', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary',
      headers: { origin: frontendOrigin, cookie: ownerCookie },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);

    const data = body.data;
    assert.ok(data.metrics, 'Metrics object must exist');
    assert.ok(data.metrics.totalPosts > 0, 'Total posts must be > 0');
    assert.equal(typeof data.metrics.draftPosts, 'number');
    assert.equal(typeof data.metrics.inReviewPosts, 'number');
    assert.equal(typeof data.metrics.approvedPosts, 'number');
    assert.equal(typeof data.metrics.scheduledPosts, 'number');
    assert.equal(typeof data.metrics.publishedPosts, 'number');
    assert.equal(typeof data.metrics.rejectedPosts, 'number');

    assert.ok(Array.isArray(data.upcomingSchedules), 'upcomingSchedules must be array');
    assert.ok(Array.isArray(data.recentActivity), 'recentActivity must be array');
    assert.ok(Array.isArray(data.recentPosts), 'recentPosts must be array');

    // Verify recent activity includes our approval events
    const hasApprovalLog = data.recentActivity.some((a: any) =>
      a.action === 'CONTENT_APPROVED' || a.action === 'CONTENT_REJECTED' || a.action === 'CONTENT_SUBMITTED_FOR_REVIEW'
    );
    assert.ok(hasApprovalLog, 'Recent activity should contain recent approval workflow events');
  });

  await test('9. Unauthenticated requests to /approvals and /dashboard are rejected (401)', async () => {
    const unauthAppr = await server.inject({
      method: 'GET',
      url: '/api/v1/approvals/pending',
      headers: { origin: frontendOrigin },
    });
    assert.equal(unauthAppr.statusCode, 401);

    const unauthDash = await server.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary',
      headers: { origin: frontendOrigin },
    });
    assert.equal(unauthDash.statusCode, 401);
  });

  // Cleanup test posts
  await prisma.contentPost.deleteMany({
    where: {
      title: { in: ['M1.7 Test Post For Review', 'M1.7 Post To Reject'] },
    },
  });

  console.log('\n------------------------------------------------------');
  console.log(`  Tests completed: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runApprovalsDashboardTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
