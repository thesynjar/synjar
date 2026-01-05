-- ============================================================================
-- Migration: Add Public Instruction Set Access Functions
-- Date: 2026-01-05
-- ============================================================================
--
-- BUG CONTEXT:
-- This migration fixes bug #2 from the 2026-01-05 instruction set RLS fix:
--
-- Problem: Public instruction set access returned "Instruction set not found"
--          even for sets with isPublic=true.
--
-- Root cause: The repository used $queryRaw to query public instruction sets,
--             assuming raw queries bypass RLS. This is incorrect - RLS policies
--             are enforced at the database level for ALL queries from
--             non-superuser connections (synjar_app has NOBYPASSRLS).
--
-- Solution: Create SECURITY DEFINER functions that run with owner (postgres)
--           privileges, effectively bypassing RLS while maintaining defense
--           in depth (isPublic check, VERIFIED documents only).
--
-- Related: ADR-2026-01-05-security-definer-pattern.md
-- ============================================================================
--
-- Public Instruction Set Lookup Function
-- Similar to lookup_public_link_by_token, this function bypasses RLS
-- to allow unauthenticated access to public instruction sets.
--
-- Security model:
-- 1. Only instruction sets with isPublic=true are accessible
-- 2. Only VERIFIED documents within the set are returned
-- 3. SECURITY DEFINER runs with owner privileges (bypasses RLS)

-- Create function to lookup public instruction set by ID
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

-- Create function to get documents for a public instruction set
-- Only returns VERIFIED documents
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

-- Grant execute permissions to public (needed for unauthenticated access)
GRANT EXECUTE ON FUNCTION lookup_public_instruction_set(TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_instruction_set_documents(TEXT) TO PUBLIC;

-- ============ VERIFICATION ============

DO $$
BEGIN
  RAISE NOTICE 'Public instruction set lookup functions created successfully:';
  RAISE NOTICE '  - lookup_public_instruction_set(id): Returns set metadata if public';
  RAISE NOTICE '  - get_public_instruction_set_documents(id): Returns VERIFIED documents if set is public';
END $$;
