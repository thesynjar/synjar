# Architecture Review Report - 2024-12-24

## Kontekst

- Moduł: Knowledge Forge (standalone product)
- Bounded Contexts:
  - Workspace Context (User, Workspace, WorkspaceMember)
  - Content Context (Document, Chunk, Tag)
  - Search Context (RAG Query, Embeddings)
  - Access Context (PublicLink, Token)
  - Processing Context (Chunking, File Parsing)
- Przeczytane dokumenty:
  - CLAUDE.md (zasady inżynieryjne)
  - docs/specifications/2025-12-24-knowledge-forge.md (specyfikacja)
  - docs/ARCHITECTURE_DECISION.md (ADR - standalone product decision)
  - research/RAG_Knowledge_Base_Research_2025.md (research RAG frameworks)
- Powiązane przepływy:
  - UC1: Zapisanie zweryfikowanego źródła (file upload → parsing → chunking → embeddings → storage)
  - UC2: Zapisanie niezweryfikowanego źródła
  - UC3: Generowanie publicznego linku
  - UC4: Pobieranie treści przez publiczny link
  - UC5: RAG search (query → embedding → vector similarity → results)

---

## 🔴 CRITICAL (łamie fundamentalne zasady)

### [DDD] Brak agregatu dla Document - logika biznesowa w serwisach

**Problem:**
```typescript
// apps/api/src/application/document/document.service.ts:286
private async processDocument(documentId: string) {
  // Transaction Script pattern - logika biznesowa w serwisie
  await this.prisma.document.update({ processingStatus: PROCESSING });
  const chunks = await this.chunkingService.chunk(document.content);
  const embeddings = await this.embeddingsService.generateEmbeddings(...);
  // ...
  await this.prisma.document.update({ processingStatus: COMPLETED });
}
```

**Dlaczego to problem:**
- Anemic Domain Model - Document jest tylko strukturą danych
- Brak wymuszania niezmienników (invariants)
- Logika statusów (PENDING → PROCESSING → COMPLETED/FAILED) powinna być w agregacie
- Niemożliwe unit testowanie logiki domenowej bez infrastruktury
- Naruszenie SRP - serwis zna za dużo szczegółów

**Jak naprawić:**
```typescript
// domain/document/document.entity.ts
export class Document {
  private status: ProcessingStatus;
  private readonly chunks: Chunk[] = [];

  startProcessing(): void {
    if (this.status !== ProcessingStatus.PENDING) {
      throw new Error('Cannot start processing - invalid state');
    }
    this.status = ProcessingStatus.PROCESSING;
  }

  completeProcessing(chunks: Chunk[]): void {
    if (this.status !== ProcessingStatus.PROCESSING) {
      throw new Error('Cannot complete - not in processing state');
    }
    this.chunks.push(...chunks);
    this.status = ProcessingStatus.COMPLETED;
  }

  failProcessing(error: string): void {
    if (this.status !== ProcessingStatus.PROCESSING) {
      throw new Error('Cannot fail - not in processing state');
    }
    this.status = ProcessingStatus.FAILED;
    this.processingError = error;
  }
}

// Application service - tylko orkiestracja
async processDocument(documentId: string) {
  const document = await this.repository.findById(documentId);
  document.startProcessing(); // Wymusza invariant
  await this.repository.save(document);

  const chunks = await this.chunkingService.chunk(document.content);
  const embeddings = await this.embeddingsService.generate(chunks);

  document.completeProcessing(chunks.map((c, i) =>
    new Chunk(c.content, embeddings[i], i)
  ));
  await this.repository.save(document);
}
```

---

### [DDD] Brak Repository Pattern - bezpośrednie użycie Prisma

**Problem:**
```typescript
// Wszędzie w serwisach:
constructor(private readonly prisma: PrismaService) {}

await this.prisma.document.create({ ... });
await this.prisma.document.findFirst({ ... });
```

**Dlaczego to problem:**
- Naruszenie Dependency Inversion Principle (DIP)
- Application Layer zależy bezpośrednio od Infrastructure (Prisma)
- Niemożliwe testowanie bez bazy danych
- Trudna podmiana implementacji (np. na inny ORM)
- Naruszenie Clean Architecture - brak interfejsów w Domain Layer

**Jak naprawić:**
```typescript
// domain/document/document.repository.ts
export interface IDocumentRepository {
  findById(id: string): Promise<Document | null>;
  findByWorkspace(workspaceId: string, filters: DocumentFilters): Promise<Document[]>;
  save(document: Document): Promise<void>;
  delete(id: string): Promise<void>;
}

export const DOCUMENT_REPOSITORY = Symbol('DOCUMENT_REPOSITORY');

// infrastructure/persistence/repositories/document.repository.impl.ts
@Injectable()
export class PrismaDocumentRepository implements IDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Document | null> {
    const data = await this.prisma.document.findUnique({ where: { id } });
    if (!data) return null;
    return this.toDomain(data); // Mapper: Prisma → Domain Entity
  }

  async save(document: Document): Promise<void> {
    const data = this.toPrisma(document); // Mapper: Domain → Prisma
    await this.prisma.document.upsert({
      where: { id: document.id },
      create: data,
      update: data,
    });
  }

  private toDomain(data: PrismaDocument): Document {
    // Reconstruction logic
  }

  private toPrisma(document: Document): PrismaDocument {
    // Persistence mapping
  }
}

// application/document/document.service.ts
constructor(
  @Inject(DOCUMENT_REPOSITORY)
  private readonly repository: IDocumentRepository,
) {}
```

---

### [DDD] SQL Injection w Search Service - brak parametryzacji

**Problem:**
```typescript
// apps/api/src/application/search/search.service.ts:56-98
const tagList = dto.tags.map((t) => `'${t.replace(/'/g, "''")}'`).join(',');
tagFilter = `AND d.id IN (
  SELECT dt."documentId" FROM "DocumentTag" dt
  WHERE t.name IN (${tagList})
)`;

const results = await this.prisma.$queryRawUnsafe(`
  SELECT ...
  WHERE d."workspaceId" = '${workspaceId}'
    ${tagFilter}
    ${verificationFilter}
  ORDER BY c.embedding <=> '${JSON.stringify(embedding)}'::vector
  LIMIT ${limit}
`);
```

**Dlaczego to CRITICAL:**
- SQL Injection vulnerability - pomimo próby escapowania
- String interpolation w SQL query = bezpieczeństwo ZERO
- `$queryRawUnsafe` w nazwie krzyczące "DANGER"
- Możliwe obejście przez Unicode/encoding tricks

**Jak naprawić:**
```typescript
// Użyj Prisma.$queryRaw z parametrami
const results = await this.prisma.$queryRaw<SearchResult[]>`
  SELECT
    c.id as chunk_id,
    d.id as document_id,
    c.content as chunk_content,
    1 - (c.embedding <=> ${JSON.stringify(embedding)}::vector) as score,
    d.title,
    d."fileUrl" as file_url,
    d."verificationStatus" as verification_status
  FROM "Chunk" c
  JOIN "Document" d ON d.id = c."documentId"
  WHERE d."workspaceId" = ${workspaceId}::uuid
    AND d."processingStatus" = 'COMPLETED'
    ${dto.tags && dto.tags.length > 0
      ? Prisma.sql`AND d.id IN (
          SELECT dt."documentId" FROM "DocumentTag" dt
          JOIN "Tag" t ON t.id = dt."tagId"
          WHERE t.name IN (${Prisma.join(dto.tags)})
        )`
      : Prisma.empty
    }
    ${!includeUnverified
      ? Prisma.sql`AND d."verificationStatus" = 'VERIFIED'`
      : Prisma.empty
    }
  ORDER BY c.embedding <=> ${JSON.stringify(embedding)}::vector
  LIMIT ${limit}::int
`;
```

---

## 🟠 HIGH (poważne naruszenie)

### [SOLID - OCP] ChunkingService narusza Open/Closed Principle

**Problem:**
```typescript
// apps/api/src/application/chunking/chunking.service.ts:38-58
async chunk(text: string): Promise<ChunkResult[]> {
  const tokenCount = estimateTokens(text);

  if (tokenCount < SMALL_DOC_THRESHOLD) {
    return [{ content: text, type: 'full-document' }];
  }

  if (tokenCount < MEDIUM_DOC_THRESHOLD) {
    try {
      return await this.llmService.smartChunk(text);
    } catch (error) {
      return this.fixedSizeChunk(text);
    }
  }

  return this.hierarchicalChunk(text);
}
```

**Dlaczego problem:**
- Strategia chunkingu hardcoded w if/else
- Dodanie nowej strategii wymaga modyfikacji klasy
- Niemożliwe testowanie strategii w izolacji
- Naruszenie OCP - klasa nie zamknięta na modyfikacje

**Jak naprawić:**
```typescript
// domain/chunking/chunking-strategy.port.ts
export interface IChunkingStrategy {
  canHandle(text: string): boolean;
  chunk(text: string): Promise<ChunkResult[]>;
}

// infrastructure/chunking/strategies/small-doc.strategy.ts
export class SmallDocStrategy implements IChunkingStrategy {
  canHandle(text: string): boolean {
    return estimateTokens(text) < 1000;
  }

  async chunk(text: string): Promise<ChunkResult[]> {
    return [{ content: text, type: 'full-document' }];
  }
}

// infrastructure/chunking/strategies/llm-smart.strategy.ts
export class LLMSmartStrategy implements IChunkingStrategy {
  constructor(private llmService: ILLMService) {}

  canHandle(text: string): boolean {
    const tokens = estimateTokens(text);
    return tokens >= 1000 && tokens < 10000;
  }

  async chunk(text: string): Promise<ChunkResult[]> {
    return this.llmService.smartChunk(text);
  }
}

// application/chunking/chunking.service.ts
export class ChunkingService {
  constructor(
    @Inject(CHUNKING_STRATEGIES)
    private readonly strategies: IChunkingStrategy[],
  ) {}

  async chunk(text: string): Promise<ChunkResult[]> {
    const strategy = this.strategies.find(s => s.canHandle(text));
    if (!strategy) {
      throw new Error('No chunking strategy available for document');
    }
    return strategy.chunk(text);
  }
}

// chunking.module.ts
@Module({
  providers: [
    SmallDocStrategy,
    LLMSmartStrategy,
    HierarchicalStrategy,
    {
      provide: CHUNKING_STRATEGIES,
      useFactory: (small, llm, hierarchical) => [small, llm, hierarchical],
      inject: [SmallDocStrategy, LLMSmartStrategy, HierarchicalStrategy],
    },
  ],
})
```

---

### [Clean Architecture] Application Layer wywołuje Infrastructure bez portu

**Problem:**
```typescript
// apps/api/src/application/chunking/chunking.service.ts:1-4
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

async parseFile(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case 'application/pdf':
      return this.parsePdf(buffer);  // Bezpośrednie użycie biblioteki
  }
}

private async parsePdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}
```

**Dlaczego problem:**
- Application Layer zależy od konkretnych bibliotek (pdf-parse, mammoth)
- Naruszenie Clean Architecture - warstwa aplikacji nie powinna znać implementacji
- Niemożliwe testowanie bez instalacji bibliotek
- Trudna podmiana parsera (np. na LlamaParse)

**Jak naprawić:**
```typescript
// domain/document/file-parser.port.ts
export interface IFileParser {
  supportedMimeTypes(): string[];
  parse(buffer: Buffer): Promise<string>;
}

export const FILE_PARSERS = Symbol('FILE_PARSERS');

// infrastructure/parsers/pdf.parser.ts
export class PdfParser implements IFileParser {
  supportedMimeTypes(): string[] {
    return ['application/pdf'];
  }

  async parse(buffer: Buffer): Promise<string> {
    const data = await pdfParse(buffer);
    return data.text;
  }
}

// infrastructure/parsers/docx.parser.ts
export class DocxParser implements IFileParser {
  supportedMimeTypes(): string[] {
    return ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  }

  async parse(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
}

// application/chunking/chunking.service.ts
constructor(
  @Inject(FILE_PARSERS)
  private readonly parsers: IFileParser[],
) {}

async parseFile(buffer: Buffer, mimeType: string): Promise<string> {
  const parser = this.parsers.find(p =>
    p.supportedMimeTypes().includes(mimeType)
  );

  if (!parser) {
    throw new UnsupportedFileTypeError(mimeType);
  }

  return parser.parse(buffer);
}
```

---

### [DDD] Brak Domain Events - niemożliwe rozszerzenie o audytor konfliktów

**Problem:**
- Brak mechanizmu domain events
- Specyfikacja wspomina "Audytor konfliktów (opcjonalnie - Faza 2+)"
- Obecna implementacja nie pozwala na reaktywne dodawanie funkcjonalności
- Procesy asynchroniczne (processDocument) są hidden side effects

**Dlaczego problem:**
- Niemożliwe dodanie auditora bez modyfikacji istniejącego kodu
- Brak separation of concerns - processDocument robi za dużo
- Trudne testowanie side effects
- Naruszenie OCP - dodanie nowego konsumenta wymaga zmian

**Jak naprawić:**
```typescript
// domain/document/document-events.ts
export class DocumentProcessingStarted {
  constructor(
    public readonly documentId: string,
    public readonly workspaceId: string,
    public readonly timestamp: Date,
  ) {}
}

export class DocumentProcessingCompleted {
  constructor(
    public readonly documentId: string,
    public readonly workspaceId: string,
    public readonly chunks: Chunk[],
    public readonly timestamp: Date,
  ) {}
}

// domain/document/document.entity.ts
export class Document {
  private domainEvents: any[] = [];

  startProcessing(): void {
    this.status = ProcessingStatus.PROCESSING;
    this.domainEvents.push(
      new DocumentProcessingStarted(this.id, this.workspaceId, new Date())
    );
  }

  completeProcessing(chunks: Chunk[]): void {
    this.status = ProcessingStatus.COMPLETED;
    this.chunks = chunks;
    this.domainEvents.push(
      new DocumentProcessingCompleted(
        this.id,
        this.workspaceId,
        chunks,
        new Date()
      )
    );
  }

  getDomainEvents() {
    return [...this.domainEvents];
  }

  clearDomainEvents() {
    this.domainEvents = [];
  }
}

// infrastructure/event-bus/event-bus.service.ts
@Injectable()
export class EventBusService {
  constructor(private readonly moduleRef: ModuleRef) {}

  async publish(event: any): Promise<void> {
    const handlers = this.moduleRef.get(EVENT_HANDLERS);
    for (const handler of handlers) {
      if (handler.handles(event)) {
        await handler.handle(event);
      }
    }
  }
}

// application/auditor/conflict-auditor.handler.ts (Faza 2)
@Injectable()
export class ConflictAuditorHandler {
  handles(event: any): boolean {
    return event instanceof DocumentProcessingCompleted;
  }

  async handle(event: DocumentProcessingCompleted): Promise<void> {
    // Sprawdź konflikty z innymi dokumentami w workspace
    const similarDocs = await this.findSimilarDocuments(event.workspaceId);
    const conflicts = await this.detectConflicts(event.chunks, similarDocs);
    if (conflicts.length > 0) {
      await this.createConflictReports(conflicts);
    }
  }
}
```

---

## 🟡 MEDIUM (do poprawy)

### [SOLID - SRP] DocumentService ma zbyt wiele odpowiedzialności

**Problem:**
```typescript
// apps/api/src/application/document/document.service.ts
export class DocumentService {
  async create() { /* File upload, parsing, chunking, embedding */ }
  async findAll() { /* Query documents */ }
  async update() { /* Update + reprocessing */ }
  async delete() { /* Delete + storage cleanup */ }
  private async processDocument() { /* Orchestrate chunking + embedding */ }
  private async ensureTags() { /* Tag management */ }
}
```

**Odpowiedzialności:**
1. Document CRUD
2. File upload orchestration
3. Document processing orchestration
4. Tag management
5. Authorization checking (via WorkspaceService)

**Jak naprawić:**
```typescript
// Podziel na:
// 1. DocumentService - CRUD only
// 2. DocumentProcessingOrchestrator - processDocument logic
// 3. TagService - tag management
// 4. FileUploadOrchestrator - file upload flow

// application/document/document.service.ts
export class DocumentService {
  async create(workspaceId: string, dto: CreateDocumentDto) {
    const document = Document.create(dto);
    await this.repository.save(document);
    return document;
  }

  async update(id: string, dto: UpdateDocumentDto) {
    const document = await this.repository.findById(id);
    document.update(dto);
    await this.repository.save(document);
    return document;
  }
}

// application/document/document-processing.orchestrator.ts
export class DocumentProcessingOrchestrator {
  async processDocument(documentId: string) {
    const document = await this.repository.findById(documentId);
    document.startProcessing();
    await this.repository.save(document);

    const chunks = await this.chunkingService.chunk(document.content);
    const embeddings = await this.embeddingsService.generate(chunks);

    document.completeProcessing(chunks, embeddings);
    await this.repository.save(document);

    await this.eventBus.publish(...document.getDomainEvents());
  }
}
```

---

### [Clean Architecture] Brak walidacji biznesowej w Domain Layer

**Problem:**
- Walidacja tylko na poziomie DTO (class-validator)
- Brak wymuszania niezmienników domenowych
- Przykład: max file size jest w kontrolerze, nie w domenie

```typescript
// apps/api/src/interfaces/http/document.controller.ts:40
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// apps/api/src/application/document/document.service.ts:24
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB - duplikacja!
```

**Jak naprawić:**
```typescript
// domain/document/document-constraints.ts
export class DocumentConstraints {
  static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  static readonly MAX_FILES_PER_REQUEST = 10;
  static readonly SUPPORTED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
  ];

  static validateFileSize(size: number): void {
    if (size > this.MAX_FILE_SIZE) {
      throw new FileSizeLimitExceeded(size, this.MAX_FILE_SIZE);
    }
  }

  static validateMimeType(mimeType: string): void {
    if (!this.SUPPORTED_MIME_TYPES.includes(mimeType)) {
      throw new UnsupportedFileType(mimeType);
    }
  }
}

// domain/document/document.entity.ts
export class Document {
  static createFromFile(file: FileMetadata): Document {
    DocumentConstraints.validateFileSize(file.size);
    DocumentConstraints.validateMimeType(file.mimeType);
    // ...
  }
}
```

---

### [Enterprise Pattern] Brak Specification Pattern dla filtrowania

**Problem:**
```typescript
// apps/api/src/application/document/document.service.ts:139-157
const where: any = { workspaceId };

if (query.verificationStatus) {
  where.verificationStatus = query.verificationStatus;
}

if (query.processingStatus) {
  where.processingStatus = query.processingStatus;
}

if (query.tags && query.tags.length > 0) {
  where.tags = {
    some: {
      tag: { name: { in: query.tags } },
    },
  };
}
```

**Dlaczego problem:**
- Logika filtrowania zaszyta w serwisie
- Niemożliwe reużycie
- Trudne testowanie złożonych warunków
- Type safety: `any` type

**Jak naprawić:**
```typescript
// domain/document/document-specifications.ts
export abstract class DocumentSpecification {
  abstract toWhereClause(): Prisma.DocumentWhereInput;

  and(spec: DocumentSpecification): DocumentSpecification {
    return new AndSpecification(this, spec);
  }

  or(spec: DocumentSpecification): DocumentSpecification {
    return new OrSpecification(this, spec);
  }
}

export class VerifiedDocumentsSpec extends DocumentSpecification {
  toWhereClause() {
    return { verificationStatus: VerificationStatus.VERIFIED };
  }
}

export class WithTagsSpec extends DocumentSpecification {
  constructor(private tags: string[]) { super(); }

  toWhereClause() {
    return {
      tags: {
        some: {
          tag: { name: { in: this.tags } },
        },
      },
    };
  }
}

export class CompletedProcessingSpec extends DocumentSpecification {
  toWhereClause() {
    return { processingStatus: ProcessingStatus.COMPLETED };
  }
}

// Usage:
const spec = new VerifiedDocumentsSpec()
  .and(new WithTagsSpec(['support', 'procedures']))
  .and(new CompletedProcessingSpec());

const documents = await repository.findBy(spec);
```

---

### [Testing] Brak testów jednostkowych

**Problem:**
- Specyfikacja mówi "Zawsze pisz testy najpierw (TDD)"
- CLAUDE.md: "3. Zawsze pisz testy najpierw (TDD). Stub > mock."
- Brak jakichkolwiek plików `*.spec.ts`

**Dlaczego CRITICAL dla TDD:**
- Nie można zweryfikować zgodności z wymaganiami
- Brak confidence przy refaktoryzacji
- Niemożliwe TDD workflow (Red-Green-Refactor)

**Jak naprawić:**
Dodaj testy dla kluczowych komponentów:

```typescript
// apps/api/src/application/document/document.service.spec.ts
describe('DocumentService', () => {
  let service: DocumentService;
  let repository: jest.Mocked<IDocumentRepository>;
  let workspaceService: jest.Mocked<WorkspaceService>;

  beforeEach(() => {
    repository = {
      save: jest.fn(),
      findById: jest.fn(),
    } as any;

    workspaceService = {
      ensureMember: jest.fn(),
    } as any;

    service = new DocumentService(repository, workspaceService);
  });

  describe('create', () => {
    it('should create verified document when verificationStatus is VERIFIED', async () => {
      // Arrange
      const dto = {
        title: 'Test',
        verificationStatus: VerificationStatus.VERIFIED,
      };

      // Act
      await service.create('workspace-1', 'user-1', dto);

      // Assert
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          verificationStatus: VerificationStatus.VERIFIED,
        })
      );
    });

    it('should throw when user is not workspace member', async () => {
      // Arrange
      workspaceService.ensureMember.mockRejectedValue(
        new ForbiddenException('Not a member')
      );

      // Act & Assert
      await expect(
        service.create('workspace-1', 'user-1', {})
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

// apps/api/src/domain/document/document.entity.spec.ts
describe('Document', () => {
  describe('startProcessing', () => {
    it('should change status from PENDING to PROCESSING', () => {
      const doc = Document.create({ ... });
      doc.startProcessing();
      expect(doc.processingStatus).toBe(ProcessingStatus.PROCESSING);
    });

    it('should throw when already processing', () => {
      const doc = Document.create({ ... });
      doc.startProcessing();
      expect(() => doc.startProcessing()).toThrow(
        'Cannot start processing - invalid state'
      );
    });

    it('should emit DocumentProcessingStarted event', () => {
      const doc = Document.create({ ... });
      doc.startProcessing();
      const events = doc.getDomainEvents();
      expect(events).toContainEqual(
        expect.any(DocumentProcessingStarted)
      );
    });
  });
});
```

---

## 🟢 LOW (sugestia)

### [Code Quality] Magic Numbers i hardcoded wartości

**Problem:**
```typescript
// apps/api/src/application/chunking/chunking.service.ts:6-13
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
const SMALL_DOC_THRESHOLD = 1000;
const MEDIUM_DOC_THRESHOLD = 10000;
const FIXED_CHUNK_SIZE = 512;
const FIXED_CHUNK_OVERLAP = 64;

// apps/api/src/application/chunking/chunking.service.ts:166
const searchStart = Math.max(end - 200, start);
```

**Sugestia:**
Przenieś do konfiguracji lub Value Objects:

```typescript
// domain/chunking/chunking-config.ts
export class ChunkingConfig {
  static readonly CHARS_PER_TOKEN = 4;
  static readonly SMALL_DOC_TOKENS = 1000;
  static readonly MEDIUM_DOC_TOKENS = 10000;
  static readonly FIXED_CHUNK_SIZE_TOKENS = 512;
  static readonly FIXED_CHUNK_OVERLAP_TOKENS = 64;
  static readonly SENTENCE_BOUNDARY_SEARCH_CHARS = 200;

  static estimateTokens(text: string): number {
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }
}
```

---

### [Security] Brak rate limiting dla public API

**Problem:**
- Specyfikacja wspomina: "Rate limiting dla public API" (Faza 5)
- Public endpoint bez ograniczeń może być nadużywany
- Brak throttle guard na `/public/:token`

**Sugestia:**
```typescript
// infrastructure/guards/throttle.guard.ts
import { ThrottlerGuard } from '@nestjs/throttler';

// apps/api/src/interfaces/http/public.controller.ts
@UseGuards(ThrottlerGuard)
@Controller('public/:token')
export class PublicController {
  // ...
}

// app.module.ts
@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minute
      limit: 100, // 100 requests per minute for public API
    }]),
  ],
})
```

---

### [Performance] Brak caching dla embeddings

**Problem:**
- Każde wyszukiwanie generuje embedding dla query
- Popularne queries będą powtarzane
- Research wspomina: "Semantic caching (query/context/results)"

**Sugestia:**
```typescript
// infrastructure/embeddings/cached-embeddings.service.ts
@Injectable()
export class CachedEmbeddingsService implements IEmbeddingsService {
  constructor(
    private readonly embeddingsService: IEmbeddingsService,
    private readonly cache: CacheService,
  ) {}

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const cacheKey = `embedding:${hashText(text)}`;

    const cached = await this.cache.get<EmbeddingResult>(cacheKey);
    if (cached) return cached;

    const result = await this.embeddingsService.generateEmbedding(text);
    await this.cache.set(cacheKey, result, { ttl: 3600 }); // 1 hour

    return result;
  }
}
```

---

### [Observability] Brak structured logging

**Problem:**
```typescript
// apps/api/src/application/document/document.service.ts:127
this.processDocument(document.id).catch(console.error);

// apps/api/src/application/document/document.service.ts:337
console.error('Document processing failed:', error);
```

**Sugestia:**
```typescript
// Użyj winston lub pino
import { Logger } from '@nestjs/common';

export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  async create(...) {
    this.logger.log({
      message: 'Document created',
      documentId: document.id,
      workspaceId,
      userId,
      contentType: document.contentType,
    });

    this.processDocument(document.id).catch((error) => {
      this.logger.error({
        message: 'Document processing failed',
        documentId: document.id,
        error: error.message,
        stack: error.stack,
      });
    });
  }
}
```

---

## ✅ Dobre praktyki

### Dependency Injection przez Ports

Implementacja portów dla zewnętrznych zależności jest zgodna z Clean Architecture:

```typescript
// domain/document/embeddings.port.ts
export interface IEmbeddingsService { ... }
export const EMBEDDINGS_SERVICE = Symbol('EMBEDDINGS_SERVICE');

// infrastructure/embeddings/openai-embeddings.service.ts
export class OpenAIEmbeddingsService implements IEmbeddingsService { ... }

// Module binding
providers: [{
  provide: EMBEDDINGS_SERVICE,
  useClass: OpenAIEmbeddingsService,
}]
```

**Zalety:**
- Testowalne przez stub implementations
- Łatwa podmiana providera (np. na Sentence-Transformers)
- Zgodność z DIP

---

### Prisma Schema - zgodność z zasadami

Schema jest dobrze zaprojektowana:

```prisma
model Document {
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt @db.Timestamptz
}
```

- Timestampy jako `Timestamptz` zgodnie z CLAUDE.md
- Proper indexing (workspaceId, verificationStatus, processingStatus)
- Cascade deletes dla relacji
- Unique constraints (workspaceId_userId)

---

### Multi-tenancy przez Workspace

Implementacja workspace isolation jest solid:

```typescript
async ensureMember(workspaceId: string, userId: string) {
  const member = await this.prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new ForbiddenException(...);
}
```

- Row-level security przez workspace filtering
- Zgodne z research: "Row-level security dla multi-tenant"
- Separation przez WorkspaceMember junction table

---

### Swagger/OpenAPI Documentation

Kompletna dokumentacja API:

```typescript
@ApiTags('Documents')
@ApiBearerAuth()
@ApiOperation({ summary: 'Create document' })
@ApiResponse({ status: 201, type: DocumentResponseDto })
```

- Zgodne z requirement: "API Docs: Swagger/OpenAPI"
- DTO jako Swagger schemas
- Proper HTTP status codes

---

## 📋 Zgodność z ADR

| ADR Decision | Status | Uwagi |
|--------------|--------|-------|
| Knowledge Forge jako standalone product (Opcja C) | ✅ Zgodne | Osobny monorepo, niezależny od hotelb2b |
| NestJS backend | ✅ Zgodne | TypeScript, spójny z ekosystemem |
| PostgreSQL + pgvector | ✅ Zgodne | Prisma schema z vector extension |
| OpenAI embeddings | ✅ Zgodne | text-embedding-3-small |
| Backblaze B2 storage | ✅ Zgodne | Implementacja StorageService |
| Clean Architecture (domain/application/infrastructure/interfaces) | ⚠️ Częściowo | Struktura jest, ale brak agregates i repository pattern |
| Multi-tenancy | ✅ Zgodne | Workspace-based isolation |
| Smart chunking (LLM-based) | ✅ Zgodne | Implementacja strategii chunkingu |

---

## Podsumowanie

### Priorytety do naprawy (przed production):

1. **CRITICAL:** Refactor do Repository Pattern (usuń bezpośrednie użycie Prisma)
2. **CRITICAL:** Fix SQL injection w SearchService
3. **HIGH:** Dodaj Domain Entities z logiką biznesową (usuń Anemic Domain Model)
4. **HIGH:** Dodaj Domain Events (przygotowanie pod Audytor Konfliktów)
5. **HIGH:** Refactor ChunkingService do Strategy Pattern
6. **MEDIUM:** Napisz testy jednostkowe (TDD)
7. **MEDIUM:** Podziel DocumentService (SRP)

### Silne strony:

- Dobra struktura folderów (Clean Architecture layers)
- Porty dla infrastruktury (DI przez interfejsy)
- Multi-tenancy przez Workspace
- Swagger documentation
- Prisma schema zgodny z wymaganiami

### Ocena ogólna:

**60/100** - Solidny fundament, ale wymaga refaktoryzacji do pełnego DDD/Clean Architecture przed uznaniem za production-ready. Główne problemy to Anemic Domain Model, brak Repository Pattern, i SQL injection vulnerability.

---

## Pliki do przeczytania (kontekst dla kolejnych review):

- CLAUDE.md ✅
- docs/specifications/2025-12-24-knowledge-forge.md ✅
- docs/ARCHITECTURE_DECISION.md ✅
- research/RAG_Knowledge_Base_Research_2025.md ✅
- apps/api/src/domain/* ✅
- apps/api/src/application/* ✅
- apps/api/src/infrastructure/* ✅
- apps/api/src/interfaces/* ✅
- apps/api/prisma/schema.prisma ✅
