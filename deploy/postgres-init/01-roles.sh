#!/bin/bash
# Runs once, on an empty data directory, before any migration.
#
# The RLS migration grants privileges to `app_user` but does not create it —
# creating a login role is a cluster-level concern, not a schema change. This
# script fills that gap (docs/02 §17).
set -euo pipefail

: "${APP_USER_PASSWORD:?APP_USER_PASSWORD must be set for the postgres container}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	-- Runtime role. No SUPERUSER, no BYPASSRLS, no CREATEDB, no table
	-- ownership: row-level security applies to it without exception.
	DO \$\$
	BEGIN
	  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
	    CREATE ROLE app_user LOGIN PASSWORD '${APP_USER_PASSWORD}'
	      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
	  ELSE
	    ALTER ROLE app_user WITH PASSWORD '${APP_USER_PASSWORD}';
	  END IF;
	END
	\$\$;

	-- Nobody creates objects in public except the owner.
	REVOKE ALL ON SCHEMA public FROM PUBLIC;
	GRANT ALL ON SCHEMA public TO app_admin;
	GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO app_user;

	-- Belt and braces: even if a future migration forgets, app_user can
	-- never issue DDL.
	REVOKE CREATE ON SCHEMA public FROM app_user;
EOSQL

echo "app_user created"
