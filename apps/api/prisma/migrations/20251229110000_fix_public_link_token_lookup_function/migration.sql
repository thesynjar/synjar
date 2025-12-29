-- Fix Public Link Token Lookup Function
-- Fixes from code review:
-- 1. CRITICAL: Add isActive/expiresAt validation in WHERE clause
-- 2. CRITICAL: Remove updated_at field (doesn't exist in PublicLink schema)

-- Drop and recreate function with fixes
DROP FUNCTION IF EXISTS lookup_public_link_by_token(TEXT);

CREATE OR REPLACE FUNCTION lookup_public_link_by_token(p_token TEXT)
RETURNS TABLE (
  id TEXT,
  workspace_id TEXT,
  token TEXT,
  name TEXT,
  allowed_tags TEXT[],
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  workspace_name TEXT,
  workspace_created_by_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pl.id::TEXT,
    pl."workspaceId"::TEXT as workspace_id,
    pl.token,
    pl.name,
    pl."allowedTags" as allowed_tags,
    pl."expiresAt" as expires_at,
    pl."isActive" as is_active,
    pl."createdAt" as created_at,
    w.name as workspace_name,
    w."createdById"::TEXT as workspace_created_by_id
  FROM "PublicLink" pl
  JOIN "Workspace" w ON w.id = pl."workspaceId"
  WHERE pl.token = p_token
    AND pl."isActive" = true
    AND (pl."expiresAt" IS NULL OR pl."expiresAt" > NOW());
END;
$$;

-- Grant execute permission to public (needed for unauthenticated access)
GRANT EXECUTE ON FUNCTION lookup_public_link_by_token(TEXT) TO PUBLIC;

-- ============ VERIFICATION ============

DO $$
BEGIN
  RAISE NOTICE 'Public link token lookup function fixed successfully:';
  RAISE NOTICE '  - Removed updated_at field (not in schema)';
  RAISE NOTICE '  - Added isActive validation';
  RAISE NOTICE '  - Added expiresAt validation';
END $$;
