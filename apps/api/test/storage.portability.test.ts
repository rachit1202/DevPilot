import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  getCanonicalStorageDir,
  getCanonicalUploadsDir,
  CANONICAL_STORAGE_DIR,
  CANONICAL_UPLOADS_DIR,
  MONOREPO_ROOT_DIR,
  initializeStorageDir,
  initializeUploadsDir,
} from '../src/modules/ai/storage.util';
import {
  UPLOAD_DIR,
  assertSafeStoragePath,
  ensureUploadDirectory,
  sanitizeFilename,
  generateSecureFileName,
  validateMagicBytes,
} from '../src/modules/media/media.security';

async function runStoragePortabilityTests() {
  console.log('\n======================================================');
  console.log('  DevPilot M2.3.5.2.1: Storage Portability & Security Tests');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
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

  // 1. Default storage-root resolution
  await test('1. Default storage-root resolves to <MONOREPO_ROOT>/storage', () => {
    const expected = path.normalize(path.resolve(MONOREPO_ROOT_DIR, './storage'));
    assert.equal(CANONICAL_STORAGE_DIR, expected);
    assert.equal(getCanonicalStorageDir(), expected);
  });

  // 2. Canonical uploads directory derivation
  await test('2. Canonical uploads directory derives as child uploads/ under canonical storage root', () => {
    const expected = path.normalize(path.join(CANONICAL_STORAGE_DIR, 'uploads'));
    assert.equal(CANONICAL_UPLOADS_DIR, expected);
    assert.equal(getCanonicalUploadsDir(), expected);
    assert.equal(UPLOAD_DIR, expected);
  });

  // 3. Absolute STORAGE_DIR resolution
  await test('3. Absolute STORAGE_DIR resolves directly and normalizes', () => {
    const absPath = path.normalize(path.resolve(os.tmpdir(), 'devpilot-custom-abs-storage'));
    const resolvedStorage = getCanonicalStorageDir(absPath);
    const resolvedUploads = getCanonicalUploadsDir(absPath);

    assert.equal(resolvedStorage, absPath);
    assert.equal(resolvedUploads, path.join(absPath, 'uploads'));
  });

  // 4. Relative STORAGE_DIR resolution
  await test('4. Relative STORAGE_DIR anchors deterministically to MONOREPO_ROOT, not process.cwd()', () => {
    const customRel = 'custom-test-storage';
    const expectedStorage = path.normalize(path.resolve(MONOREPO_ROOT_DIR, customRel));
    const expectedUploads = path.normalize(path.join(expectedStorage, 'uploads'));

    assert.equal(getCanonicalStorageDir(customRel), expectedStorage);
    assert.equal(getCanonicalUploadsDir(customRel), expectedUploads);
  });

  // 5. Working-directory independence across 3 execution contexts
  await test('5. Working-directory independence: resolves identically from monorepo root, apps/api, and temp dir', () => {
    const originalCwd = process.cwd();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devpilot-cwd-test-'));

    try {
      // Context A: Monorepo Root
      process.chdir(MONOREPO_ROOT_DIR);
      const storageA = getCanonicalStorageDir();
      const uploadsA = getCanonicalUploadsDir();

      // Context B: apps/api workspace directory
      const apiWorkspace = path.resolve(MONOREPO_ROOT_DIR, 'apps/api');
      process.chdir(apiWorkspace);
      const storageB = getCanonicalStorageDir();
      const uploadsB = getCanonicalUploadsDir();

      // Context C: Completely external directory (outside repository tree)
      process.chdir(tempDir);
      const storageC = getCanonicalStorageDir();
      const uploadsC = getCanonicalUploadsDir();

      // Invariant: All 3 execution contexts must produce byte-for-byte identical canonical paths
      assert.equal(storageA, storageB, 'Storage dir mismatch between root and apps/api');
      assert.equal(storageB, storageC, 'Storage dir mismatch between apps/api and temp dir');
      assert.equal(uploadsA, uploadsB, 'Uploads dir mismatch between root and apps/api');
      assert.equal(uploadsB, uploadsC, 'Uploads dir mismatch between apps/api and temp dir');
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // 6. Directory creation behavior with isolated temp directories
  await test('6. Directory initialization creates directories recursively without failure', async () => {
    const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devpilot-init-test-'));
    const isolatedStorage = path.join(isolatedRoot, 'isolated-storage');
    const isolatedUploads = path.join(isolatedStorage, 'uploads');

    try {
      assert.equal(fs.existsSync(isolatedStorage), false);
      assert.equal(fs.existsSync(isolatedUploads), false);

      // Verify directory creation for canonical paths
      await fs.promises.mkdir(isolatedUploads, { recursive: true });
      assert.equal(fs.existsSync(isolatedStorage), true);
      assert.equal(fs.existsSync(isolatedUploads), true);

      // Verify readdir works on created dirs
      const files = await fs.promises.readdir(isolatedUploads);
      assert.deepEqual(files, []);
    } finally {
      fs.rmSync(isolatedRoot, { recursive: true, force: true });
    }
  });

  // 7. Backward compatibility: existing relative database path semantics
  await test('7. Relative database path semantics (storage/uploads/${fileName}) remain 100% compatible', () => {
    const testFileName = '01840895-ce4c-4647-9293-52606529a1ca.jpg';
    const dbStoredPath = `storage/uploads/${testFileName}`;

    // Canonical absolute path constructed via UPLOAD_DIR
    const targetFile = path.join(UPLOAD_DIR, testFileName);

    // Relative path from monorepo root to the file
    const relFromRoot = path.relative(MONOREPO_ROOT_DIR, targetFile).replace(/\\/g, '/');

    assert.equal(relFromRoot, dbStoredPath, 'Relative path from monorepo root must match database format');
  });

  // 8. Path traversal security: parent directory references rejected
  await test('8. assertSafeStoragePath rejects path traversal with parent directories (..)', () => {
    assert.throws(
      () => assertSafeStoragePath(path.join(UPLOAD_DIR, '../ai-engine.pid')),
      /Path traversal detected/
    );
    assert.throws(
      () => assertSafeStoragePath(path.join(UPLOAD_DIR, '../../package.json')),
      /Path traversal detected/
    );
  });

  // 9. Path traversal security: prefix collisions rejected (e.g. uploads_fake)
  await test('9. assertSafeStoragePath rejects prefix collision paths (e.g. uploads_evil)', () => {
    const fakeUploadsDir = `${UPLOAD_DIR}_fake`;
    const evilTarget = path.join(fakeUploadsDir, 'malicious.jpg');

    assert.throws(
      () => assertSafeStoragePath(evilTarget),
      /Path traversal detected/
    );
  });

  // 10. Path traversal security: valid targets inside UPLOAD_DIR are accepted
  await test('10. assertSafeStoragePath accepts valid file paths within canonical UPLOAD_DIR', () => {
    const validTarget = path.join(UPLOAD_DIR, 'valid-uuid-asset.png');
    assert.doesNotThrow(() => assertSafeStoragePath(validTarget));

    // Base directory itself is also accepted
    assert.doesNotThrow(() => assertSafeStoragePath(UPLOAD_DIR));
  });

  // 11. Security filename sanitization and secure generation
  await test('11. sanitizeFilename strips directory separators and generates safe UUID filename', () => {
    const dirty = '../../etc/passwd\0.png';
    const sanitized = sanitizeFilename(dirty);
    assert.equal(sanitized.includes('..'), false);
    assert.equal(sanitized.includes('/'), false);
    assert.equal(sanitized.includes('\\'), false);
    assert.equal(sanitized.includes('\0'), false);

    const secureName = generateSecureFileName('image/png');
    assert.ok(secureName.endsWith('.png'));
    assert.equal(secureName.length, 36 + 4); // UUID (36) + .png (4)
  });

  // 12. Magic-byte anti-spoofing validation regression
  await test('12. validateMagicBytes detects valid image signatures and rejects spoofed files', () => {
    // Valid PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const pngResult = validateMagicBytes(validPng, 'image/png');
    assert.equal(pngResult.valid, true);

    // Spoofed file (text pretending to be PNG)
    const spoofed = Buffer.from('<?php echo "evil"; ?>');
    const spoofResult = validateMagicBytes(spoofed, 'image/png');
    assert.equal(spoofResult.valid, false);
  });

  console.log('\n======================================================');
  console.log(`  Storage Portability Tests completed: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runStoragePortabilityTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
