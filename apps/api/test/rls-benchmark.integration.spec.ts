/* eslint-disable no-console */
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/infrastructure/persistence/prisma/prisma.service';
import { PrismaClient, Role } from '@prisma/client';
import { UserContext } from '../src/infrastructure/persistence/rls/user.context';
import { v4 as uuidv4 } from 'uuid';

/**
 * RLS Performance Benchmark Tests
 *
 * Compares performance of database operations with and without RLS.
 * Uses a real database connection to measure actual query times.
 *
 * IMPORTANT: The overhead measured here includes:
 * 1. Prisma $transaction wrapper (~0.5ms fixed cost)
 * 2. set_config() SQL call (~0.1ms)
 * 3. Actual RLS policy evaluation (minimal for indexed columns)
 *
 * For fast operations (<0.5ms), the transaction overhead dominates,
 * leading to high percentage overhead but still sub-millisecond absolute times.
 * All operations remain under 2ms which is acceptable for production use.
 *
 * Benchmark categories:
 * 1. SELECT operations (findMany, findUnique)
 * 2. INSERT operations (create)
 * 3. UPDATE operations (update)
 * 4. Complex queries (joins, filters)
 */
describe('RLS Performance Benchmark', () => {
  let prisma: PrismaService;
  let prismaSuperuser: PrismaClient;
  let module: TestingModule;

  // Test data
  let testUser: { id: string };
  let testWorkspace: { id: string };
  const testDocuments: Array<{ id: string }> = [];

  const BENCHMARK_ITERATIONS = 100;
  const DOCUMENT_COUNT = 50;

  interface BenchmarkResult {
    operation: string;
    withRls: number;
    withoutRls: number;
    overhead: number;
    overheadPercent: string;
  }

  const results: BenchmarkResult[] = [];

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [PrismaService, UserContext],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    await prisma.$connect();

    prismaSuperuser = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL_MIGRATE ||
            'postgresql://postgres:postgres@localhost:6201/synjar?schema=public',
        },
      },
    });
    await prismaSuperuser.$connect();

    // Setup test data
    testUser = await prismaSuperuser.user.create({
      data: {
        email: `benchmark-user-${uuidv4()}@test.com`,
        passwordHash: 'hash',
        name: 'Benchmark User',
      },
    });

    testWorkspace = await prismaSuperuser.workspace.create({
      data: {
        name: `Benchmark Workspace ${uuidv4()}`,
        createdById: testUser.id,
        members: {
          create: {
            userId: testUser.id,
            role: Role.OWNER,
          },
        },
      },
    });

    // Create test documents
    for (let i = 0; i < DOCUMENT_COUNT; i++) {
      const doc = await prismaSuperuser.document.create({
        data: {
          workspaceId: testWorkspace.id,
          title: `Benchmark Document ${i}`,
          content: `Content for benchmark document ${i}. `.repeat(10),
        },
      });
      testDocuments.push(doc);
    }
  }, 60000);

  afterAll(async () => {
    // Print benchmark results
    console.log('\n');
    console.log('='.repeat(80));
    console.log('RLS PERFORMANCE BENCHMARK RESULTS');
    console.log('='.repeat(80));
    console.log(
      `Iterations: ${BENCHMARK_ITERATIONS}, Documents: ${DOCUMENT_COUNT}`,
    );
    console.log('-'.repeat(80));
    console.log(
      'Operation'.padEnd(30) +
        'With RLS'.padEnd(15) +
        'Without RLS'.padEnd(15) +
        'Overhead'.padEnd(15) +
        'Overhead %',
    );
    console.log('-'.repeat(80));

    for (const result of results) {
      console.log(
        result.operation.padEnd(30) +
          `${result.withRls.toFixed(2)}ms`.padEnd(15) +
          `${result.withoutRls.toFixed(2)}ms`.padEnd(15) +
          `${result.overhead.toFixed(2)}ms`.padEnd(15) +
          result.overheadPercent,
      );
    }

    console.log('='.repeat(80));
    console.log('\n');

    // Cleanup
    await prismaSuperuser.document.deleteMany({
      where: { id: { in: testDocuments.map((d) => d.id) } },
    });
    await prismaSuperuser.workspaceMember.deleteMany({
      where: { workspaceId: testWorkspace.id },
    });
    await prismaSuperuser.workspace.delete({
      where: { id: testWorkspace.id },
    });
    await prismaSuperuser.user.delete({
      where: { id: testUser.id },
    });

    await prisma.$disconnect();
    await prismaSuperuser.$disconnect();
    await module.close();
  }, 60000);

  async function measureTime(
    fn: () => Promise<unknown>,
    iterations: number,
  ): Promise<number> {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await fn();
    }
    const end = performance.now();
    return (end - start) / iterations;
  }

  describe('1. SELECT Operations', () => {
    it('findMany - list all documents', async () => {
      const withRls = await measureTime(
        () =>
          prisma.forUser(testUser.id, (tx) =>
            tx.document.findMany({ where: { workspaceId: testWorkspace.id } }),
          ),
        BENCHMARK_ITERATIONS,
      );

      const withoutRls = await measureTime(
        () =>
          prismaSuperuser.document.findMany({
            where: { workspaceId: testWorkspace.id },
          }),
        BENCHMARK_ITERATIONS,
      );

      const overhead = withRls - withoutRls;
      const overheadPercent =
        withoutRls > 0
          ? `${((overhead / withoutRls) * 100).toFixed(1)}%`
          : 'N/A';

      results.push({
        operation: 'findMany (50 docs)',
        withRls,
        withoutRls,
        overhead,
        overheadPercent,
      });

      // Overhead can be high percentage-wise due to transaction cost,
      // but absolute time should be under 3ms
      expect(withRls).toBeLessThan(3);
    });

    it('findUnique - single document by ID', async () => {
      const docId = testDocuments[0].id;

      const withRls = await measureTime(
        () =>
          prisma.forUser(testUser.id, (tx) =>
            tx.document.findUnique({ where: { id: docId } }),
          ),
        BENCHMARK_ITERATIONS,
      );

      const withoutRls = await measureTime(
        () => prismaSuperuser.document.findUnique({ where: { id: docId } }),
        BENCHMARK_ITERATIONS,
      );

      const overhead = withRls - withoutRls;
      const overheadPercent =
        withoutRls > 0
          ? `${((overhead / withoutRls) * 100).toFixed(1)}%`
          : 'N/A';

      results.push({
        operation: 'findUnique (by ID)',
        withRls,
        withoutRls,
        overhead,
        overheadPercent,
      });

      // Absolute time should be under 2ms
      expect(withRls).toBeLessThan(2);
    });

    it('findFirst with filter', async () => {
      const withRls = await measureTime(
        () =>
          prisma.forUser(testUser.id, (tx) =>
            tx.document.findFirst({
              where: {
                workspaceId: testWorkspace.id,
                title: { contains: 'Document 25' },
              },
            }),
          ),
        BENCHMARK_ITERATIONS,
      );

      const withoutRls = await measureTime(
        () =>
          prismaSuperuser.document.findFirst({
            where: {
              workspaceId: testWorkspace.id,
              title: { contains: 'Document 25' },
            },
          }),
        BENCHMARK_ITERATIONS,
      );

      const overhead = withRls - withoutRls;
      const overheadPercent =
        withoutRls > 0
          ? `${((overhead / withoutRls) * 100).toFixed(1)}%`
          : 'N/A';

      results.push({
        operation: 'findFirst (with filter)',
        withRls,
        withoutRls,
        overhead,
        overheadPercent,
      });

      expect(withRls).toBeLessThan(2);
    });

    it('count operation', async () => {
      const withRls = await measureTime(
        () =>
          prisma.forUser(testUser.id, (tx) =>
            tx.document.count({ where: { workspaceId: testWorkspace.id } }),
          ),
        BENCHMARK_ITERATIONS,
      );

      const withoutRls = await measureTime(
        () =>
          prismaSuperuser.document.count({
            where: { workspaceId: testWorkspace.id },
          }),
        BENCHMARK_ITERATIONS,
      );

      const overhead = withRls - withoutRls;
      const overheadPercent =
        withoutRls > 0
          ? `${((overhead / withoutRls) * 100).toFixed(1)}%`
          : 'N/A';

      results.push({
        operation: 'count',
        withRls,
        withoutRls,
        overhead,
        overheadPercent,
      });

      expect(withRls).toBeLessThan(2);
    });
  });

  describe('2. INSERT Operations', () => {
    const createdDocs: string[] = [];

    afterAll(async () => {
      if (createdDocs.length > 0) {
        await prismaSuperuser.document.deleteMany({
          where: { id: { in: createdDocs } },
        });
      }
    });

    it('create single document', async () => {
      let counter = 0;

      const withRls = await measureTime(async () => {
        const doc = await prisma.forUser(testUser.id, (tx) =>
          tx.document.create({
            data: {
              workspaceId: testWorkspace.id,
              title: `Insert Test RLS ${counter++}`,
              content: 'Test content',
            },
          }),
        );
        createdDocs.push(doc.id);
      }, BENCHMARK_ITERATIONS);

      const withoutRls = await measureTime(async () => {
        const doc = await prismaSuperuser.document.create({
          data: {
            workspaceId: testWorkspace.id,
            title: `Insert Test No RLS ${counter++}`,
            content: 'Test content',
          },
        });
        createdDocs.push(doc.id);
      }, BENCHMARK_ITERATIONS);

      const overhead = withRls - withoutRls;
      const overheadPercent =
        withoutRls > 0
          ? `${((overhead / withoutRls) * 100).toFixed(1)}%`
          : 'N/A';

      results.push({
        operation: 'create (single doc)',
        withRls,
        withoutRls,
        overhead,
        overheadPercent,
      });

      expect(withRls).toBeLessThan(2);
    });
  });

  describe('3. UPDATE Operations', () => {
    it('update single document', async () => {
      const docId = testDocuments[0].id;
      let counter = 0;

      const withRls = await measureTime(
        () =>
          prisma.forUser(testUser.id, (tx) =>
            tx.document.update({
              where: { id: docId },
              data: { title: `Updated RLS ${counter++}` },
            }),
          ),
        BENCHMARK_ITERATIONS,
      );

      const withoutRls = await measureTime(
        () =>
          prismaSuperuser.document.update({
            where: { id: docId },
            data: { title: `Updated No RLS ${counter++}` },
          }),
        BENCHMARK_ITERATIONS,
      );

      const overhead = withRls - withoutRls;
      const overheadPercent =
        withoutRls > 0
          ? `${((overhead / withoutRls) * 100).toFixed(1)}%`
          : 'N/A';

      results.push({
        operation: 'update (single doc)',
        withRls,
        withoutRls,
        overhead,
        overheadPercent,
      });

      expect(withRls).toBeLessThan(2);
    });

    it('updateMany operation', async () => {
      const withRls = await measureTime(
        () =>
          prisma.forUser(testUser.id, (tx) =>
            tx.document.updateMany({
              where: { workspaceId: testWorkspace.id },
              data: { content: 'Bulk updated content' },
            }),
          ),
        BENCHMARK_ITERATIONS,
      );

      const withoutRls = await measureTime(
        () =>
          prismaSuperuser.document.updateMany({
            where: { workspaceId: testWorkspace.id },
            data: { content: 'Bulk updated content no rls' },
          }),
        BENCHMARK_ITERATIONS,
      );

      const overhead = withRls - withoutRls;
      const overheadPercent =
        withoutRls > 0
          ? `${((overhead / withoutRls) * 100).toFixed(1)}%`
          : 'N/A';

      results.push({
        operation: 'updateMany (50 docs)',
        withRls,
        withoutRls,
        overhead,
        overheadPercent,
      });

      expect(withRls).toBeLessThan(2);
    });
  });

  describe('4. Complex Queries', () => {
    it('findMany with orderBy and take', async () => {
      const withRls = await measureTime(
        () =>
          prisma.forUser(testUser.id, (tx) =>
            tx.document.findMany({
              where: { workspaceId: testWorkspace.id },
              orderBy: { createdAt: 'desc' },
              take: 10,
            }),
          ),
        BENCHMARK_ITERATIONS,
      );

      const withoutRls = await measureTime(
        () =>
          prismaSuperuser.document.findMany({
            where: { workspaceId: testWorkspace.id },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),
        BENCHMARK_ITERATIONS,
      );

      const overhead = withRls - withoutRls;
      const overheadPercent =
        withoutRls > 0
          ? `${((overhead / withoutRls) * 100).toFixed(1)}%`
          : 'N/A';

      results.push({
        operation: 'findMany (orderBy, take 10)',
        withRls,
        withoutRls,
        overhead,
        overheadPercent,
      });

      expect(withRls).toBeLessThan(2);
    });

    it('findMany with include (join)', async () => {
      const withRls = await measureTime(
        () =>
          prisma.forUser(testUser.id, (tx) =>
            tx.document.findMany({
              where: { workspaceId: testWorkspace.id },
              include: { workspace: true },
              take: 10,
            }),
          ),
        BENCHMARK_ITERATIONS,
      );

      const withoutRls = await measureTime(
        () =>
          prismaSuperuser.document.findMany({
            where: { workspaceId: testWorkspace.id },
            include: { workspace: true },
            take: 10,
          }),
        BENCHMARK_ITERATIONS,
      );

      const overhead = withRls - withoutRls;
      const overheadPercent =
        withoutRls > 0
          ? `${((overhead / withoutRls) * 100).toFixed(1)}%`
          : 'N/A';

      results.push({
        operation: 'findMany (with include)',
        withRls,
        withoutRls,
        overhead,
        overheadPercent,
      });

      expect(withRls).toBeLessThan(3);
    });

    it('workspace with member count', async () => {
      const withRls = await measureTime(
        () =>
          prisma.forUser(testUser.id, (tx) =>
            tx.workspace.findFirst({
              where: { id: testWorkspace.id },
              include: {
                _count: { select: { members: true, documents: true } },
              },
            }),
          ),
        BENCHMARK_ITERATIONS,
      );

      const withoutRls = await measureTime(
        () =>
          prismaSuperuser.workspace.findFirst({
            where: { id: testWorkspace.id },
            include: {
              _count: { select: { members: true, documents: true } },
            },
          }),
        BENCHMARK_ITERATIONS,
      );

      const overhead = withRls - withoutRls;
      const overheadPercent =
        withoutRls > 0
          ? `${((overhead / withoutRls) * 100).toFixed(1)}%`
          : 'N/A';

      results.push({
        operation: 'workspace with _count',
        withRls,
        withoutRls,
        overhead,
        overheadPercent,
      });

      expect(withRls).toBeLessThan(2);
    });
  });

  describe('5. Summary', () => {
    it('should have acceptable RLS performance (all operations < 3ms)', () => {
      // This test runs last and validates overall performance
      const avgOverheadPercent =
        results.reduce((sum, r) => {
          const percent = parseFloat(r.overheadPercent) || 0;
          return sum + percent;
        }, 0) / results.length;

      const maxTime = Math.max(...results.map((r) => r.withRls));
      const avgTime =
        results.reduce((sum, r) => sum + r.withRls, 0) / results.length;

      console.log(`\nAverage RLS overhead: ${avgOverheadPercent.toFixed(1)}%`);
      console.log(`Average operation time with RLS: ${avgTime.toFixed(2)}ms`);
      console.log(`Max operation time with RLS: ${maxTime.toFixed(2)}ms`);

      // All operations should be under 3ms (acceptable for production)
      expect(maxTime).toBeLessThan(3);
      // Average should be under 2ms
      expect(avgTime).toBeLessThan(2);
    });
  });
});
