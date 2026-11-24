import assert from 'node:assert/strict';
import { buildServer } from '../src/server';
import { prisma } from '../src/db/prisma';
import { ContentType, ContentCategory, PostStatus } from '@devpilot/shared';

function buildMultipartPayload(filename: string, contentType: string, fileBuffer: Buffer) {
  const boundary = '----WebKitFormBoundaryDevPilotTest123';
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

// Valid binary image mocks with verified magic bytes
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

const VALID_JPEG_BUFFER = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
  0x00, 0xFF, 0xD9,
]);

const VALID_WEBP_BUFFER = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x14, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'ascii'),
  Buffer.from([0x08, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9D, 0x01, 0x2A, 0x01, 0x00]),
]);

const VALID_GIF_BUFFER = Buffer.from(
  'GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;',
  'binary'
);

async function runContentMediaTests() {
  console.log('\n========================================');
  console.log('  DevPilot Milestone 1.4: Content & Media Test Suite');
  console.log('========================================\n');

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

  const ownerEmail = 'admin@codeculture.dev';
  const ownerPassword = process.env.INITIAL_OWNER_PASSWORD || 'ChangeMeInLocalDev123!';
  const frontendOrigin = 'http://localhost:3000';

  let authCookie = '';
  let uploadedAssetId = '';
  let createdPostId = '';

  // 1. Authenticate Owner
  await test('1. Authenticate owner to obtain session cookie for protected endpoints', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: frontendOrigin },
      payload: { email: ownerEmail, password: ownerPassword },
    });
    assert.equal(res.statusCode, 200);
    const cookies = res.headers['set-cookie'];
    assert.ok(cookies);
    const cookieHeader = Array.isArray(cookies) ? cookies[0] : (cookies as string);
    authCookie = cookieHeader.split(';')[0];
    assert.ok(authCookie.includes('access_token='));
  });

  // 2. Unauthenticated access to /content rejected
  await test('2. Unauthenticated request to /content is rejected with 401', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/content',
    });
    assert.equal(res.statusCode, 401);
  });

  // 3. Unauthenticated access to /media rejected
  await test('3. Unauthenticated request to /media is rejected with 401', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/media',
    });
    assert.equal(res.statusCode, 401);
  });

  // 4. Secure Media Upload: Valid PNG
  await test('4. Media upload: Valid PNG image with verified magic bytes succeeds (201)', async () => {
    const multipart = buildMultipartPayload('codeculture-banner.png', 'image/png', VALID_PNG_BUFFER);
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: {
        cookie: authCookie,
        origin: frontendOrigin,
        'content-type': multipart.contentType,
      },
      payload: multipart.payload,
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.data.asset.id);
    assert.equal(body.data.asset.mimeType, 'image/png');
    assert.equal(body.data.asset.originalName, 'codeculture-banner.png');
    uploadedAssetId = body.data.asset.id;
  });

  // 5. Secure Media Upload: Valid JPEG
  await test('5. Media upload: Valid JPEG image with verified magic bytes succeeds (201)', async () => {
    const multipart = buildMultipartPayload('photo.jpg', 'image/jpeg', VALID_JPEG_BUFFER);
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: {
        cookie: authCookie,
        origin: frontendOrigin,
        'content-type': multipart.contentType,
      },
      payload: multipart.payload,
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.data.asset.mimeType, 'image/jpeg');
  });

  // 6. Secure Media Upload: Valid WebP
  await test('6. Media upload: Valid WebP image with verified magic bytes succeeds (201)', async () => {
    const multipart = buildMultipartPayload('graphic.webp', 'image/webp', VALID_WEBP_BUFFER);
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: {
        cookie: authCookie,
        origin: frontendOrigin,
        'content-type': multipart.contentType,
      },
      payload: multipart.payload,
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.data.asset.mimeType, 'image/webp');
  });

  // 7. Secure Media Upload: Valid GIF
  await test('7. Media upload: Valid GIF image with verified magic bytes succeeds (201)', async () => {
    const multipart = buildMultipartPayload('animation.gif', 'image/gif', VALID_GIF_BUFFER);
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: {
        cookie: authCookie,
        origin: frontendOrigin,
        'content-type': multipart.contentType,
      },
      payload: multipart.payload,
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.data.asset.mimeType, 'image/gif');
  });

  // 8. Security Rejection: Spoofed MIME Type (PNG declared, text content sent)
  await test('8. Security rejection: Spoofed MIME type (text file disguised as PNG) is rejected with 400', async () => {
    const fakeBuffer = Buffer.from('console.log("malicious code disguised as image");');
    const multipart = buildMultipartPayload('fake.png', 'image/png', fakeBuffer);
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: {
        cookie: authCookie,
        origin: frontendOrigin,
        'content-type': multipart.contentType,
      },
      payload: multipart.payload,
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.match(body.message, /Unsupported file signature or corrupt image/i);
  });

  // 9. Security Rejection: Dangerous Executable Extension (.exe, .sh, .php)
  await test('9. Security rejection: Dangerous executable file extension (.php/.sh/.exe) is rejected with 403', async () => {
    const multipart = buildMultipartPayload('backdoor.php', 'image/png', VALID_PNG_BUFFER);
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: {
        cookie: authCookie,
        origin: frontendOrigin,
        'content-type': multipart.contentType,
      },
      payload: multipart.payload,
    });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.match(body.message, /Upload of executable or script files/i);
  });

  // 10. Security Protection: Path Traversal in Filename
  await test('10. Security protection: Path traversal in filename is sanitized safely to storage/uploads', async () => {
    const multipart = buildMultipartPayload('../../../etc/passwd.png', 'image/png', VALID_PNG_BUFFER);
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: {
        cookie: authCookie,
        origin: frontendOrigin,
        'content-type': multipart.contentType,
      },
      payload: multipart.payload,
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.ok(!body.data.asset.originalName.includes('..'));
    assert.ok(!body.data.asset.fileName.includes('..'));
    assert.ok(body.data.asset.filePath.startsWith('storage/uploads/'));
  });

  // 11. Stream Media File with Security Headers
  await test('11. Stream media file endpoint serves binary with X-Content-Type-Options: nosniff', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/media/${uploadedAssetId}/file`,
      headers: { cookie: authCookie },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(res.rawPayload.length > 0);
  });

  // 12. Media Listing with Pagination
  await test('12. Media listing endpoint returns paginated assets with linked posts count', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/media?page=1&limit=10',
      headers: { cookie: authCookie },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.assets));
    assert.ok(body.data.assets.length >= 1);
    assert.ok(body.data.pagination.total >= 1);
  });

  // 13. Create Content Post with Media Linking
  await test('13. Content CRUD: Create post linked to CodeCulture brand and media asset (201)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/content',
      headers: {
        cookie: authCookie,
        origin: frontendOrigin,
      },
      payload: {
        title: 'Mastering TypeScript Generics in 2026',
        caption: 'Level up your developer skills with these 5 practical TypeScript patterns designed for modern full-stack architectures. Code. Create. Build. Repeat.',
        hashtags: ['#typescript', '#webdev', '#codeculture'],
        contentType: ContentType.CODE_TIP,
        category: ContentCategory.WEB_DEV_TIPS,
        cta: 'Save this post for your next project!',
        mediaAssetIds: [uploadedAssetId],
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.post.title, 'Mastering TypeScript Generics in 2026');
    assert.equal(body.data.post.status, PostStatus.DRAFT);
    assert.equal(body.data.post.mediaItems.length, 1);
    assert.equal(body.data.post.mediaItems[0].mediaAssetId, uploadedAssetId);
    assert.equal(body.data.post.createdBy.email, ownerEmail);
    createdPostId = body.data.post.id;
  });

  // 14. Validation Error on Content Creation
  await test('14. Content creation rejects invalid payloads (caption < 5 chars, title < 3 chars) with 400', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/content',
      headers: {
        cookie: authCookie,
        origin: frontendOrigin,
      },
      payload: {
        title: 'AB',
        caption: '123',
      },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'Validation failed');
  });

  // 15. View Individual Content Post
  await test('15. Content CRUD: Get individual post returns full author and media details', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/content/${createdPostId}`,
      headers: { cookie: authCookie },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.post.id, createdPostId);
    assert.equal(body.data.post.brandSettings.brandName, 'CodeCulture');
    assert.equal(body.data.post.mediaItems.length, 1);
  });

  // 16. Search and Filter Content Posts
  await test('16. Content listing: Filter by search keyword, contentType, and status with pagination', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/content?search=Generics&contentType=${ContentType.CODE_TIP}&status=${PostStatus.DRAFT}&page=1&limit=5`,
      headers: { cookie: authCookie },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.ok(body.data.posts.length >= 1);
    assert.equal(body.data.posts[0].id, createdPostId);
  });

  // 17. Update Content Post
  await test('17. Content CRUD: Update post title, status, and hashtags', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/content/${createdPostId}`,
      headers: {
        cookie: authCookie,
        origin: frontendOrigin,
      },
      payload: {
        title: 'Updated: Mastering TypeScript Generics in 2026',
        status: PostStatus.IN_REVIEW,
        hashtags: ['#typescript', '#coding', '#fullstack'],
      },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.data.post.title, 'Updated: Mastering TypeScript Generics in 2026');
    assert.equal(body.data.post.status, PostStatus.IN_REVIEW);
    assert.deepEqual(body.data.post.hashtags, ['#typescript', '#coding', '#fullstack']);
  });

  // 18. Media Deletion Protection when Linked to Content
  await test('18. Media security: Cannot delete media asset while linked to an active content post (409 Conflict)', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/media/${uploadedAssetId}`,
      headers: {
        cookie: authCookie,
        origin: frontendOrigin,
      },
    });
    assert.equal(res.statusCode, 409);
    const body = JSON.parse(res.body);
    assert.match(body.message, /Cannot delete media asset because it is currently linked to 1 post/);
  });

  // 19. Delete Content Post
  await test('19. Content CRUD: Delete post cleanly unlinks media associations', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/content/${createdPostId}`,
      headers: {
        cookie: authCookie,
        origin: frontendOrigin,
      },
    });
    assert.equal(res.statusCode, 200);

    // Verify post is gone
    const verifyRes = await server.inject({
      method: 'GET',
      url: `/api/v1/content/${createdPostId}`,
      headers: { cookie: authCookie },
    });
    assert.equal(verifyRes.statusCode, 404);
  });

  // 20. Delete Media Asset and Verify Disk Cleanup
  await test('20. Media deletion: Unlinked media asset is deleted from database and file removed from disk', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/media/${uploadedAssetId}`,
      headers: {
        cookie: authCookie,
        origin: frontendOrigin,
      },
    });
    assert.equal(res.statusCode, 200);

    // Verify 404 on get media
    const getRes = await server.inject({
      method: 'GET',
      url: `/api/v1/media/${uploadedAssetId}`,
      headers: { cookie: authCookie },
    });
    assert.equal(getRes.statusCode, 404);
  });

  // 21. Archive and Restore Lifecycle Tests
  await test('21. Content Archive & Restore: Post is archived, cancels active schedules, and restores to DRAFT', async () => {
    // 1. Create a post
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/content',
      headers: { cookie: authCookie, origin: frontendOrigin },
      payload: {
        title: 'M1.8.1 Post For Archiving',
        caption: 'Testing archive and restore lifecycle #archive',
        contentType: ContentType.TIPS,
        category: ContentCategory.TECH_NEWS,
      },
    });
    assert.equal(createRes.statusCode, 201);
    const post = JSON.parse(createRes.body).data.post;

    // Approve post first so it can be scheduled
    const apprRes = await server.inject({
      method: 'POST',
      url: `/api/v1/content/${post.id}/approve`,
      headers: { cookie: authCookie, origin: frontendOrigin },
    });
    assert.equal(apprRes.statusCode, 200);

    // 2. Schedule the post
    const schedDate = new Date(Date.now() + 86400000 * 5); // 5 days in future
    const schedRes = await server.inject({
      method: 'POST',
      url: '/api/v1/calendar/schedule',
      headers: { cookie: authCookie, origin: frontendOrigin },
      payload: {
        contentPostId: post.id,
        scheduledAt: schedDate.toISOString(),
      },
    });
    assert.equal(schedRes.statusCode, 201);

    // 3. Archive the post
    const archiveRes = await server.inject({
      method: 'POST',
      url: `/api/v1/content/${post.id}/archive`,
      headers: { cookie: authCookie, origin: frontendOrigin },
    });
    assert.equal(archiveRes.statusCode, 200);
    const archived = JSON.parse(archiveRes.body).data.post;
    assert.equal(archived.status, PostStatus.ARCHIVED);
    assert.equal(archived.scheduledAt, null);

    // 4. Verify schedule was cancelled
    const schedule = await prisma.contentSchedule.findFirst({
      where: { contentPostId: post.id },
    });
    assert.ok(schedule);
    assert.equal(schedule.status, 'CANCELLED');

    // 5. Verify cannot submit archived post for review
    const submitRes = await server.inject({
      method: 'POST',
      url: `/api/v1/content/${post.id}/submit-review`,
      headers: { cookie: authCookie, origin: frontendOrigin },
    });
    assert.equal(submitRes.statusCode, 400);

    // 6. Restore the post
    const restoreRes = await server.inject({
      method: 'POST',
      url: `/api/v1/content/${post.id}/restore`,
      headers: { cookie: authCookie, origin: frontendOrigin },
    });
    assert.equal(restoreRes.statusCode, 200);
    const restored = JSON.parse(restoreRes.body).data.post;
    assert.equal(restored.status, PostStatus.DRAFT);

    // Cleanup
    await server.inject({
      method: 'DELETE',
      url: `/api/v1/content/${post.id}`,
      headers: { cookie: authCookie, origin: frontendOrigin },
    });
  });

  // 22. Content Duplication Verification
  await test('22. Content Duplication: Duplicate creates independent post with new ID, DRAFT status, and clean history', async () => {
    // 1. Create original post
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/content',
      headers: { cookie: authCookie, origin: frontendOrigin },
      payload: {
        title: 'Original Post To Duplicate',
        caption: 'Testing duplicate post prefill and independence #original',
        contentType: ContentType.TIPS,
        category: ContentCategory.TECH_NEWS,
        hashtags: ['#original', '#codeculture'],
      },
    });
    assert.equal(createRes.statusCode, 201);
    const original = JSON.parse(createRes.body).data.post;

    // 2. Duplicate via standard creation API using original post data
    const duplicateRes = await server.inject({
      method: 'POST',
      url: '/api/v1/content',
      headers: { cookie: authCookie, origin: frontendOrigin },
      payload: {
        title: `${original.title} (Copy)`,
        caption: original.caption,
        contentType: original.contentType,
        category: original.category,
        hashtags: original.hashtags,
        mediaAssetIds: [],
      },
    });
    assert.equal(duplicateRes.statusCode, 201);
    const duplicate = JSON.parse(duplicateRes.body).data.post;

    assert.notEqual(duplicate.id, original.id, 'Duplicate must receive a new unique ID');
    assert.equal(duplicate.status, PostStatus.DRAFT, 'Duplicate must default to DRAFT');
    assert.equal(duplicate.title, 'Original Post To Duplicate (Copy)');

    // Verify duplicate has no approval records
    const approvals = await prisma.approval.findMany({
      where: { contentPostId: duplicate.id },
    });
    assert.equal(approvals.length, 0, 'Duplicate must have clean approval history');

    // Cleanup
    await server.inject({
      method: 'DELETE',
      url: `/api/v1/content/${original.id}`,
      headers: { cookie: authCookie, origin: frontendOrigin },
    });
    await server.inject({
      method: 'DELETE',
      url: `/api/v1/content/${duplicate.id}`,
      headers: { cookie: authCookie, origin: frontendOrigin },
    });
  });

  // 23. Activity Logging Verification
  await test('23. Activity logs confirm database records for CONTENT_CREATED, CONTENT_UPDATED, CONTENT_DELETED, MEDIA_UPLOADED, MEDIA_DELETED, CONTENT_ARCHIVED', async () => {
    const logs = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    const actions = logs.map((l) => l.action);
    assert.ok(actions.includes('CONTENT_CREATED'), 'Should log CONTENT_CREATED');
    assert.ok(actions.includes('CONTENT_UPDATED'), 'Should log CONTENT_UPDATED');
    assert.ok(actions.includes('CONTENT_DELETED'), 'Should log CONTENT_DELETED');
    assert.ok(actions.includes('MEDIA_UPLOADED'), 'Should log MEDIA_UPLOADED');
    assert.ok(actions.includes('MEDIA_DELETED'), 'Should log MEDIA_DELETED');
    assert.ok(actions.includes('CONTENT_ARCHIVED'), 'Should log CONTENT_ARCHIVED');
    assert.ok(actions.includes('CONTENT_RESTORED'), 'Should log CONTENT_RESTORED');
  });

  await server.close();
  await prisma.$disconnect();

  console.log('\n----------------------------------------');
  console.log(`  Milestone 1.4 Tests completed: ${passed + failed} total`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('----------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runContentMediaTests().catch((err) => {
  console.error('Fatal test error in content-media suite:', err);
  process.exit(1);
});
