-- CreateIndex dla vector similarity search
CREATE INDEX IF NOT EXISTS "Chunk_embedding_idx" ON "Chunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
