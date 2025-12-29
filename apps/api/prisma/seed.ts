import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Fixed UUIDs for dev environment (reproducible across seeds)
const DEV_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';

// Fixture document definitions
interface FixtureDoc {
  filename: string;
  title: string;
  tags: string[];
}

const FIXTURE_DOCUMENTS: FixtureDoc[] = [
  {
    filename: 'synjar-getting-started.md',
    title: 'Synjar - Getting Started',
    tags: ['getting-started', 'documentation', 'tutorial'],
  },
  {
    filename: 'synjar-api-reference.md',
    title: 'Synjar - API Reference',
    tags: ['api', 'documentation', 'reference'],
  },
  {
    filename: 'synjar-features.md',
    title: 'Synjar - Features',
    tags: ['features', 'documentation', 'overview'],
  },
  {
    filename: 'synjar-faq.md',
    title: 'Synjar - FAQ',
    tags: ['faq', 'troubleshooting', 'documentation'],
  },
  {
    filename: 'synjar-troubleshooting.md',
    title: 'Synjar - Troubleshooting',
    tags: ['troubleshooting', 'faq', 'support'],
  },
  {
    filename: 'synjar-integration-guide.md',
    title: 'Synjar - Integration Guide',
    tags: ['integration', 'api', 'documentation'],
  },
];

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
  const workspace = await prisma.workspace.upsert({
    where: { id: DEV_WORKSPACE_ID },
    update: {},
    create: {
      id: DEV_WORKSPACE_ID,
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

  // Create all tags (including additional ones for documents)
  const allTags = [
    'getting-started',
    'api',
    'features',
    'faq',
    'troubleshooting',
    'integration',
    'documentation',
    'tutorial',
    'reference',
    'overview',
    'support',
  ];

  const tagMap = new Map<string, string>();
  for (const tagName of allTags) {
    const tag = await prisma.tag.upsert({
      where: { name: tagName },
      update: {},
      create: { name: tagName },
    });
    tagMap.set(tagName, tag.id);
  }

  console.log(`✅ Created tags: ${allTags.join(', ')}`);

  // Load and create documents from fixtures
  const fixturesDir = path.resolve(__dirname, '../../../fixtures');
  let docCount = 0;

  for (const docDef of FIXTURE_DOCUMENTS) {
    const filePath = path.join(fixturesDir, docDef.filename);

    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠️ Skipping ${docDef.filename} (file not found)`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    // Check if document already exists (by title in workspace)
    const existingDoc = await prisma.document.findFirst({
      where: {
        workspaceId: workspace.id,
        title: docDef.title,
      },
    });

    if (existingDoc) {
      console.log(`  ⏭️ Skipping ${docDef.title} (already exists)`);
      continue;
    }

    // Create document with tags
    await prisma.document.create({
      data: {
        workspaceId: workspace.id,
        title: docDef.title,
        content,
        contentType: 'TEXT',
        verificationStatus: 'VERIFIED',
        processingStatus: 'PENDING',
        tags: {
          create: docDef.tags
            .filter((tagName) => tagMap.has(tagName))
            .map((tagName) => ({
              tagId: tagMap.get(tagName)!,
            })),
        },
      },
    });

    console.log(`  📄 Created: ${docDef.title}`);
    docCount++;
  }

  console.log(`✅ Created ${docCount} documents`);

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
  console.log(`📁 Workspace: ${workspace.name}`);
  console.log(`📄 Documents: ${docCount}`);
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
