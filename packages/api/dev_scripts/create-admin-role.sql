-- Creates the database role used by the Admin > SQL page, where administrators
-- submit arbitrary statements - including writing ones.
--
-- This is deliberately NOT the application's own connection. In the default
-- Docker setup that one is a superuser, which would turn the page into remote
-- code execution on the database host: pg_read_file() reads server files,
-- pg_authid holds password hashes, and COPY ... TO PROGRAM runs shell commands.
-- None of that is what "an administrator may edit the data" is meant to grant.
--
-- So this role may read and write the application's own tables and nothing else:
--   - no superuser, so the escapes above are refused
--   - no CREATE on the schema, so it cannot add or drop tables; schema changes
--     stay with the migrations, where they are reviewable and repeatable
--
-- Run it once per database, as a superuser:
--     docker exec -i loramint_postgres psql -U loramint -d loramint \
--       -v password=adminsql < dev_scripts/create-admin-role.sql
--
-- Then set DATABASE_URL_ADMIN, for example
--     DATABASE_URL_ADMIN=postgres://loramint_admin_sql:adminsql@localhost:5432/loramint

\set ON_ERROR_STOP on

SELECT format('CREATE ROLE loramint_admin_sql LOGIN PASSWORD %L', :'password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loramint_admin_sql')
\gexec

SELECT format('ALTER ROLE loramint_admin_sql PASSWORD %L', :'password')
\gexec

-- A runaway statement here holds locks on live tables, so the limit is stricter
-- than for the read-only role.
ALTER ROLE loramint_admin_sql SET statement_timeout = '10s';

GRANT CONNECT ON DATABASE loramint TO loramint_admin_sql;
GRANT USAGE ON SCHEMA public TO loramint_admin_sql;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO loramint_admin_sql;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO loramint_admin_sql;

-- So tables added by later migrations are usable without re-running this.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO loramint_admin_sql;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO loramint_admin_sql;
