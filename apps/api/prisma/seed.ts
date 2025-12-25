import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Generate random password for seed user
  const seedPassword = crypto.randomBytes(16).toString('hex');
  const passwordHash = await bcrypt.hash(seedPassword, 10);

  // Create seed user
  const user = await prisma.user.upsert({
    where: { email: 'admin@synjar.local' },
    update: {},
    create: {
      email: 'admin@synjar.local',
      passwordHash,
      name: 'Admin User',
    },
  });

  console.log(`✅ Created user: ${user.email}`);

  // Create default workspace
  const workspace = await prisma.workspace.upsert({
    where: { id: 'synjar-demo-workspace' },
    update: {},
    create: {
      id: 'synjar-demo-workspace',
      name: 'Synjar Demo',
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

SEED_USER_EMAIL=admin@synjar.local
SEED_USER_PASSWORD=${seedPassword}
`;

  fs.writeFileSync(envSeedPath, envSeedContent);
  console.log(`✅ Saved credentials to .env.seed`);

  console.log('\n🎉 Seeding completed!');
  console.log(`\n📧 Email: admin@synjar.local`);
  console.log(`🔑 Password: ${seedPassword}`);
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
