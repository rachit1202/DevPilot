import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding DevPilot database...');

  // 1. Seed or update CodeCulture Brand Settings
  const existingBrand = await prisma.brandSettings.findFirst();
  let brandId: string;

  if (!existingBrand) {
    const brand = await prisma.brandSettings.create({
      data: {
        brandName: 'CodeCulture',
        tagline: 'Code. Create. Build. Repeat.',
        websiteUrl: 'https://codeculture.dev',
        primaryColor: '#8B5CF6',
        secondaryColor: '#06B6D4',
        tone: 'Modern, developer-friendly, humorous but informative, creative',
        audience: 'Web developers, students, freelancers, AI enthusiasts, tech founders',
        topics: [
          'Coding Memes',
          'Developer Life',
          'AI & Vibe Coding',
          'Web Development Tips',
          'Programming Tutorials',
          'Tech News & Trends',
          'Tools & Resources',
        ],
        avoidTopics: ['Partisan politics', 'Unverified rumors', 'Hate speech'],
        ctaDefaults: 'Follow @CodeCulture for daily web dev insights, vibe coding tips, and tech humor.',
      },
    });
    brandId = brand.id;
    console.log(`Created default brand settings: ${brand.brandName} (${brand.id})`);
  } else {
    brandId = existingBrand.id;
    console.log(`Using existing brand settings: ${existingBrand.brandName} (${existingBrand.id})`);
  }

  // 2. Seed initial Owner user from environment
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL || 'admin@codeculture.dev';
  const ownerName = process.env.INITIAL_OWNER_NAME || 'CodeCulture Admin';
  const rawPassword = process.env.INITIAL_OWNER_PASSWORD;

  if (!rawPassword || rawPassword.trim().length < 8) {
    throw new Error(
      'Security requirement: INITIAL_OWNER_PASSWORD environment variable must be set in .env with at least 8 characters before running seed.'
    );
  }

  const existingOwner = await prisma.user.findUnique({
    where: { email: ownerEmail },
  });

  if (!existingOwner) {
    const passwordHash = await bcrypt.hash(rawPassword, 12);
    const owner = await prisma.user.create({
      data: {
        name: ownerName,
        email: ownerEmail,
        passwordHash,
        role: UserRole.OWNER,
      },
    });

    // Record bootstrap activity log
    await prisma.activityLog.create({
      data: {
        userId: owner.id,
        action: 'SYSTEM_BOOTSTRAPPED',
        entityType: 'User',
        entityId: owner.id,
        metadata: {
          note: 'Initial owner account bootstrapped securely via seed script',
        },
      },
    });

    console.log(`Created initial Owner user: ${owner.email} (${owner.id})`);
  } else {
    console.log(`Owner account already exists: ${existingOwner.email} (${existingOwner.id})`);
  }

  console.log('Database seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seed script error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
