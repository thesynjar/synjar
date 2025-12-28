import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Dev user credentials
  const devEmail = 'dev@example.com';
  const devPassword = 'dev123';
  const devPasswordHash = await bcrypt.hash(devPassword, 10);

  // Create dev user
  const user = await prisma.user.upsert({
    where: { email: devEmail },
    update: {},
    create: {
      email: devEmail,
      passwordHash: devPasswordHash,
      name: 'Dev User',
      isEmailVerified: true,
    },
  });

  console.log(`✅ Created user: ${user.email}`);

  // Create workspace "General" for the dev user
  // Each user should only see workspaces they are members of
  const workspace = await prisma.workspace.upsert({
    where: { id: 'dev-general-workspace' },
    update: {},
    create: {
      id: 'dev-general-workspace',
      name: 'General',
      createdById: user.id,
      members: {
        create: {
          userId: user.id,
          role: 'OWNER',
        },
      },
    },
  });

  console.log(`✅ Created workspace: ${workspace.name}`);

  // Create sample tags for a knowledge base product
  const tags = [
    'getting-started',
    'api',
    'features',
    'faq',
    'troubleshooting',
    'integration',
  ];
  for (const tagName of tags) {
    await prisma.tag.upsert({
      where: { name: tagName },
      update: {},
      create: { name: tagName },
    });
  }

  console.log(`✅ Created tags: ${tags.join(', ')}`);

  // Save password to .env.seed file (git ignored)
  const envSeedPath = path.resolve(__dirname, '../../../.env.seed');
  const envSeedContent = `# Seed user credentials (generated ${new Date().toISOString()})
# This file is git ignored - do not commit!

SEED_USER_EMAIL=${devEmail}
SEED_USER_PASSWORD=${devPassword}
`;

  fs.writeFileSync(envSeedPath, envSeedContent);
  console.log(`✅ Saved credentials to .env.seed`);

  console.log('\n🎉 Seeding completed!');
  console.log(`\n📧 Email: ${devEmail}`);
  console.log(`🔑 Password: ${devPassword}`);
  console.log(`\n💡 Credentials also saved to .env.seed`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
