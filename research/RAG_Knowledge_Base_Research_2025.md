# Research: Open Source RAG & Knowledge Base Solutions - 2025

**Data researchu:** 2025-12-23
**Cel:** Dogłębna analiza open source rozwiązań RAG i Knowledge Base możliwych do self-hostingu i udostępniania jako SaaS

---

## Executive Summary

RAG (Retrieval Augmented Generation) stał się fundamentalną technologią dla budowania systemów opartych na LLM. W 2025 rynek RAG frameworks szacowany jest na $1.85 miliarda, z szybkim wzrostem ekosystemu open source. Kluczowe trendy to:

- **Agentic RAG** - systemy z multi-step reasoning i autonomicznym planowaniem
- **GraphRAG** - wykorzystanie knowledge graphs dla lepszego kontekstu
- **Hybrid approaches** - łączenie RAG z fine-tuningiem
- **Self-hosting trend** - firmy odchodzą od kosztownych SaaS (np. Pinecone) na rzecz self-hosted rozwiązań

---

## 1. Popularne Open Source RAG Frameworks

### 1.1 LangChain

**Repozytorium:** https://github.com/langchain-ai/langchain
**Język:** Python, TypeScript
**Licencja:** MIT

**Zalety:**
- Największy ekosystem i community support
- Modular design - łatwe komponowanie pipeline'ów
- Szeroka integracja z LLM providers (OpenAI, Anthropic, local models)
- Najlepsze dla rapid prototyping
- LangGraph dla agentic workflows
- LangSmith dla observability i evaluation

**Wady:**
- Wysoki framework overhead (~10 ms)
- Najwyższe zużycie tokenów (~2.40k na query w benchmarkach)
- Stroma krzywa uczenia dla complex workflows
- Czasami "over-engineered" dla prostych use cases

**Best for:** Prototyping, complex orchestration, teams już w ekosystemie LangChain

**API Support:** Tak - przez LangServe

**Źródła:**
- [Best RAG Frameworks 2025: LangChain vs LlamaIndex vs Haystack](https://langcopilot.com/posts/2025-09-18-top-rag-frameworks-2024-complete-guide)
- [15 Best Open-Source RAG Frameworks in 2025](https://www.firecrawl.dev/blog/best-open-source-rag-frameworks)

---

### 1.2 LlamaIndex

**Repozytorium:** https://github.com/run-llama/llama_index
**Język:** Python, TypeScript
**Licencja:** MIT

**Zalety:**
- Data-first approach - najlepszy dla document-heavy applications
- Gentle learning curve - łatwiejszy start niż LangChain
- Advanced indexing strategies (tree-structured, keyword-aware)
- Najlepszy out-of-the-box RAG performance
- LlamaCloud (managed SaaS) i LlamaParse dla document parsing
- Smart chunking tools rozumiejące document structure

**Wady:**
- Mniejszy ecosystem niż LangChain
- Token usage ~1.60k (średni)
- Framework overhead ~6 ms

**Best for:** Data-intensive Q&A, complex document retrieval, production RAG

**API Support:** Tak - native REST API support

**Źródła:**
- [LlamaIndex vs. LangChain: Which RAG Tool is Right for You?](https://blog.n8n.io/llamaindex-vs-langchain/)
- [Best RAG Frameworks 2025](https://langcopilot.com/posts/2025-09-18-top-rag-frameworks-2024-complete-guide)

---

### 1.3 Haystack

**Repozytorium:** https://github.com/deepset-ai/haystack
**Język:** Python
**Licencja:** Apache 2.0
**Maintainer:** deepset

**Zalety:**
- Production-ready z 99.9% uptime w testach
- Typed, reusable components z explicit I/O
- First-class instrumentation per-step
- Najniższy token usage (~1.57k)
- Framework overhead ~5.9 ms
- REST API to deploy z minimal setup
- File converters dla HTML, PDF, Word, etc.

**Wady:**
- Mniejsze community niż LangChain/LlamaIndex
- Wymaga więcej boilerplate code

**Best for:** Production pipelines, search-heavy RAG, testable workflows

**API Support:** Tak - REST API built-in

**Managed offering:** deepset Cloud/Enterprise

**Źródła:**
- [Haystack RAG Frameworks Comparison](https://research.aimultiple.com/rag-frameworks/)
- [RAG in Production with Haystack](https://4561480.fs1.hubspotusercontent-na1.net/hubfs/4561480/Ebooks%20whitepapers%20and%20reports/O'Reilly%20Guide%20-%20RAG%20in%20Production%20with%20Haystack/OReilly%20Guide%20-%20RAG_in_production_with_Haystack-FINAL.pdf)

---

### 1.4 DSPy

**Zalety:**
- Najniższy framework overhead (~3.53 ms)
- Programmatic approach - declare-compile-optimize
- Token usage ~2.03k

**Wady:**
- Bardziej research-oriented
- Mniejszy ecosystem

**Best for:** Researchers, teams optymalizujące performance

---

### Framework Comparison Table

| Framework | Overhead | Token Usage | Learning Curve | Best For | API Ready |
|-----------|----------|-------------|----------------|----------|-----------|
| **LangChain** | ~10 ms | ~2.40k | Steep | Prototyping, Complex workflows | ✅ LangServe |
| **LlamaIndex** | ~6 ms | ~1.60k | Gentle | Data-heavy Q&A | ✅ Native |
| **Haystack** | ~5.9 ms | ~1.57k | Medium | Production pipelines | ✅ Built-in |
| **DSPy** | ~3.53 ms | ~2.03k | Steep | Performance optimization | ❌ |
| **LangGraph** | ~14 ms | ~2.03k | Steep | Agentic workflows | ✅ |

---

## 2. Vector Databases - Open Source

### 2.1 Milvus

**Repozytorium:** https://github.com/milvus-io/milvus
**GitHub Stars:** 35,000+
**Język:** Go
**Licencja:** Apache 2.0

**Zalety:**
- Industrial scale - billions of vectors
- GPU acceleration, distributed querying
- Multiple indexing methods (IVF, HNSW, PQ)
- Kubernetes-native
- Multi-tenancy support (database/collection/partition level)
- Excellent performance metrics

**Wady:**
- Requires data engineering expertise
- Higher resource requirements
- Complex setup

**Multi-tenancy:** Database, Collection, Partition level isolation

**Self-hosting:** ✅ Docker, Kubernetes
**Managed offering:** Zilliz Cloud

**Pricing (Zilliz):**
- Free tier: prototyping
- Serverless: $4 per million vCUs
- Dedicated: from $99/month
- Self-hosted: ~$500-1000/mo AWS dla 50M vectors

**Best for:** Enterprise scale, billions of vectors, GPU workloads

**Źródła:**
- [Top 5 Open Source Vector Databases for 2025](https://medium.com/@fendylike/top-5-open-source-vector-search-engines-a-comprehensive-comparison-guide-for-2025-e10110b47aa3)
- [Designing Multi-Tenancy RAG with Milvus](https://milvus.io/blog/build-multi-tenancy-rag-with-milvus-best-practices-part-one.md)

---

### 2.2 Qdrant

**Repozytorium:** https://github.com/qdrant/qdrant
**Język:** Rust
**Licencja:** Apache 2.0

**Zalety:**
- Written in Rust - high performance
- Real-time data updates
- Rich filtering - combines vector search with traditional filtering
- Payload-based filtering integrated into search
- Easy Python/JavaScript integration
- Simple API

**Wady:**
- Resource usage above 100M vectors can be high

**Multi-tenancy:** Partition-key based isolation

**Self-hosting:** ✅ Docker, Kubernetes
**Managed offering:** Qdrant Cloud (1GB free forever)

**Best for:** Real-time applications, complex filtering needs

**Źródła:**
- [Vector Database Comparison: Qdrant vs Weaviate vs Milvus](https://liquidmetal.ai/casesAndBlogs/vector-comparison/)
- [Best Vector Databases in 2025](https://www.firecrawl.dev/blog/best-vector-databases-2025)

---

### 2.3 Weaviate

**Repozytorium:** https://github.com/weaviate/weaviate
**Język:** Go
**Licencja:** BSD-3-Clause

**Zalety:**
- Hybrid system - vector search + knowledge graph
- GraphQL APIs
- Real-time queries
- Multimodal data support
- Semantic search + relationship understanding

**Wady:**
- Resource intensive above 100M vectors
- Needs more memory than alternatives at large scale

**Multi-tenancy:** Namespace/tenant isolation

**Self-hosting:** ✅ Docker, Kubernetes
**Managed offering:** Weaviate Cloud (from $25/mo after 14-day trial)

**Best for:** Semantic search, hybrid search, <50M vectors

**Źródła:**
- [Best Vector Databases 2025](https://www.datacamp.com/blog/the-top-5-vector-databases)
- [Weaviate Pricing](https://weaviate.io/pricing)

---

### 2.4 Chroma

**Repozytorium:** https://github.com/chroma-core/chroma
**Język:** Python
**Licencja:** Apache 2.0

**Zalety:**
- Developer-friendly
- Lightweight
- Intuitive API
- High accuracy with impressive recall
- Excellent for prototyping

**Wady:**
- Not for billions of vectors
- Not ideal for multi-tenant enterprise

**Best for:** Prototyping, small/medium apps, rapid development

**Self-hosting:** ✅ Easy Docker setup
**Managed offering:** Chroma Cloud (w rozwoju)

**Źródła:**
- [Best Vector Databases 2025](https://www.firecrawl.dev/blog/best-vector-databases-2025)

---

### 2.5 pgvector (PostgreSQL Extension)

**Repozytorium:** https://github.com/pgvector/pgvector
**Licencja:** PostgreSQL License (podobna do MIT)
**Wersja:** v0.8.1
**Support:** Postgres 13+

**Zalety:**
- Unified data storage - vectors + relational data w jednej bazie
- Leverage existing Postgres infrastructure
- HNSW i IVFFlat indexes
- Cosine distance calculations
- Scale jak Postgres (vertical, horizontal, Citus sharding)
- Half-precision vectors (do 4000 dimensions)
- Binary quantization (do 64000 dimensions)

**Wady:**
- Słabsza performance niż dedicated vector DBs dla bardzo dużych zbiorów
- Limited to Postgres capabilities

**Multi-tenancy:** Row-level security, schema/database level

**Best for:** Teams już na Postgres, unified storage needs, <10M vectors

**Integracje:** LangChain (langchain-postgres), LlamaIndex, Haystack

**Źródła:**
- [PostgreSQL with pgvector as Vector Database for RAG](https://codeawake.com/blog/postgresql-vector-database)
- [Building Multi-Tenant RAG with PostgreSQL](https://medium.com/timescale/building-multi-tenant-rag-applications-with-postgresql-choosing-the-right-approach-a3c697193f0e)

---

### Vector DB Recommendations by Use Case

| Use Case | Recommended Database | Why |
|----------|---------------------|-----|
| **Prototyping** | Chroma, pgvector | Lightweight, easy setup |
| **Production <10M vectors** | Qdrant, pgvector | Good performance, manageable |
| **Production >100M vectors** | Milvus, Qdrant | Proven at scale |
| **Hybrid/Semantic search** | Weaviate | Knowledge graph capabilities |
| **Real-time updates** | Qdrant | Built for it |
| **Existing Postgres stack** | pgvector | Unified architecture |
| **GPU workloads** | Milvus | GPU acceleration |
| **Complex filtering** | Qdrant | Best filtering support |

---

## 3. Gotowe Rozwiązania Knowledge Base z RAG

### 3.1 RAGFlow

**Repozytorium:** https://github.com/infiniflow/ragflow
**Maintainer:** InfiniFlow
**Licencja:** Apache 2.0

**Kluczowe Features:**
- Deep document understanding - OCR, tables, complex layouts
- Visual web interface dla document management
- GraphRAG support (knowledge graphs)
- Agentic reasoning capabilities
- Multiple embedding options
- Flexible storage (Elasticsearch, Infinity)
- **Comprehensive REST API + Python SDK**
- Support: Word, slides, excel, txt, images, scanned copies, structured data, web pages

**Docker Images:**
- Slim: 2GB
- Full: 9GB (z embedded models)

**Zalety:**
- Production-ready z gotowym API
- Kompleksowa obsługa dokumentów
- Granular control over retrieval pipeline
- Response times <500ms even with heavy workloads

**Wady:**
- Bardziej complex setup niż Dify
- Power tool - wymaga technicznej wiedzy

**Best for:** Document-heavy applications, high retrieval accuracy, technical teams

**Źródła:**
- [RAGFlow GitHub](https://github.com/infiniflow/ragflow)
- [Dify vs RAGFlow vs FastGPT Comparison](https://www.kdjingpai.com/en/ruhezai-difyfas/)

---

### 3.2 Dify

**Repozytorium:** https://github.com/langgenius/dify
**Licencja:** Apache 2.0 (with commercial restrictions for SaaS)

**Kluczowe Features:**
- Visual workflow editor (low-code)
- End-to-end LLM application platform
- RAG pipeline z document processing (PDF, PPT, etc.)
- Prompt IDE
- Enterprise LLMOps capabilities
- Backend-as-a-Service (BaaS)
- **REST API dla integrations**
- Support dla 100+ LLM models
- External knowledge base integration (np. z RAGFlow)

**Zalety:**
- User-friendly - non-technical users mogą używać
- Fast to get up and running
- Comprehensive tooling
- 20% improvement w retrieval hit rate vs OpenAI Assistants API

**Wady:**
- Apache 2.0 z restrictions dla cloud SaaS offerings
- Mniej granular control niż RAGFlow

**Best for:** Enterprise applications, complex workflows, team collaboration, fast deployment

**Observability:** Built-in monitoring i evaluation

**Źródła:**
- [15 Best Open-Source RAG Frameworks](https://www.firecrawl.dev/blog/best-open-source-rag-frameworks)
- [Dify Integration with RAGFlow](https://www.kdjingpai.com/en/dify-v101waiguarag/)

---

### 3.3 Flowise

**Repozytorium:** https://github.com/FlowiseAI/Flowise
**Licencja:** Apache 2.0

**Kluczowe Features:**
- Drag-and-drop UI (no-code/low-code)
- Visual node-based editor
- Built on LangChain i LlamaIndex
- Pre-built integrations
- **Deploy as API quickly**
- Chatbots, RAG systems, autonomous agents

**Zalety:**
- Dostępny dla non-coders
- Rapid prototyping
- Self-hostable (data privacy)
- Teams z różnym tech level mogą używać

**Wady:**
- Abstrakcja może limitować advanced use cases
- Mniej kontroli niż pure code approach

**Best for:** Rapid prototyping, mixed-skill teams, non-technical users

**Źródła:**
- [15 Best Open-Source RAG Frameworks](https://apidog.com/blog/best-open-source-rag-frameworks/)
- [Flowise Alternatives](https://merlio.app/blog/flowise-ai-alternatives-open-source-self-hosted)

---

### 3.4 AnythingLLM

**Repozytorium:** https://github.com/Mintplex-Labs/anything-llm
**Licencja:** MIT

**Kluczowe Features:**
- Full-stack private RAG application
- Multi-user z role-based access control
- Desktop app + self-hosted deployment
- Commercial LLMs + local models (Ollama)
- Multiple vector DB support
- Document management interface
- **AI Agents support**
- **MCP (Model Context Protocol) Tools**
- **Embed widget** dla integration w innych apps
- No-code agent builder

**Zalety:**
- Privacy-focused - full local deployment możliwy
- User-friendly interface
- Multi-user enterprise features
- Agent capabilities
- LanceDB vectors by default

**Wady:**
- Młodszy projekt niż niektóre konkurencje

**Best for:** Teams potrzebujące private deployment, multi-user workspaces, agent capabilities

**Źródła:**
- [AnythingLLM Review 2025](https://skywork.ai/blog/anythingllm-review-2025-local-ai-rag-agents-setup/)
- [AnythingLLM GitHub](https://github.com/Mintplex-Labs/anything-llm)

---

### 3.5 PrivateGPT

**Zalety:**
- Focused na privacy i local deployment
- Simple dla document Q&A

**Wady:**
- Mniej features niż AnythingLLM czy Dify
- Brak multi-user features
- Prostszy scope

**Best for:** Single-user, maximum privacy, simple doc Q&A

---

### 3.6 Langflow

**Repozytorium:** https://github.com/logspace-ai/langflow
**Licencja:** MIT

**Features:**
- Low-code app builder
- Visual workflow design
- Python-based
- Agnostic to models, APIs, databases
- RAG and multi-agent applications

**Best for:** Visual workflow builders, rapid prototyping

---

## 4. Chunking Strategies - Best Practices 2025

### 4.1 Recommended Chunk Sizes

**Industry Standards:**
- **Optimal size:** 256-512 tokens
- **Overlap:** 10-20% (for 500-token chunk: 50-100 tokens overlap)
- **NVIDIA findings:** 15% overlap performs best with 1,024 token chunks

### 4.2 Chunking Methods - Performance Comparison

**Top Performers (70% accuracy boost):**

1. **Semantic Chunking** 🏆
   - Breaks text at semantic boundaries
   - Ensures coherent information within chunks
   - Best for maintaining context
   - Effectiveness varies by dataset

2. **Page-Level Chunking**
   - Achieved highest accuracy in NVIDIA 2024 benchmarks
   - Best for complex analytical queries
   - Requires broader context
   - Works well with FinanceBench, KG-RAG datasets

3. **Recursive Character Text Splitter**
   - Robust baseline approach
   - Start simple, then specialize
   - Good general-purpose method

### 4.3 Core Principles

**Balance Size and Semantics:**
- Large enough for meaningful context
- Small enough for computational efficiency

**Preserve Context:**
- Break at natural boundaries (paragraphs, sections)
- Add contextual metadata

**No Universal Strategy:**
- Fixed-size vs AI-driven dynamic chunking
- Experiment dla specific use case

**Hybrid Approaches Excel:**
- Mix strategies dla different content types

### 4.4 Query-Based Considerations

**Factoid Queries (seeking specific info):**
- Perform well with 256-512 tokens
- Smaller chunks are better

**Complex Analytical Queries:**
- Benefit from larger chunks (1,024 tokens)
- Or page-level chunking
- Need broader context and deeper reasoning

### 4.5 Pre-Chunking vs Post-Chunking

**Pre-Chunking (most common):**
- Process documents asynchronously
- Break into pieces before embedding
- Store in vector DB
- Fast retrieval at query time
- Requires upfront decisions

**Post-Chunking:**
- Embed entire documents first
- Chunk at query time only on retrieved docs
- Results can be cached (faster over time)
- More dynamic, context-aware
- Avoids chunking documents never queried

### 4.6 Evaluation Best Practices

- Set up evaluation set for specific use case
- Track impact on RAG performance
- Use human reviews + LLM evaluators
- Filter by cosine similarity scores
- Rate sample queries consistently

**Tools:**
- Unstructured.io
- LlamaParse (LlamaIndex)
- Docling (IBM)
- RecursiveCharacterTextSplitter (LangChain)

**Źródła:**
- [Best Chunking Strategies for RAG in 2025](https://www.firecrawl.dev/blog/best-chunking-strategies-rag-2025)
- [NVIDIA: Finding the Best Chunking Strategy](https://developer.nvidia.com/blog/finding-the-best-chunking-strategy-for-accurate-ai-responses/)
- [Document Chunking for RAG: 9 Strategies Tested](https://langcopilot.com/posts/2025-10-11-document-chunking-for-rag-practical-guide)

---

## 5. Embedding Models - 2025 Comparison

### 5.1 Commercial vs Open Source

**OpenAI Embeddings:**

**Models:**
- `text-embedding-3-large` - $0.13 per 1M tokens
- `text-embedding-3-small` - $0.02 per 1M tokens

**Zalety:**
- High semantic accuracy
- Excellent contextual understanding
- Easy API integration
- State-of-the-art performance

**Wady:**
- API latency
- Cost scales with usage
- Not suitable for offline/privacy-sensitive
- Vendor lock-in

---

**Sentence-Transformers (Open Source):**

**Popular Models:**
- `all-mpnet-base-v2` - 768-dimensional vectors
  - Most downloaded on Hugging Face
  - Apache 2.0 license
  - Good balance of quality and speed
  - Limitation: truncates at 384 word pieces

- `all-MiniLM` family
  - Very fast
  - Memory efficient
  - Good for high-throughput scenarios

**Zalety:**
- No API costs
- Run offline
- Full data control
- No latency from API calls
- Apache 2.0 - commercial use OK

**Wady:**
- Lower accuracy than OpenAI for some tasks
- Need to manage infrastructure
- Truncation limits on context

---

**Microsoft E5 Series:**
- Most advanced open source embedding technology
- Competes with best commercial options
- Completely free to use and modify

---

**Google Gemini:**
- Best value for small businesses
- Free high-quality embeddings
- Generous usage limits

---

**Qwen3-Embedding-0.6B:**
- Specialized dla semantic search, reranking, clustering
- Multilingual
- Instruction-aware
- Flexible vector dimensions

---

### 5.2 Performance & Cost Considerations

**Break-even Analysis:**
- Apps processing >1.5M tokens monthly: open source models (Sentence-Transformers) mają lepszy ROI
- Cost savings + data control > accuracy difference

**Latency:**
- OpenAI API: higher latency
- Google embedding API: slower than OpenAI
- Open source on CPU: fastest (no network overhead)

### 5.3 Use Case Recommendations

| Use Case | Best Options | Why |
|----------|-------------|-----|
| **Semantic Search & Retrieval** | OpenAI, Cohere, Sentence-Transformers | High accuracy, proven |
| **Offline/Privacy-Sensitive** | Sentence-Transformers, E5, FastText | No API dependency |
| **High-Throughput** | all-MiniLM, E5 | Speed optimized |
| **Multilingual** | Qwen3-Embedding | Built for it |
| **Cost-Sensitive** | Sentence-Transformers, Gemini | Free/cheap |
| **Maximum Accuracy** | OpenAI 3-large, Cohere | Best performance |

### 5.4 Implementation Tips

**Dla większości production apps:**
- Start with Sentence-Transformers (all-mpnet-base-v2)
- Measure baseline performance
- Upgrade to OpenAI tylko jeśli accuracy gap is critical
- Consider hybrid: batch processing z open source + real-time z OpenAI

**Źródła:**
- [13 Best Embedding Models in 2025](https://elephas.app/blog/best-embedding-models)
- [Embedding Models Comparison: OpenAI vs Sentence-Transformers](https://markaicode.com/embedding-models-comparison-openai-sentence-transformers/)
- [Should you use OpenAI's embeddings?](https://iamnotarobot.substack.com/p/should-you-use-openais-embeddings)

---

## 6. Multi-Tenancy & Workspace Isolation

### 6.1 Multi-Tenancy Patterns

**Definition:**
Multi-tenancy = single instance serves multiple customers (tenants) simultaneously z data isolation zapewniającą privacy i security.

### 6.2 Isolation Strategies

#### 1. Database/Store-per-Tenant (Silo Pattern)

**Characteristics:**
- Highest level of isolation
- Entire stack independently per tenant
- Complete data separation
- No noisy neighbor problem

**Zalety:**
- Maximum security
- Performance isolation
- Easy to customize per tenant

**Wady:**
- Higher infrastructure cost
- Complex management at scale

**Use case:** Regulated industries, enterprise customers demanding isolation

**Example:** Neon - database-per-user design

---

#### 2. Namespace/Partition-Based Isolation

**Characteristics:**
- Shared infrastructure
- Logical partitioning
- Independent scaling per namespace

**Implementations:**

**Pinecone:**
- Namespaces within index
- Independent operation and scaling
- No query slowdown from other tenants
- Single query interacts with one namespace only

**Turbopuffer:**
- Scales to millions of namespaces
- Natural data partitioning
- Performance and security isolation

**Zalety:**
- Better resource utilization than silo
- Good isolation
- Scalable

**Wady:**
- Shared infrastructure limits
- Potential for noisy neighbor (mitigated)

---

#### 3. Collection/Partition-Level (Milvus)

**Milvus offers 3 levels:**

1. **Database-level:** Separate databases per tenant
2. **Collection-level:** Tenants share database, separate collections
3. **Partition-level:** Tenants share collection, separate partitions
   - Balances isolation and search performance
   - Limited by Milvus's max partition limit

**Zalety:**
- Flexible choice based on needs
- Can optimize for scale vs isolation

**Wady:**
- Partition limits
- Complex to manage

---

#### 4. PostgreSQL/pgvector Approaches

**4 levels:**

1. **Table-level:** Shared database, separate tables
2. **Schema-level:** Separate schemas per tenant
3. **Logical database:** Separate logical DBs
4. **Database service:** Completely separate DB instances

**Row-Level Security (RLS):**
- Fine-grained access control
- Crucial for multi-tenant
- Ensures data isolation at query time

**Zalety:**
- Leverage Postgres maturity
- RLS bardzo powerful
- Unified data model możliwy

---

### 6.3 Noisy Neighbor Problem

**Problem:**
- Few customers = disproportionate system activity
- Other customers suffer: higher latencies, locks, unavailability

**Solutions:**
- Namespace isolation (Pinecone, Turbopuffer)
- Database-per-tenant (Neon)
- Resource quotas per tenant
- Monitoring and throttling

---

### 6.4 Recommendations by Vector DB

| Vector DB | Recommended Approach | Notes |
|-----------|---------------------|-------|
| **Pinecone** | Namespaces | Most common, best alternative |
| **Milvus** | Collection or Partition-level | Flexible, choose based on scale |
| **Qdrant** | Partition-key based | Good filtering integration |
| **Weaviate** | Namespace/tenant isolation | Hybrid search compatible |
| **pgvector** | Schema or RLS | Leverage Postgres features |
| **Neon** | Database-per-user | Complete isolation |

### 6.5 Architecture Considerations

**For SaaS RAG Platform:**

1. **Start simple:** Namespace-based isolation
2. **Monitor:** Track per-tenant usage, latency
3. **Scale strategy:**
   - Small tenants: shared collections/namespaces
   - Enterprise: dedicated databases/collections
4. **Security:** Always enforce isolation at query level
5. **Observability:** Per-tenant metrics essential

**Źródła:**
- [Multi-Tenancy in Vector Databases - Pinecone](https://www.pinecone.io/learn/series/vector-databases-in-production-for-busy-engineers/vector-database-multi-tenancy/)
- [Designing Multi-Tenancy RAG with Milvus](https://milvus.io/blog/build-multi-tenancy-rag-with-milvus-best-practices-part-one.md)
- [Building Multi-Tenant RAG with PostgreSQL](https://medium.com/timescale/building-multi-tenant-rag-applications-with-postgresql-choosing-the-right-approach-a3c697193f0e)

---

## 7. REST API Best Practices dla RAG

### 7.1 Core API Design Principles

#### HATEOAS (Hypertext as Engine of Application State)

**Principle:**
- Clients navigate resources through hyperlinks in responses
- No prior knowledge of URIs needed
- Each GET returns info + links to related resources
- Self-documenting API

**Example:**
```json
{
  "document_id": "123",
  "name": "Q4_Report.pdf",
  "_links": {
    "self": "/api/documents/123",
    "chunks": "/api/documents/123/chunks",
    "embeddings": "/api/documents/123/embeddings",
    "search": "/api/search?document_id=123"
  }
}
```

---

#### OpenAPI Specification

**Best Practice:**
- Use OpenAPI (Swagger) for API documentation
- Standard template format
- Describe: API, consumers, maintainers, location, tests
- Centralized, editable system
- Auto-generate client SDKs

**Tools:**
- Swagger UI
- Redoc
- OpenAPI Generator

---

### 7.2 RAG-Specific API Patterns

#### Document Ingestion Endpoint

**POST /api/documents**

```json
{
  "file": "<multipart/form-data>",
  "metadata": {
    "source": "web",
    "category": "technical",
    "tags": ["api", "rag"],
    "verification_status": "pending"
  },
  "chunking_strategy": "semantic",
  "chunk_size": 512,
  "overlap": 50
}
```

**Response:**
```json
{
  "document_id": "doc_abc123",
  "status": "processing",
  "chunks_created": 45,
  "embeddings_generated": 45,
  "_links": {
    "status": "/api/documents/doc_abc123/status",
    "chunks": "/api/documents/doc_abc123/chunks"
  }
}
```

---

#### Search/Query Endpoint

**POST /api/search** (lub /api/query)

```json
{
  "query": "How do I implement RAG?",
  "filters": {
    "category": "technical",
    "tags": ["rag"],
    "date_range": {
      "start": "2025-01-01",
      "end": "2025-12-31"
    }
  },
  "top_k": 5,
  "rerank": true,
  "include_sources": true
}
```

**Response:**
```json
{
  "query": "How do I implement RAG?",
  "results": [
    {
      "chunk_id": "chunk_xyz789",
      "document_id": "doc_abc123",
      "content": "RAG implementation involves...",
      "score": 0.95,
      "metadata": {
        "source": "technical_doc.pdf",
        "page": 12
      }
    }
  ],
  "generation": {
    "answer": "To implement RAG, you need...",
    "sources": ["doc_abc123", "doc_def456"],
    "confidence": 0.89
  }
}
```

---

#### Retrieval Endpoint (bez generation)

**GET /api/retrieve**

```
GET /api/retrieve?q=vector+databases&top_k=10&filters=category:technical
```

---

#### Document Management

**GET /api/documents** - list documents
**GET /api/documents/{id}** - get specific document
**PUT /api/documents/{id}** - update metadata
**DELETE /api/documents/{id}** - delete document
**GET /api/documents/{id}/chunks** - get chunks
**GET /api/documents/{id}/status** - processing status

---

### 7.3 Best Practices

**1. Versioning**
- Use URL versioning: `/api/v1/search`
- Or header versioning: `Accept: application/vnd.myapi.v1+json`

**2. Pagination**
```json
{
  "results": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "next": "/api/documents?page=2",
    "prev": null
  }
}
```

**3. Error Handling**
```json
{
  "error": {
    "code": "INVALID_CHUNK_SIZE",
    "message": "Chunk size must be between 128 and 2048 tokens",
    "details": {
      "provided": 3000,
      "min": 128,
      "max": 2048
    }
  }
}
```

**4. Rate Limiting**
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- 429 Too Many Requests status

**5. Authentication**
- JWT tokens
- API keys in headers: `Authorization: Bearer <token>`
- Never in URL query params

**6. Async Operations**
```json
{
  "job_id": "job_123",
  "status": "processing",
  "progress": 45,
  "_links": {
    "status": "/api/jobs/job_123"
  }
}
```

**7. Webhooks dla Long-Running Tasks**
- Document processing completion
- Embedding generation done
- Index updated

---

### 7.4 Example: R2R Framework

**R2R** = production-ready RAG with RESTful API

**Features:**
- Deep Research API - multi-step reasoning
- Agentic capabilities
- Docker containerization
- Cross-platform compatibility
- Minimal configuration deployment

**API Design:**
- Standard REST endpoints
- Python SDK included
- Comprehensive documentation

---

### 7.5 Knowledge Base Quality APIs

**Endpoint dla metadata enrichment:**

**POST /api/documents/{id}/enrich**

```json
{
  "auto_tag": true,
  "extract_entities": true,
  "generate_summary": true
}
```

**Verification status workflow:**

**PUT /api/documents/{id}/verify**

```json
{
  "verification_status": "verified",
  "verified_by": "user_123",
  "notes": "Content accuracy confirmed"
}
```

---

### 7.6 Security Best Practices

**Data Isolation:**
- Separate vector stores: public vs private data
- Namespace/tenant isolation in API layer
- Row-level security dla multi-tenant

**PII Handling:**
- Exclude PII before ingestion
- Implement scanning endpoints
- GDPR compliance (right to deletion)

**Access Controls:**
- Role-based access (RBAC)
- Document-level permissions
- Audit logging

---

**Źródła:**
- [Building a Knowledge Base for RAG Applications](https://www.astera.com/type/blog/building-a-knowledge-base-rag/)
- [RAG Best Practices from 100+ Teams](https://www.kapa.ai/blog/rag-best-practices)
- [REST API Design Best Practices](https://www.techtarget.com/searchapparchitecture/tip/16-REST-API-design-best-practices-and-guidelines)

---

## 8. Document Processing - PDF, Text, Web

### 8.1 Document Parsing Solutions

#### 8.1.1 LlamaParse (LlamaIndex)

**Produkt:** LlamaCloud - managed SaaS
**Licencja:** Commercial (part of LlamaCloud)

**Features:**
- GenAI-native parser
- VLM-powered OCR
- Self-correcting reasoning loops
- File types: PDF, PPTX, DOCX, XLSX, HTML
- Table recognition
- Multimodal parsing (text + visual elements)
- Custom parsing with prompt instructions

**Performance (2025 Benchmark):**
- Speed: ~6s consistently (all page counts) 🏆
- Numerical accuracy: strong for simple tables
- Struggles: complex formatting, multi-column text

**Pricing:**
- Free: 1000 pages/day
- Paid: 7k pages/week free + $0.003/additional page

**Best for:** Speed-critical applications, simple layouts

**Integration:** Direct LlamaIndex integration, Neo4j (knowledge graphs)

---

#### 8.1.2 Unstructured.io

**Repozytorium:** https://github.com/Unstructured-IO/unstructured
**Licencja:** Apache 2.0 (open source) + Commercial API

**Features:**
- OCR + Transformer-based NLP
- Text and table extraction
- Formats: PDF, DOCX, HTML
- Open-source + API-based options
- LangChain integration

**Performance:**
- Text extraction: 100% numerical accuracy (simple cases)
- Complex tables: column shifts, inconsistencies
- Speed: slow (51s for 1 page, 141s for 50 pages) 🐌

**Zalety:**
- Flexibility and versatility
- Strong LangChain pipelines
- Good for automation

**Wady:**
- Layout awareness struggles (complex docs)
- Performance trade-off

**Best for:** Diverse document types, automation pipelines, LangChain users

---

#### 8.1.3 Docling (IBM)

**Repozytorium:** https://github.com/DS4SD/docling
**Licencja:** MIT (open source)
**Maintainer:** IBM Research

**Features:**
- Structured information extraction
- Excel at tables, formulas, images
- Formats: PDF, DOCX, HTML
- Effective text chunking strategies
- Vector database creation support

**Performance:**
- Top performer in 2025 benchmarks (with LlamaParse)
- Strong layout awareness
- Complex document handling

**Best for:** Complex layouts, tables, scientific documents

**Integration:** LlamaIndex, standalone Python library

---

### 8.2 PDF Processing Challenges

**Common Problems:**
- Fixed-layout design (visual over data)
- Text stored as positioned elements (not logical structures)
- Multi-column layouts scramble extraction order
- Tables and images break semantic flow
- Scanned images need OCR (accuracy issues)
- Handwritten notes, form elements, watermarks
- Inconsistent formatting

**Solutions:**
- Use specialized parsers (LlamaParse, Docling, Unstructured)
- Implement semantic chunking post-extraction
- OCR pipeline dla scanned documents
- Validate extraction quality

---

### 8.3 Web Scraping dla RAG

#### 8.3.1 Firecrawl

**Features:**
- Natural language extraction (no CSS selectors)
- Deep research endpoint
- Clean Markdown output
- OpenAI-like deep research integration

**Best for:** Web content dla RAG pipelines, research agents

---

#### 8.3.2 Crawl4AI

**Features:**
- AI integration focus
- Clean Markdown output
- Ready for LLM ingestion

**Best for:** Web crawling specifically dla AI/LLM workflows

---

#### 8.3.3 LangChain Web Loaders

**Tools:**
- `WebBaseLoader` - urllib + BeautifulSoup (static pages)
- `UnstructuredURLLoader` - maintains layouts
- `SeleniumURLLoader` - JavaScript-loaded content
- `RecursiveURLLoader` - crawl entire sites
- `SitemapLoader` - sitemap-based crawling

**Best for:** LangChain users, diverse web scraping needs

---

### 8.4 Multi-Format Support Summary

| Tool | PDF | DOCX | HTML | Excel | Images | OCR | API |
|------|-----|------|------|-------|--------|-----|-----|
| **LlamaParse** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ VLM | ✅ |
| **Unstructured** | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ |
| **Docling** | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ❌ |
| **Firecrawl** | ❌ | ❌ | ✅ | ❌ | ⚠️ | ❌ | ✅ |
| **Haystack** | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ |

---

### 8.5 Recommended Hybrid Strategy

**Best Practice:**
- Use multiple parsers dla different document types
- LlamaParse dla speed + simple docs
- Docling dla complex layouts + tables
- Unstructured dla automation pipelines
- Validate extraction quality
- Fallback strategies

**Example Architecture:**
```
Document Upload
    ↓
Document Type Detection
    ├─→ PDF with tables → Docling
    ├─→ Simple PDF → LlamaParse
    ├─→ Web page → Firecrawl
    └─→ Other → Unstructured
    ↓
Quality Check
    ↓
Chunking Strategy
    ↓
Embedding + Storage
```

**Źródła:**
- [PDF Data Extraction Benchmark 2025](https://procycons.com/en/blogs/pdf-data-extraction-benchmark/)
- [LlamaParse vs Unstructured vs Vectorize](https://www.chitika.com/best-pdf-extractor-rag-comparison/)
- [Building Production-Ready RAG with LlamaIndex](https://decodo.com/blog/build-production-rag-llamaindex-web-scraping)

---

## 9. Metadata Filtering & Tagging

### 9.1 Automated Metadata Tagging

**LLM-Based Auto-Tagging:**

**Frameworks supporting auto-tagging:**
- **LlamaIndex:** Auto-Retrieval
- **LangChain:** Self-Querying

**Process:**
1. LLM analyzes incoming queries
2. Automatically extracts metadata filters
3. Applies filtering behind the scenes
4. No manual user input needed

**Benefits:**
- Increased relevancy of retrieved data
- Better user experience
- Reduced manual tagging work

---

### 9.2 Pre-filtering vs Post-filtering

#### Pre-filtering (Metadata Filtering)

**Process:**
1. Apply metadata filters first
2. Narrow down document set
3. Then apply vector similarity search on narrowed set

**Advantages:**
- Faster search (smaller search space)
- More relevant results
- Efficient for large corpora

**Use cases:**
- Date ranges
- Categories
- Access levels
- Document types

**Example:**
```
Filter: category = "technical" AND date >= "2025-01-01"
    ↓ (narrowed to 1000 docs)
Vector Search: top 10 most similar
```

---

#### Post-filtering

**Process:**
1. Broad vector similarity search first
2. Then filter results by metadata
3. Refine final output

**Use cases:**
- Complex multi-criteria filtering
- When metadata criteria are query-dependent

---

#### Hybrid Approach (Recommended)

**Process:**
- Pre-filter by broad criteria (dates, categories)
- Vector search on filtered set
- Post-filter for refinement

**Best performance for most scenarios**

---

### 9.3 Types of Metadata to Store

**Essential Metadata Fields:**

**Document-Level:**
- `document_id` (unique)
- `title`
- `author`
- `source` (web, upload, API)
- `document_type` (PDF, text, webpage)
- `created_at`
- `updated_at`
- `size_bytes`
- `language`

**Content Categorization:**
- `category` (technical, legal, marketing, etc.)
- `tags` (array: ["rag", "api", "production"])
- `topics` (auto-extracted by LLM)
- `entities` (people, orgs, locations)

**Access Control:**
- `access_level` (public, internal, confidential)
- `owner_id`
- `shared_with` (array of user/group IDs)
- `tenant_id` (dla multi-tenancy)

**Quality & Verification:**
- `verification_status` (pending, verified, rejected)
- `verified_by`
- `verification_date`
- `quality_score`
- `review_notes`

**Chunk-Level Metadata:**
- `chunk_id`
- `document_id` (parent)
- `chunk_index` (position in document)
- `page_number`
- `section_title`
- `chunk_type` (paragraph, table, list)

---

### 9.4 Security Use Cases

**Access Control via Metadata:**

```json
{
  "user_query": "Show me financial reports",
  "user_metadata": {
    "user_id": "user_123",
    "access_level": "manager",
    "department": "finance"
  }
}
```

**Filter applied:**
```
access_level IN ["public", "internal", "manager"]
AND (owner_id = "user_123" OR department = "finance")
```

**Benefits:**
- Row-level security
- Automatic data isolation
- Compliance (GDPR, HIPAA)

---

### 9.5 Graph-Based Metadata Filtering

**Approach:**
- Combine vector search with knowledge graphs
- Rich relationship modeling
- Complex filter expressions
- LLM function-calling → Cypher queries (Neo4j)

**Advantages over flat metadata:**
- Virtually limitless structured filters
- Relationship-aware queries
- Complex traversals

**Example:**
```cypher
MATCH (doc:Document)-[:AUTHORED_BY]->(author:Person)
WHERE author.department = "Research"
AND doc.published_date > date("2025-01-01")
RETURN doc
```

**Tools:**
- Neo4j + vector search
- GraphRAG (Microsoft)
- RAGFlow (GraphRAG support)

---

### 9.6 Filtering Limitations (Vectorize Example)

**Exact Match Only:**
- Cannot use range queries
- Cannot use partial matches
- Cannot use complex operators
- Only equals or IN (list matching)

**Workaround:**
- Use more sophisticated vector DBs (Qdrant, Weaviate)
- Implement post-filtering for complex criteria
- Consider graph databases dla rich filtering

---

### 9.7 Hybrid Search Best Practices

**Hybrid Search = Vector Search + Metadata Filtering + (optional) Full-Text Search**

**Implementation:**
1. Parse query → extract filters (LLM)
2. Apply metadata pre-filters
3. Vector similarity search
4. (Optional) BM25/full-text search
5. Rerank combined results
6. Return top-k

**Tools Supporting Hybrid:**
- Qdrant (native hybrid)
- Weaviate (hybrid search)
- Elasticsearch (vector + BM25)
- Milvus (scalar + vector)

---

**Źródła:**
- [Metadata-Based Filtering in RAG Systems](https://codesignal.com/learn/courses/scaling-up-rag-with-vector-databases/lessons/metadata-based-filtering-in-rag-systems)
- [Graph-based Metadata Filtering for RAG](https://neo4j.com/blog/developer/graph-metadata-filtering-vector-search-rag/)
- [Pre and Post Filtering in Vector Search](https://dev.to/volland/pre-and-post-filtering-in-vector-search-with-metadata-and-rag-pipelines-2hji)

---

## 10. RAG Evaluation & Observability

### 10.1 RAGAS Framework

**Repozytorium:** https://github.com/explodinggradients/ragas
**Licencja:** Apache 2.0

**Czym jest RAGAS:**
- Retrieval Augmented Generation Assessment
- Open-source evaluation framework
- Component-level metrics
- No human-annotated reference data needed

---

### 10.2 Core RAGAS Metrics

#### Retrieval Metrics

**1. Context Precision**
- Measures irrelevant text in retrieved context
- Are all retrieved chunks relevant?
- Higher = better filtering

**2. Context Recall**
- Did retriever get all relevant information?
- Coverage metric
- Higher = more complete retrieval

---

#### Generation Metrics

**3. Faithfulness** 🏆
- Are model's claims supported by context?
- Factual consistency check
- Fraction of statements confirmable by retrieved docs
- Critical dla avoiding hallucinations

**4. Answer Relevancy**
- Is answer relevant to query?
- Not just correct, but on-topic

**5. Factual Correctness**
- Comparison to ground truth
- Requires reference answers

---

### 10.3 Recommended Metric Trio

**For most RAG Q&A systems:**
1. **Faithfulness** - no hallucinations
2. **Context Recall** - complete retrieval
3. **Answer Relevancy** - on-topic responses
4. (Bonus) Basic accuracy check

---

### 10.4 LangSmith Observability

**Provider:** LangChain
**Website:** https://smith.langchain.com/

**Kluczowe Features:**

**Tracing:**
- Automatic structured traces dla LangChain calls
- Captures: inputs, outputs, latency, token usage
- Multi-step workflow visualization
- Shows: documents retrieved, context assembly, tools invoked

**Evaluation:**
- Create and store test datasets
- Run evaluations
- Visualize results
- Make metrics explainable and reproducible
- Add test examples from production logs

**Evaluators:**
- Pre-configured dla common metrics
- Custom LLM-as-judge prompts
- Natural language evaluation criteria
- Assess if responses meet requirements

**Monitoring:**
- Production performance tracking
- Real-time dashboards
- Cost tracking
- Latency monitoring

---

### 10.5 RAGAS + LangSmith Integration

**Benefits:**
- Trace RAG pipeline in LangSmith
- Evaluate with RAGAS metrics
- View results in LangSmith dashboard
- End-to-end observability

**Workflow:**
1. Build RAG pipeline (LangChain)
2. Auto-trace in LangSmith
3. Run RAGAS evaluations
4. View detailed results
5. Iterate and improve

**GitHub Gist:** [RAGAS + LangSmith Example](https://gist.github.com/donbr/e06bb12e09cca4abb4427af360689694)

---

### 10.6 Best Practices dla 2025

**CI/CD Integration:**
- Incorporate RAGAS into pipeline
- Auto-evaluate every code change
- Catch regressions early
- Ensure high performance before merge

**Production Monitoring:**
- Track retrieval precision
- Monitor LLM hallucination rate
- Measure latency
- Track cost per query
- Real-time dashboards

**Governance:**
- Document results
- Ensure reproducibility
- Explainable metrics
- Cross-team visibility
- Regulatory compliance support

**Continuous Improvement:**
- Feedback loops
- A/B testing strategies
- Monitor system performance
- Iteratively improve response quality

---

### 10.7 Pricing

**LangSmith:**
- Free: 5,000 traces/month
- Developer: $39/month (50,000 traces)
- Team & Enterprise: unlimited (custom pricing)

**RAGAS:**
- Free open source

---

### 10.8 Alternative Evaluation Tools

**Other top RAG evaluation platforms:**

1. **Braintrust** - end-to-end evaluation
2. **Giskard** - model validation
3. **DeepEval** - open source evaluator
4. **Arize Phoenix** - observability platform
5. **Weights & Biases** - experiment tracking

---

**Źródła:**
- [The 5 Best RAG Evaluation Tools in 2025](https://www.braintrust.dev/articles/best-rag-evaluation-tools)
- [Evaluating RAG Systems in 2025: RAGAS Deep Dive](https://www.cohorte.co/blog/evaluating-rag-systems-in-2025-ragas-deep-dive-giskard-showdown-and-the-future-of-context)
- [Evaluating RAG Pipelines with RAGAS + LangSmith](https://blog.langchain.com/evaluating-rag-pipelines-with-ragas-langsmith/)

---

## 11. Emerging Trends 2025

### 11.1 Agentic RAG

**Definition:**
- RAG + autonomous agents
- Multi-step retrieval planning
- Tool selection and orchestration
- Reflective reasoning
- Adaptive strategies

**Key Capabilities:**
- Semantic caching (query/context/results)
- Query routing
- Step-by-step planning
- Decision-making
- Memory capabilities

**vs Traditional RAG:**
- Traditional: single-hop, static retrieval
- Agentic: multi-hop, iterative, adaptive

**Use Cases:**
- Compliance checks across many systems
- Complex research tasks
- Multi-source data integration

**Frameworks:**
- LangGraph (LangChain)
- AutoGen (Microsoft)
- CrewAI
- R2R (Deep Research API)

---

### 11.2 GraphRAG (Microsoft)

**Repozytorium:** https://github.com/microsoft/graphrag
**Licencja:** MIT

**Approach:**
- Extract knowledge graph from text
- Build community hierarchy
- Generate community summaries
- Use structures dla RAG tasks

**Process:**
1. LLM extracts entity knowledge graph from documents
2. Pregenerate community summaries dla closely related entities
3. Query time: use community summaries → partial responses
4. Summarize partial responses → final answer

**Advantages over Baseline RAG:**
- Handles aggregation queries across dataset
- Understands dataset structure and themes
- Pre-summarized semantic clusters
- Better dla "big picture" questions

**Availability:**
- GitHub open source
- Microsoft Discovery (agentic research platform)
- Integrated in Azure

**Limitations:**
- Not production support (demonstration code)
- More complex than baseline RAG
- Higher setup overhead

---

### 11.3 Fine-Tuning vs RAG vs Agents

**Decision Matrix:**

| Approach | Best For | Strengths | Weaknesses |
|----------|----------|-----------|------------|
| **Fine-Tuning** | Domain expertise baked in | Task-specific precision | Static knowledge, expensive |
| **RAG** | Real-time, dynamic data | Up-to-date, grounded | Retrieval quality critical |
| **Agents** | Multi-step reasoning | Tool orchestration | Latency, complexity |
| **Hybrid** | Best of both worlds | Adaptability + precision | More complex architecture |

**Trend:**
- Most enterprises start with RAG
- Selectively fine-tune dla style/task bias
- Add agents dla complex workflows
- Hybrid approaches increasingly common

---

### 11.4 Contextual Retrieval (Anthropic)

**Technique:** Dramatically improve retrieval step

**Sub-techniques:**
1. **Contextual Embeddings**
   - Add context to each chunk before embedding
   - Chunk knows its document context

2. **Contextual BM25**
   - Context-aware keyword search
   - Combines with embeddings

**Problem Solved:**
- Traditional RAG destroys context when chunking
- Individual chunks lack sufficient context
- Leads to poor retrieval

**Additional Technique:**
3. **Reranking**
   - Filter to most relevant chunks
   - Improves responses
   - Reduces cost and latency

**Source:** [Anthropic: Introducing Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)

---

### 11.5 Claude Memory & Extended Context

**Claude Context Windows (2025):**
- Standard: 200,000 tokens
- Advanced tiers: up to 1 million tokens
- Tier 4 organizations: 1M tokens
- Premium pricing: 2x input, 1.5x output (>200K tokens)

**Best Practices:**
- **Divide and conquer:** Sub-agents z separate context windows
- **Context file strategy:** CLAUDE.md dla core requirements
- **External state management:** Offload long-term state outside prompt
- **Multi-session workflows:** Initializer + coding agent pattern

**RAG for Projects:**
- Auto-activates near context limit
- 10x more content vs in-context
- Intelligent search and retrieval
- Maintained response quality

---

### 11.6 Small Language Models (SLMs)

**Trend:**
- Specialized smaller models
- More efficient
- Domain-specific fine-tuning
- Cost-effective dla specific tasks

**Use in RAG:**
- Embedding generation
- Query classification
- Reranking
- Metadata extraction

---

### 11.7 Model Context Protocol (MCP)

**Comparison: RAG vs MCP vs Agents**

**MCP:**
- Standardized context sharing
- Tool integration protocol
- Cross-platform compatibility

**Trend:**
- Interoperability standards emerging
- Easier integration across tools
- AnythingLLM supports MCP Tools

---

**Źródła:**
- [RAG vs Agentic RAG in 2025](https://kanerika.com/blogs/rag-vs-agentic-rag/)
- [Fine-Tuning vs RAG vs Agents](https://mitrix.io/blog/llm-fine‑tuning-vs-rag-vs-agents-a-practical-comparison/)
- [GraphRAG - Microsoft Research](https://www.microsoft.com/en-us/research/project/graphrag/)
- [Claude's Context Engineering Playbook](https://01.me/en/2025/12/context-engineering-from-claude/)

---

## 12. Cost Comparison: Self-Hosted vs Cloud

### 12.1 Vector Database Pricing

#### Pinecone (Cloud-Only)

**Pricing:**
- Not publicly disclosed per-unit costs
- Varies by cloud provider (AWS, Azure, GCP)
- Varies by region
- Complex calculation based on operations

**Real-world cost:**
- ~$3,500/month dla 50M vectors (estimated)
- Customer churn driven by cost concerns
- Company exploring sale (VentureBeat)

**When Pinecone makes sense:**
- Rapid prototyping
- Under 10M vectors
- Need turnkey scale
- No ops team

---

#### Milvus/Zilliz

**Open Source (Milvus):**
- Free (Apache 2.0)
- Self-hosted AWS: ~$500-1000/mo dla 50M vectors
- **73-80% cheaper than Pinecone at scale**

**Managed (Zilliz Cloud):**
- Free tier: prototyping
- Serverless: $4 per million vCUs
- Dedicated: from $99/month
- vCUs = unified resource measurement

**Break-even:**
- Self-hosting cheaper at scale
- Need infrastructure expertise

---

#### Qdrant

**Open Source:**
- Free self-hosted
- Docker/Kubernetes deployment

**Managed (Qdrant Cloud):**
- **1GB free forever** 🏆
- Paid tiers after 1GB

**Advantage:**
- Best free tier among major providers

---

#### Weaviate

**Open Source:**
- Free self-hosted
- Docker/Kubernetes

**Managed (Weaviate Cloud):**
- $25/month after 14-day trial
- No permanent free tier
- List prices vary by provider/region

**Real-world comparison:**
- E-commerce case: Weaviate 22% cheaper than Pinecone (steady traffic)
- Lower p95 latency on Pinecone (23ms vs 34ms)
- OSS fallback + hybrid filtering tipped decision to Weaviate

---

#### Chroma

**Open Source:**
- Free
- Lightweight deployment

**Managed (Chroma Cloud):**
- In development

**Best for:**
- Prototypes <10M vectors
- Zero cost to start

---

#### pgvector

**Cost:**
- Free extension
- Pay only dla Postgres infrastructure
- Leverage existing database

**Economics:**
- Best if already on Postgres
- Unified storage = cost savings
- No separate vector DB to manage

---

### 12.2 When Self-Hosting Becomes Cheaper

**Threshold:**
- **~$800+/month** on managed service
- Growing query volume
- Predictable workload

**Why Self-Hosting Wins:**
- AI workloads are predictable (vs spiky web traffic)
- Fixed infrastructure cost vs variable API costs
- No double markup (cloud + SaaS margin)
- Unlimited query capacity

**Example ROI:**
```
Pinecone: $3,500/mo (50M vectors)
Self-hosted Milvus on AWS: $800/mo
Annual savings: $32,400
Break-even: ~3-4 months (including setup)
```

---

### 12.3 Embedding Model Costs

#### OpenAI

**Pricing:**
- `text-embedding-3-small`: $0.02 per 1M tokens
- `text-embedding-3-large`: $0.13 per 1M tokens

**Monthly cost dla 10M tokens:**
- Small: $200
- Large: $1,300

---

#### Sentence-Transformers (Open Source)

**Cost:**
- $0 (Apache 2.0)
- Infrastructure only (GPU/CPU)

**Monthly cost:**
- AWS EC2 g4dn.xlarge (GPU): ~$300/mo
- Can process unlimited embeddings

**Break-even:**
- >1.5M tokens/month: open source cheaper
- Includes data control benefits

---

### 12.4 Total Cost of Ownership (TCO)

**Managed SaaS:**
```
Vector DB: $3,500/mo
Embeddings (OpenAI): $500/mo
Total: $4,000/mo = $48,000/year
```

**Self-Hosted:**
```
Vector DB (Milvus on AWS): $800/mo
Embeddings (self-hosted): $300/mo
DevOps overhead: $500/mo
Total: $1,600/mo = $19,200/year
Savings: $28,800/year (60% reduction)
```

**Additional self-hosting benefits:**
- Data sovereignty
- No vendor lock-in
- Unlimited scaling potential
- Custom optimizations

---

### 12.5 Recommendations by Stage

| Stage | Vector DB | Embeddings | Why |
|-------|-----------|------------|-----|
| **Prototype** | Chroma, pgvector | OpenAI | Fast setup, prove concept |
| **MVP <10M vectors** | Qdrant Cloud (1GB free) | Sentence-Transformers | Low cost, decent scale |
| **Growth >10M vectors** | Self-hosted Milvus | Sentence-Transformers | Better economics |
| **Enterprise** | Self-hosted Milvus/Qdrant | Self-hosted | Control + cost savings |

---

**Źródła:**
- [Milvus Pricing Guide](https://airbyte.com/data-engineering-resources/milvus-database-pricing)
- [When Self-Hosting Becomes Cheaper](https://openmetal.io/resources/blog/when-self-hosting-vector-databases-becomes-cheaper-than-saas/)
- [Vector Database Pricing Comparison](https://medium.com/@soumitsr/a-broke-b-chs-guide-to-tech-start-up-choosing-vector-database-cloud-serverless-prices-3c1ad4c29ce7)

---

## 13. Production Architecture Recommendations

### 13.1 Reference Architecture dla RAG SaaS

```
┌─────────────────────────────────────────────────────────┐
│                     API Gateway                          │
│              (Auth, Rate Limiting, Routing)              │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   REST API Layer                         │
│            (FastAPI / Django / Flask)                    │
│  - Document ingestion endpoints                          │
│  - Search/query endpoints                                │
│  - Management endpoints                                  │
└─────────────────────────────────────────────────────────┘
                            ↓
        ┌───────────────────┴───────────────────┐
        ↓                                       ↓
┌──────────────────┐                 ┌──────────────────┐
│  Document        │                 │   Query          │
│  Processing      │                 │   Processing     │
│  Pipeline        │                 │   Pipeline       │
└──────────────────┘                 └──────────────────┘
        ↓                                       ↓
┌──────────────────┐                 ┌──────────────────┐
│  - Parser        │                 │  - Embedding     │
│    (LlamaParse/  │                 │    (Sentence-    │
│     Docling)     │                 │     Transformers)│
│  - Chunker       │                 │  - Retrieval     │
│    (Semantic)    │                 │  - Reranking     │
│  - Embedder      │                 │  - Generation    │
│  - Metadata      │                 │    (LLM)         │
│    Extraction    │                 └──────────────────┘
└──────────────────┘
        ↓
┌─────────────────────────────────────────────────────────┐
│               Vector Database                            │
│         (Milvus/Qdrant/Weaviate/pgvector)               │
│  - Embeddings storage                                    │
│  - Multi-tenancy (namespaces/collections)               │
│  - Metadata filtering                                    │
└─────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────┐
│            PostgreSQL (or MongoDB)                       │
│  - Document metadata                                     │
│  - User management                                       │
│  - Audit logs                                            │
│  - Job tracking                                          │
└─────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────┐
│         Observability & Monitoring                       │
│  - LangSmith / Braintrust                               │
│  - Prometheus / Grafana                                  │
│  - RAGAS evaluation                                      │
└─────────────────────────────────────────────────────────┘
```

---

### 13.2 Tech Stack Recommendations

**Framework:** Haystack (production-ready) lub LlamaIndex (data-heavy)

**Vector DB:**
- Development: pgvector (if on Postgres) or Chroma
- Production <100M vectors: Qdrant
- Production >100M vectors: Milvus (self-hosted)

**Document Parsing:**
- Primary: LlamaParse (speed) + Docling (complex docs)
- Fallback: Unstructured.io

**Embeddings:**
- all-mpnet-base-v2 (Sentence-Transformers)
- OpenAI dla critical accuracy needs

**API Framework:**
- FastAPI (async, high performance, OpenAPI support)

**Database:**
- PostgreSQL (metadata, users, jobs)
- Redis (caching, job queue)

**Observability:**
- LangSmith (evaluation)
- Prometheus + Grafana (infrastructure)
- RAGAS (metrics)

**Deployment:**
- Docker + Kubernetes
- CI/CD: GitHub Actions / GitLab CI
- Infrastructure as Code: Terraform

---

### 13.3 Key Design Decisions

**1. Multi-Tenancy Strategy:**
- Start: Namespace-based isolation (Qdrant/Milvus)
- Scale: Dedicated collections dla enterprise tenants

**2. Chunking:**
- Semantic chunking (primary)
- 512 tokens, 15% overlap
- Page-level dla analytical queries

**3. Metadata Schema:**
```json
{
  "document_id": "uuid",
  "tenant_id": "tenant_uuid",
  "category": "string",
  "tags": ["array"],
  "access_level": "enum",
  "verification_status": "enum",
  "source": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

**4. API Design:**
- RESTful with HATEOAS
- OpenAPI spec
- Versioning: /api/v1/
- Async jobs dla long operations
- Webhooks dla notifications

**5. Security:**
- JWT authentication
- Row-level security (metadata filtering)
- Separate vector stores (public/private)
- Audit logging

**6. Performance:**
- Caching (Redis)
- Async processing (Celery/RQ)
- Connection pooling
- Read replicas dla vector DB

---

### 13.4 Scaling Strategy

**Phase 1: MVP (<10K users, <10M vectors)**
- Single vector DB instance (Qdrant)
- Shared namespaces
- Sentence-Transformers embeddings
- Basic monitoring

**Phase 2: Growth (10K-100K users, 10M-100M vectors)**
- Horizontal scaling (Kubernetes)
- Dedicated collections dla large tenants
- Distributed vector DB (Milvus)
- Advanced observability (LangSmith)

**Phase 3: Enterprise (>100K users, >100M vectors)**
- Multi-region deployment
- Database sharding
- Advanced caching strategies
- Custom fine-tuned models
- GraphRAG dla complex queries

---

## 14. Podsumowanie i Rekomendacje

### 14.1 Quick Start Stack (MVP w 2 tygodnie)

**Framework:** Flowise lub Dify (low-code, szybki start)
**Vector DB:** Qdrant (free 1GB) lub Chroma
**Embeddings:** Sentence-Transformers (all-mpnet-base-v2)
**Document Parsing:** Unstructured.io (versatile)
**Deployment:** Docker Compose

**Koszt:** ~$0 (poza infrastrukturą)

---

### 14.2 Production-Ready Stack (2-3 miesiące)

**Framework:** Haystack (production-ready API)
**Vector DB:** Self-hosted Qdrant lub Milvus
**Embeddings:** Sentence-Transformers + OpenAI (hybrid)
**Document Parsing:** LlamaParse + Docling
**API:** FastAPI
**Database:** PostgreSQL + pgvector (metadata + backup vectors)
**Observability:** LangSmith + RAGAS
**Deployment:** Kubernetes

**Koszt:** ~$1,500-2,000/miesiąc

---

### 14.3 Enterprise Stack (3-6 miesięcy)

**Framework:** LlamaIndex + LangChain (hybrid)
**Vector DB:** Self-hosted Milvus (multi-region)
**Embeddings:** Fine-tuned domain models
**Document Parsing:** Multi-parser strategy
**API:** FastAPI + GraphQL
**Database:** PostgreSQL (sharded) + Redis cluster
**Advanced:** GraphRAG, Agentic workflows
**Observability:** Full stack (LangSmith, Prometheus, Custom dashboards)
**Deployment:** Multi-region Kubernetes

**Koszt:** ~$5,000-10,000/miesiąc (but handles enterprise scale)

---

### 14.4 Kluczowe Zalecenia

**1. Start Simple:**
- Baseline RAG before agentic
- Fixed-size chunking before semantic
- Managed services before self-hosting
- Measure, then optimize

**2. Prioritize Data Quality:**
- Document curation > quantity
- Metadata design upfront
- Verification workflows
- Continuous evaluation (RAGAS)

**3. Plan dla Multi-Tenancy:**
- Design isolation strategy early
- Namespace-based initially
- Upgrade path to dedicated resources

**4. Observability from Day 1:**
- LangSmith integration
- RAGAS metrics
- Cost tracking
- Latency monitoring

**5. Security & Compliance:**
- PII scanning
- Access controls
- Audit logs
- Data retention policies

**6. Cost Optimization:**
- Monitor usage trends
- Plan self-hosting transition at $800+/mo
- Use open source embeddings where acceptable
- Cache aggressively

---

### 14.5 Najlepsze Projekty do Wykorzystania (2025)

**Gotowe Rozwiązania:**
1. **RAGFlow** - dla document-heavy, production needs
2. **Dify** - dla szybkiego wdrożenia, enterprise features
3. **AnythingLLM** - dla privacy-focused, multi-user scenarios

**RAG Frameworks:**
1. **Haystack** - production pipelines
2. **LlamaIndex** - data-intensive applications
3. **LangChain** - complex workflows, największy ecosystem

**Vector Databases:**
1. **Milvus** - enterprise scale (self-hosted)
2. **Qdrant** - production apps (self-hosted lub cloud)
3. **pgvector** - Postgres users, unified architecture

**Document Processing:**
1. **LlamaParse** - speed + simple docs
2. **Docling** - complex layouts + tables
3. **Unstructured.io** - versatility

---

### 14.6 Co Unikać

**Anty-Patterns:**
- ❌ Dumping całej knowledge base bez curation
- ❌ Ignorowanie metadata design
- ❌ Brak evaluation metrics
- ❌ Over-engineering na starcie
- ❌ Mixing public i private data w single vector store
- ❌ Arbitrary chunk sizes bez testowania
- ❌ No monitoring/observability

**Vendor Lock-in Traps:**
- ❌ Proprietary embedding models bez fallback
- ❌ Cloud-only vector DBs bez exit strategy
- ❌ Custom formats bez standard export

---

## 15. Dodatkowe Źródła i Linki

### Główne Źródła Research

**RAG Frameworks:**
- [15 Best Open-Source RAG Frameworks in 2025](https://www.firecrawl.dev/blog/best-open-source-rag-frameworks)
- [Compare the Top 7 RAG Frameworks](https://pathway.com/rag-frameworks/)
- [LangChain vs LlamaIndex vs Haystack Comparison](https://research.aimultiple.com/rag-frameworks/)

**Vector Databases:**
- [Best Vector Databases in 2025](https://www.firecrawl.dev/blog/best-vector-databases-2025)
- [Top 5 Open Source Vector Databases](https://medium.com/@fendylike/top-5-open-source-vector-search-engines-a-comprehensive-comparison-guide-for-2025-e10110b47aa3)
- [Vector Database Comparison](https://liquidmetal.ai/casesAndBlogs/vector-comparison/)

**Chunking Strategies:**
- [Best Chunking Strategies for RAG 2025](https://www.firecrawl.dev/blog/best-chunking-strategies-rag-2025)
- [NVIDIA: Finding Best Chunking Strategy](https://developer.nvidia.com/blog/finding-the-best-chunking-strategy-for-accurate-ai-responses/)
- [Document Chunking for RAG: 9 Strategies](https://langcopilot.com/posts/2025-10-11-document-chunking-for-rag-practical-guide)

**Embedding Models:**
- [13 Best Embedding Models in 2025](https://elephas.app/blog/best-embedding-models)
- [Embedding Models Comparison](https://markaicode.com/embedding-models-comparison-openai-sentence-transformers/)

**Multi-Tenancy:**
- [Multi-Tenancy in Vector Databases](https://www.pinecone.io/learn/series/vector-databases-in-production-for-busy-engineers/vector-database-multi-tenancy/)
- [Designing Multi-Tenancy RAG with Milvus](https://milvus.io/blog/build-multi-tenancy-rag-with-milvus-best-practices-part-one.md)

**Evaluation:**
- [The 5 Best RAG Evaluation Tools](https://www.braintrust.dev/articles/best-rag-evaluation-tools)
- [Evaluating RAG Systems in 2025: RAGAS](https://www.cohorte.co/blog/evaluating-rag-systems-in-2025-ragas-deep-dive-giskard-showdown-and-the-future-of-context)

**Emerging Trends:**
- [RAG vs Agentic RAG in 2025](https://kanerika.com/blogs/rag-vs-agentic-rag/)
- [GraphRAG - Microsoft Research](https://www.microsoft.com/en-us/research/project/graphrag/)
- [Claude's Context Engineering](https://01.me/en/2025/12/context-engineering-from-claude/)

**Cost Analysis:**
- [When Self-Hosting Becomes Cheaper](https://openmetal.io/resources/blog/when-self-hosting-vector-databases-becomes-cheaper-than-saas/)
- [Milvus Pricing Guide](https://airbyte.com/data-engineering-resources/milvus-database-pricing)

---

## Konkluzja

Ekosystem RAG w 2025 roku jest dojrzały i gotowy na produkcyjne wdrożenia. Kluczowe wnioski:

1. **Framework choice matters:** Haystack dla production, LlamaIndex dla data-heavy, LangChain dla prototyping
2. **Self-hosting wins at scale:** Przejście na self-hosted przy >$800/mo oszczędza 60-80% kosztów
3. **Quality over quantity:** Document curation i metadata design ważniejsze niż volume
4. **Evaluation is critical:** RAGAS + LangSmith od początku
5. **Hybrid approaches:** Łączenie RAG + fine-tuning + agents to przyszłość
6. **Open source dominance:** Większość najlepszych narzędzi to open source

**Gotowe do SaaS rozwiązania:**
- RAGFlow (technical teams)
- Dify (enterprise, comprehensive)
- AnythingLLM (privacy-focused)

**Zalecany stack dla nowego projektu:**
- MVP: Dify/Flowise + Qdrant + Sentence-Transformers
- Production: Haystack + Milvus + LlamaParse + FastAPI + RAGAS

---

**Dokument stworzony:** 2025-12-23
**Ostatnia aktualizacja:** 2025-12-23
**Wersja:** 1.0
