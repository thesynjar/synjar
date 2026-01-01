-- Create application user (non-superuser) for RLS enforcement
-- Pattern from core-platform/infrastructure/docker/init-schemas.sql
--
-- The main 'postgres' user remains superuser for migrations (DATABASE_URL_MIGRATE)
-- This 'synjar_app' user is used by DATABASE_URL for application runtime

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'synjar_app') THEN
    CREATE ROLE synjar_app WITH LOGIN PASSWORD 'synjar_app_password' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

-- Grant schema usage to app user
GRANT USAGE ON SCHEMA public TO synjar_app;

-- Grant table access on existing tables (none at init time, but for safety)
GRANT ALL ON ALL TABLES IN SCHEMA public TO synjar_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO synjar_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO synjar_app;

-- Grant access to future tables created by postgres (migrations)
-- IMPORTANT: FOR ROLE postgres ensures tables created by superuser are accessible
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO synjar_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO synjar_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO synjar_app;
