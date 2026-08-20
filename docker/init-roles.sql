-- docs/02-data-model.md §4.2 and docs/12 §12 — two database roles.
--
-- app_admin owns the tables and runs migrations. app_user is what the
-- application connects as: no ownership, no BYPASSRLS, so the row-level
-- security policies actually apply to it.

CREATE ROLE app_user LOGIN PASSWORD 'app_user_dev';

CREATE DATABASE mixweek_test OWNER app_admin;

\connect mixweek_dev
GRANT CONNECT ON DATABASE mixweek_dev TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

\connect mixweek_test
GRANT CONNECT ON DATABASE mixweek_test TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
