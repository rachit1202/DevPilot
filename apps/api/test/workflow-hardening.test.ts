import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buildServer } from '../src/server';
import { prisma } from '../src/db/prisma';
import { MediaService } from '../src/modules/media/media.service';
import { UserRole, PostStatus, ApprovalStatus, ContentType, ContentCategory } from '@devpilot/shared';

function buildMultipartPayload(filename: string, contentType: string, fileBuffer: Buffer) {
  const boundary = '----WebKitFormBoundaryHardening123';
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
  );
  const postfix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([prefix, fileBuffer, postfix]);
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload: body,
  };
}

const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
  0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
  0x42, 0x60, 0x82,
]);

async function runHardeningTests() {
  console.log('\n======================================================');
  console.log('  DevPilot Milestone 1.4.2: Security & Workflow Tests');
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

  // Helper to login and get cookie
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

  // 1. Authenticate Owner
  const ownerCookie = await loginAs(ownerEmail, ownerPassword);

  // 2. Setup or retrieve Editor user
  const editorEmail = 'editor.test@codeculture.dev';
  const editorPassword = 'SecureEditor123!';
  let editorUser = await prisma.user.findUnique({ where: { email: editorEmail } });
  if (!editorUser) {
    const passwordHash = await bcrypt.hash(editorPassword, 10);
    editorUser = await prisma.user.create({
      data: {
        email: editorEmail,
        name: 'Test Editor',
        passwordHash,
        role: UserRole.EDITOR,
      },
    });
  }
  const editorCookie = await loginAs(editorEmail, editorPassword);

  // 3. Setup or retrieve Analyst user
  const analystEmail = 'analyst.test@codeculture.dev';
  const analystPassword = 'SecureAnalyst123!';
  let analystUser = await prisma.user.findUnique({ where: { email: analystEmail } });
  if (!analystUser) {
    const passwordHash = await bcrypt.hash(analystPassword, 10);
    analystUser = await prisma.user.create({
      data: {
        email: analystEmail,
        name: 'Test Analyst',
        passwordHash,
        role: UserRole.ANALYST,
      },
    });
  }
  const analystCookie = await loginAs(analystEmail, analystPassword);

  // Shared test post ID
  let editorPostId = '';
  let ownerPostId = '';

  // Setup: Create a post by Editor
  const createEditorPostRes = await server.inject({
    method: 'POST',
    url: '/api/v1/content',
    headers: { cookie: editorCookie, origin: frontendOrigin },
    payload: {
      title: 'Editor Original Post',
      caption: 'Initial post caption authored by editor',
      contentType: ContentType.SINGLE_IMAGE,
      category: ContentCategory.WEB_DEV_TIPS,
    },
  });
  assert.equal(createEditorPostRes.statusCode, 201);
  editorPostId = JSON.parse(createEditorPostRes.body).data.post.id;

  // Setup: Create a post by Owner
  const createOwnerPostRes = await server.inject({
    method: 'POST',
    url: '/api/v1/content',
    headers: { cookie: ownerCookie, origin: frontendOrigin },
    payload: {
      title: 'Owner Protected Post',
      caption: 'Authoritative post authored by owner',
      contentType: ContentType.CODE_TIP,
      category: ContentCategory.DEVELOPER_LIFE,
    },
  });
  assert.equal(createOwnerPostRes.statusCode, 201);
  ownerPostId = JSON.parse(createOwnerPostRes.body).data.post.id;

  // =========================================================================
  // 1. Direct APPROVED transition rejected through PATCH
  // =========================================================================
  await test('1. Direct APPROVED transition rejected through standard PATCH (400 Bad Request)', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/content/${editorPostId}`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { status: PostStatus.APPROVED },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.message, /Direct transition to APPROVED via content update is forbidden/i);

    // Verify post status is still DRAFT
    const post = await prisma.contentPost.findUnique({ where: { id: editorPostId } });
    assert.equal(post?.status, PostStatus.DRAFT);
  });

  // =========================================================================
  // 2. Direct SCHEDULED transition rejected through PATCH
  // =========================================================================
  await test('2. Direct SCHEDULED transition rejected through standard PATCH (400 Bad Request)', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/content/${editorPostId}`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { status: PostStatus.SCHEDULED },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.message, /Direct transition to SCHEDULED via content update is forbidden/i);
  });

  // =========================================================================
  // 3. Direct PUBLISHED transition rejected through PATCH
  // =========================================================================
  await test('3. Direct PUBLISHED transition rejected through standard PATCH (400 Bad Request)', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/content/${editorPostId}`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { status: PostStatus.PUBLISHED },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.message, /Direct transition to PUBLISHED via content update is forbidden/i);
  });

  // =========================================================================
  // 4. Authorized reviewer can approve content
  // =========================================================================
  await test('4. Authorized reviewer (Owner) can approve content via POST /content/:id/approve (200 OK)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/content/${editorPostId}/approve`,
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { comment: 'High quality post, approved for publication.' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.post.status, PostStatus.APPROVED);
    assert.equal(body.data.post.approval.status, ApprovalStatus.APPROVED);
    assert.equal(body.data.post.approval.comment, 'High quality post, approved for publication.');
  });

  // =========================================================================
  // 5. Unauthorized editor cannot approve content
  // =========================================================================
  await test('5. Unauthorized editor cannot approve content (403 Forbidden)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/content/${editorPostId}/approve`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { comment: 'Self approval attempt' },
    });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.match(body.message, /You do not have permission|Only authorized reviewers/i);
  });

  // =========================================================================
  // 6. Authorized reviewer can reject content
  // =========================================================================
  await test('6. Authorized reviewer can reject content via POST /content/:id/reject (200 OK)', async () => {
    // Create a temporary post to reject
    const tempPost = await prisma.contentPost.create({
      data: {
        title: 'Draft to Reject',
        caption: 'Needs more technical details',
        status: PostStatus.DRAFT,
        createdById: editorUser.id,
        brandSettingsId: (await prisma.brandSettings.findFirst())!.id,
      },
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/content/${tempPost.id}/reject`,
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: { comment: 'Please expand on section 2 before re-submitting.' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.post.status, PostStatus.REJECTED);
    assert.equal(body.data.post.approval.status, ApprovalStatus.REJECTED);

    await prisma.contentPost.delete({ where: { id: tempPost.id } });
  });

  // =========================================================================
  // 7. Editing approved content invalidates its previous approval
  // =========================================================================
  await test('7. Editing approved content invalidates approval and reverts status to DRAFT', async () => {
    // editorPostId is currently APPROVED from Test 4
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/content/${editorPostId}`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { caption: 'Updated caption after approval: modifying text triggers re-review.' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.post.status, PostStatus.DRAFT, 'Post status should revert to DRAFT upon modification');

    // Verify APPROVAL_INVALIDATED activity log was created
    const log = await prisma.activityLog.findFirst({
      where: {
        action: 'APPROVAL_INVALIDATED',
        entityId: editorPostId,
      },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(log, 'APPROVAL_INVALIDATED log must exist');
    assert.equal(log.entityType, 'CONTENT_POST');
  });

  // =========================================================================
  // 8. Approval records are created correctly
  // =========================================================================
  await test('8. Approval records store reviewer, requestedBy, status, and timestamp correctly', async () => {
    const approvals = await prisma.approval.findMany({
      where: { contentPostId: editorPostId },
      include: { reviewedBy: true, requestedBy: true },
    });
    assert.ok(approvals.length > 0);
    const latest = approvals[approvals.length - 1];
    assert.equal(latest.requestedById, editorUser.id);
    assert.ok(latest.reviewedById);
    assert.ok(latest.reviewedAt);
    assert.equal(latest.status, ApprovalStatus.APPROVED);
  });

  // =========================================================================
  // 9. Failed approval transaction does not leave inconsistent status
  // =========================================================================
  await test('9. Attempting to approve an already published or archived post returns 400 and preserves state', async () => {
    // Manually create an archived post
    const archivedPost = await prisma.contentPost.create({
      data: {
        title: 'Archived Post',
        caption: 'This post is archived',
        status: PostStatus.ARCHIVED,
        createdById: editorUser.id,
        brandSettingsId: (await prisma.brandSettings.findFirst())!.id,
      },
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/content/${archivedPost.id}/approve`,
      headers: { cookie: ownerCookie, origin: frontendOrigin },
      payload: {},
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.message, /Cannot approve a post that is already archived/i);

    const check = await prisma.contentPost.findUnique({ where: { id: archivedPost.id } });
    assert.equal(check?.status, PostStatus.ARCHIVED);

    await prisma.contentPost.delete({ where: { id: archivedPost.id } });
  });

  // =========================================================================
  // 10. Editor cannot modify another user's post
  // =========================================================================
  await test('10. Editor cannot modify another user\'s post (403 Forbidden)', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/content/${ownerPostId}`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { title: 'Compromised Title Attempt' },
    });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.match(body.message, /You do not have permission to modify content created by another user/i);
  });

  // =========================================================================
  // 11. Editor cannot delete another user's post
  // =========================================================================
  await test('11. Editor cannot delete another user\'s post (403 Forbidden)', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/content/${ownerPostId}`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
    });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.match(body.message, /You do not have permission to delete content created by another user/i);

    // Verify owner post was NOT deleted
    const post = await prisma.contentPost.findUnique({ where: { id: ownerPostId } });
    assert.ok(post);
  });

  // =========================================================================
  // 12. Editor can modify their own post
  // =========================================================================
  await test('12. Editor can modify their own post (200 OK)', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/content/${editorPostId}`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
      payload: { title: 'Editor Updated Their Own Post' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.post.title, 'Editor Updated Their Own Post');
  });

  // =========================================================================
  // 13. Analyst cannot modify or delete content
  // =========================================================================
  await test('13. Analyst cannot create, modify, or delete content (403 Forbidden)', async () => {
    // Attempt Create
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/content',
      headers: { cookie: analystCookie, origin: frontendOrigin },
      payload: {
        title: 'Analyst Create Attempt',
        caption: 'This should fail with 403',
      },
    });
    assert.equal(createRes.statusCode, 403);

    // Attempt Modify
    const patchRes = await server.inject({
      method: 'PATCH',
      url: `/api/v1/content/${editorPostId}`,
      headers: { cookie: analystCookie, origin: frontendOrigin },
      payload: { title: 'Analyst Modify Attempt' },
    });
    assert.equal(patchRes.statusCode, 403);

    // Attempt Delete
    const deleteRes = await server.inject({
      method: 'DELETE',
      url: `/api/v1/content/${editorPostId}`,
      headers: { cookie: analystCookie, origin: frontendOrigin },
    });
    assert.equal(deleteRes.statusCode, 403);
  });

  // =========================================================================
  // 14. Non-owner cannot delete shared media
  // =========================================================================
  let testAssetId = '';
  await test('14. Non-owner/non-admin (Editor/Analyst) cannot delete media assets (403 Forbidden)', async () => {
    // Upload an asset as Owner
    const multipart = buildMultipartPayload('perm-test.png', 'image/png', VALID_PNG_BUFFER);
    const uploadRes = await server.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: {
        cookie: ownerCookie,
        origin: frontendOrigin,
        'content-type': multipart.contentType,
      },
      payload: multipart.payload,
    });
    assert.equal(uploadRes.statusCode, 201);
    testAssetId = JSON.parse(uploadRes.body).data.asset.id;

    // Editor attempt delete
    const editorDelRes = await server.inject({
      method: 'DELETE',
      url: `/api/v1/media/${testAssetId}`,
      headers: { cookie: editorCookie, origin: frontendOrigin },
    });
    assert.equal(editorDelRes.statusCode, 403);

    // Analyst attempt delete
    const analystDelRes = await server.inject({
      method: 'DELETE',
      url: `/api/v1/media/${testAssetId}`,
      headers: { cookie: analystCookie, origin: frontendOrigin },
    });
    assert.equal(analystDelRes.statusCode, 403);

    // Verify asset still exists
    const check = await prisma.mediaAsset.findUnique({ where: { id: testAssetId } });
    assert.ok(check);
  });

  // =========================================================================
  // 15. Owner/Admin can delete media
  // =========================================================================
  await test('15. Owner/Admin can delete unlinked media asset (200 OK)', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/media/${testAssetId}`,
      headers: { cookie: ownerCookie, origin: frontendOrigin },
    });
    assert.equal(res.statusCode, 200);

    const check = await prisma.mediaAsset.findUnique({ where: { id: testAssetId } });
    assert.equal(check, null);
  });

  // =========================================================================
  // 16. Forced deletion logs affected post IDs and forced flag
  // =========================================================================
  await test('16. Forced deletion unlinks posts and logs unlinked post IDs, titles, and forced: true in ActivityLog', async () => {
    // 1. Upload asset
    const multipart = buildMultipartPayload('force-log-test.png', 'image/png', VALID_PNG_BUFFER);
    const uploadRes = await server.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: {
        cookie: ownerCookie,
        origin: frontendOrigin,
        'content-type': multipart.contentType,
      },
      payload: multipart.payload,
    });
    const asset = JSON.parse(uploadRes.body).data.asset;

    // 2. Link asset to owner post
    await prisma.contentMedia.create({
      data: {
        contentPostId: ownerPostId,
        mediaAssetId: asset.id,
        position: 0,
      },
    });

    // 3. Forced delete by Owner
    const deleteRes = await server.inject({
      method: 'DELETE',
      url: `/api/v1/media/${asset.id}?force=true`,
      headers: { cookie: ownerCookie, origin: frontendOrigin },
    });
    assert.equal(deleteRes.statusCode, 200);

    // 4. Verify ActivityLog
    const log = await prisma.activityLog.findFirst({
      where: {
        action: 'MEDIA_DELETED',
        entityId: asset.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(log);
    const meta = log.metadata as Record<string, unknown>;
    assert.equal(meta.forced, true);
    assert.ok(Array.isArray(meta.unlinkedPostIds));
    assert.ok((meta.unlinkedPostIds as string[]).includes(ownerPostId));
    assert.ok((meta.unlinkedPostTitles as string[]).length > 0);
  });

  // =========================================================================
  // 17. Existing authentication and CSRF protections remain intact
  // =========================================================================
  await test('17. Existing authentication and CSRF protections remain fully intact', async () => {
    // Malicious Origin with cookie -> 403 Forbidden
    const csrfRes = await server.inject({
      method: 'POST',
      url: '/api/v1/content',
      headers: {
        cookie: ownerCookie,
        origin: 'http://malicious-site.com',
      },
      payload: {
        title: 'CSRF Attack',
        caption: 'This should be blocked by CSRF guard',
      },
    });
    assert.equal(csrfRes.statusCode, 403);

    // Unauthenticated request to /content -> 401 Unauthorized
    const unauthRes = await server.inject({
      method: 'GET',
      url: '/api/v1/content',
    });
    assert.equal(unauthRes.statusCode, 401);
  });

  // Cleanup test posts and test users
  await prisma.contentPost.deleteMany({ where: { id: { in: [editorPostId, ownerPostId] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [editorUser.id, analystUser.id] } } }).catch(() => {});

  console.log('\n----------------------------------------');
  console.log(`  Hardening Tests completed: 17 total`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('----------------------------------------\n');

  await server.close();
  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runHardeningTests().catch((err) => {
  console.error('Hardening test execution error:', err);
  process.exit(1);
});
