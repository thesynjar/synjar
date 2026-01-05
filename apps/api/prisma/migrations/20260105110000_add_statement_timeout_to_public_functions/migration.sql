-- Add statement timeout to SECURITY DEFINER functions
-- Prevents DoS via long-running queries

-- Update lookup_public_instruction_set with timeout
CREATE OR REPLACE FUNCTION lookup_public_instruction_set(p_id TEXT)
RETURNS TABLE (
  id TEXT,
  workspace_id TEXT,
  name TEXT,
  description TEXT,
  is_public BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET statement_timeout = '5s'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    is_.id::TEXT,
    is_."workspaceId"::TEXT as workspace_id,
    is_.name,
    is_.description,
    is_."isPublic" as is_public,
    is_."createdAt" as created_at,
    is_."updatedAt" as updated_at
  FROM "InstructionSet" is_
  WHERE is_.id = p_id
    AND is_."isPublic" = true;
END;
$$;

-- Update get_public_instruction_set_documents with timeout
CREATE OR REPLACE FUNCTION get_public_instruction_set_documents(p_instruction_set_id TEXT)
RETURNS TABLE (
  id TEXT,
  instruction_set_id TEXT,
  document_id TEXT,
  doc_order INTEGER,
  title TEXT,
  content TEXT,
  file_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET statement_timeout = '10s'
AS $$
BEGIN
  -- First verify the instruction set is public
  -- Use table alias to avoid ambiguity with return column 'id'
  IF NOT EXISTS (
    SELECT 1 FROM "InstructionSet" ins
    WHERE ins.id = p_instruction_set_id AND ins."isPublic" = true
  ) THEN
    RETURN; -- Return empty if not public
  END IF;

  RETURN QUERY
  SELECT
    isd.id::TEXT,
    isd."instructionSetId"::TEXT as instruction_set_id,
    isd."documentId"::TEXT as document_id,
    isd."order" as doc_order,
    d.title,
    d.content,
    d."fileUrl" as file_url
  FROM "InstructionSetDocument" isd
  JOIN "Document" d ON d.id = isd."documentId"
  WHERE isd."instructionSetId" = p_instruction_set_id
    AND d."verificationStatus" = 'VERIFIED'
  ORDER BY isd."order";
END;
$$;

-- ============ VERIFICATION ============

DO $$
BEGIN
  RAISE NOTICE 'Statement timeouts added to SECURITY DEFINER functions:';
  RAISE NOTICE '  - lookup_public_instruction_set: 5s timeout';
  RAISE NOTICE '  - get_public_instruction_set_documents: 10s timeout';
END $$;
