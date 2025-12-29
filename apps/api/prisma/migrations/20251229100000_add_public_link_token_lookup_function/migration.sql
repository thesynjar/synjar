-- Public Link Token Lookup Function
-- Provides secure RLS bypass for public API token validation
-- Uses SECURITY DEFINER to allow unauthenticated token lookups

-- ============ Function: lookup_public_link_by_token ============
-- This function bypasses RLS to look up a PublicLink by its cryptographic token.
-- Security rationale:
-- 1. Token is cryptographically secure (32 bytes = 64 hex chars)
-- 2. Token acts as authorization mechanism for public access
-- 3. Function only returns data for the specific token (not enumerable)
-- 4. SECURITY DEFINER is explicitly designed for this use case

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
  updated_at TIMESTAMPTZ,
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
    pl."updatedAt" as updated_at,
    w.name as workspace_name,
    w."createdById"::TEXT as workspace_created_by_id
  FROM "PublicLink" pl
  JOIN "Workspace" w ON w.id = pl."workspaceId"
  WHERE pl.token = p_token;
END;
$$;

-- Grant execute permission to public (needed for unauthenticated access)
GRANT EXECUTE ON FUNCTION lookup_public_link_by_token(TEXT) TO PUBLIC;

-- ============ VERIFICATION ============

DO $$
BEGIN
  RAISE NOTICE 'Public link token lookup function created successfully';
END $$;
