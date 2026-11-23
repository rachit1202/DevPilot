const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    console.log('--- TABLES IN DEVPILOT DATABASE ---');
    tables.forEach(t => console.log('  • ' + t.table_name));
    console.log('TOTAL_TABLES:', tables.length);

    const userCount = await prisma.user.count();
    const brandCount = await prisma.brandSettings.count();
    const logCount = await prisma.activityLog.count();

    const owner = await prisma.user.findFirst({
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });

    const brand = await prisma.brandSettings.findFirst({
      select: { id: true, brandName: true, tagline: true, primaryColor: true, secondaryColor: true }
    });

    console.log('\n--- SEED AUDIT ---');
    console.log('USER_COUNT:', userCount);
    console.log('OWNER_RECORD:', JSON.stringify(owner));
    console.log('BRAND_COUNT:', brandCount);
    console.log('BRAND_RECORD:', JSON.stringify(brand));
    console.log('ACTIVITY_LOG_COUNT:', logCount);
  } catch (err) {
    console.error('AUDIT_ERROR:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
