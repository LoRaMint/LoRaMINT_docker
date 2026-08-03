-- Creates the restricted database role used by the /sql page.
--
-- The application's own connection owns the schema and, in the default Docker
-- setup, is a superuser. Running ad-hoc queries as that role cannot be made
-- read-only: a superuser can read server files with pg_read_file(), read
-- password hashes from pg_authid, and run shell commands via COPY ... TO
-- PROGRAM - none of which a READ ONLY transaction prevents, because none of
-- them writes to the database. A transaction can also simply be ended with
-- COMMIT and the next statement runs read-write.
--
-- So the page connects as this separate role instead. It can log in, read the
-- two application tables, and nothing else.
--
-- Run it once per database, as a superuser:
--     psql "$DATABASE_URL" -v password=choose-a-password \
--          -f dev_scripts/create-readonly-role.sql
-- or against the dev container:
--     docker exec -i loramint_postgres psql -U loramint -d loramint \
--          -v password=readonly < dev_scripts/create-readonly-role.sql
--
-- Then point DATABASE_URL_READONLY at it, for example
--     DATABASE_URL_READONLY=postgres://loramint_readonly:readonly@localhost:5432/loramint

\set ON_ERROR_STOP on

-- CREATE ROLE has no IF NOT EXISTS, so create it only when missing; re-running
-- the script then just refreshes the settings and grants below. %L quotes the
-- password as a literal, so it cannot end the statement early.
SELECT format('CREATE ROLE loramint_readonly LOGIN PASSWORD %L', :'password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loramint_readonly')
\gexec

SELECT format('ALTER ROLE loramint_readonly PASSWORD %L', :'password')
\gexec

-- Every transaction this role opens is read-only, including the implicit one
-- around a bare statement. This is what makes a `COMMIT; INSERT ...` pointless:
-- the statement after the COMMIT is read-only again.
ALTER ROLE loramint_readonly SET default_transaction_read_only = on;

-- A second line of defence against a runaway query, independent of what the
-- application sets per transaction.
ALTER ROLE loramint_readonly SET statement_timeout = '10s';

GRANT CONNECT ON DATABASE loramint TO loramint_readonly;
GRANT USAGE ON SCHEMA public TO loramint_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO loramint_readonly;

-- So tables added by later migrations are readable without re-running this.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO loramint_readonly;
