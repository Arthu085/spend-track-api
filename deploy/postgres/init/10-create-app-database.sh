#!/bin/sh
# Runs once, when PostgreSQL initializes an empty data volume. Creates the API's login role without
# superuser, CREATEDB, or CREATEROLE privileges and a database it owns, so migrations can create the
# schema while the superuser password never reaches the API.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" -v app_db="$APP_DB_NAME" <<'SQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password';
CREATE DATABASE :"app_db" OWNER :"app_user";
REVOKE ALL ON DATABASE :"app_db" FROM PUBLIC;
SQL
