-- Creates the database role the management pages write through.
--
-- Reading on those pages stays on the application's own connection, like
-- everywhere else. Only changes and deletions go through this role, and the
-- reason is the change log: the pages must be able to append to audit_log but
-- never to rewrite it. That has to be a property of the database, not a promise
-- the page makes about itself - on DATABASE_URL, which owns the schema and is a
-- superuser in the default Docker setup, no such property exists.
--
-- So the grants are made table by table rather than with ON ALL TABLES:
--   measurements, log_entries   full read/write - that is the point of the pages
--   audit_log                   SELECT and INSERT only, no UPDATE, no DELETE
--
-- And deliberately no ALTER DEFAULT PRIVILEGES: a table added by a later
-- migration grants this role nothing until someone adds a line here. A default
-- would silently hand out UPDATE and DELETE on the next log-like table.
--
-- Correcting a change-log entry is therefore only possible through the SQL
-- console as an administrator - loramint_admin_sql does hold UPDATE and DELETE
-- on audit_log, through the default privileges in create-admin-role.sql.
--
-- Run it after the migrations, as a superuser - the grants need the tables:
--     docker exec -i loramint_postgres psql -U loramint -d loramint \
--       -v password=managepw < dev_scripts/create-manage-role.sql
--
-- Then set DATABASE_URL_MANAGE, for example
--     DATABASE_URL_MANAGE=postgres://loramint_manage:managepw@localhost:5432/loramint
--
-- scripts/ensure-roles.ts does the same thing from the entrypoint, so a
-- deployment does not need a psql session. This file is the manual path, and
-- the place the reasoning is written down.

\set ON_ERROR_STOP on

-- CREATE ROLE has no IF NOT EXISTS, so create it only when missing; re-running
-- then just refreshes the password, settings and grants below. %L quotes the
-- password as a literal, so it cannot end the statement early.
SELECT format('CREATE ROLE loramint_manage LOGIN PASSWORD %L', :'password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loramint_manage')
\gexec

SELECT format('ALTER ROLE loramint_manage PASSWORD %L', :'password')
\gexec

-- Longer than the console's ten seconds: deleting a whole faulty measurement
-- series legitimately takes a while. The application sets its own limit per
-- transaction on top of this.
ALTER ROLE loramint_manage SET statement_timeout = '30s';

GRANT CONNECT ON DATABASE loramint TO loramint_manage;
GRANT USAGE ON SCHEMA public TO loramint_manage;

GRANT SELECT, INSERT, UPDATE, DELETE ON measurements TO loramint_manage;
GRANT SELECT, INSERT, UPDATE, DELETE ON log_entries TO loramint_manage;

-- The change log: append and read, nothing else.
GRANT SELECT, INSERT ON audit_log TO loramint_manage;

-- The device log, on the same terms and for the same reason. It records what the
-- device pages did in The Things Network - see migrations/004-device-log.ts for
-- why that is a separate table rather than more rows in audit_log.
GRANT SELECT, INSERT ON device_log TO loramint_manage;

-- Einstellungen sollen sich ändern lassen, anders als die beiden Protokolle -
-- daher hier auch UPDATE und DELETE. Der Nachweis der Änderung landet weiterhin
-- in audit_log, an das diese Rolle nur anhängen kann.
GRANT SELECT, INSERT, UPDATE, DELETE ON settings TO loramint_manage;
