-- Setup synjar_app role and permissions
--
-- This migration ensures the application user (synjar_app) has proper permissions
-- to access the database. It must be idempotent because:
-- 1. Docker init script may have already created the role
-- 2. prisma migrate reset drops the database but keeps roles
-- 3. This migration runs on every reset to ensure permissions are correct
--
-- The synjar_app user is used for RLS enforcement - it's a non-superuser
-- that cannot bypass Row Level Security policies.

-- ============ STEP 1: Verify role exists ============
--
-- IMPORTANT: The synjar_app role MUST be created by infrastructure (Docker, CI, Kubernetes)
-- with a secure password managed via secrets. This migration only grants permissions.
--
-- Infrastructure setup examples:
-- - Docker: docker/postgres-init/01-create-app-user.sql
-- - CI: .woodpecker/main.yml setup-test-db step
-- - Production: Deploy secrets to environment, then:
--   CREATE ROLE synjar_app WITH LOGIN PASSWORD '<from-secret>' NOSUPERUSER NOBYPASSRLS;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'synjar_app') THEN
    RAISE EXCEPTION 'Role synjar_app does not exist. Create it via infrastructure setup with secure password before running migrations.';
  END IF;

  -- Ensure role has correct flags (update if it exists but was misconfigured)
  ALTER ROLE synjar_app WITH LOGIN NOSUPERUSER NOBYPASSRLS;
  RAISE NOTICE 'Verified synjar_app role exists with correct flags';
END
$$;

-- ============ STEP 2: Grant schema usage ============

GRANT USAGE ON SCHEMA public TO synjar_app;

-- ============ STEP 3: Grant table/sequence/function access ============

-- Grant on all existing tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO synjar_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO synjar_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO synjar_app;

-- ============ STEP 4: Set default privileges for future objects ============
-- IMPORTANT: Set default privileges for the current role (migration runner)
-- This ensures tables created by the superuser (migrations) are accessible to synjar_app
-- Works with both 'postgres' (production) and 'synjar_test' (test environment)

DO $$
DECLARE
  migration_role TEXT;
BEGIN
  -- Get the current session user (who's running the migration)
  SELECT CURRENT_USER INTO migration_role;

  RAISE NOTICE 'Setting default privileges for role: %', migration_role;

  -- Set default privileges for the migration runner role
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON TABLES TO synjar_app', migration_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON SEQUENCES TO synjar_app', migration_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO synjar_app', migration_role);
END $$;

-- ============ VERIFICATION ============

DO $$
DECLARE
  has_usage BOOLEAN;
  table_count INTEGER;
BEGIN
  -- Check schema usage
  SELECT pg_catalog.has_schema_privilege('synjar_app', 'public', 'USAGE') INTO has_usage;

  -- Count granted tables
  SELECT COUNT(*) INTO table_count
  FROM information_schema.role_table_grants
  WHERE grantee = 'synjar_app' AND table_schema = 'public';

  RAISE NOTICE 'synjar_app permissions setup complete:';
  RAISE NOTICE '  - Schema USAGE: %', has_usage;
  RAISE NOTICE '  - Table grants: %', table_count;
END $$;
