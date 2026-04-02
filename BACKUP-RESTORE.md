# Backup Restore Plan

This repository contains the application code. Nightly disaster-recovery backups are written to a separate private repository.

## What gets backed up

- PostgreSQL roles
- PostgreSQL schema
- PostgreSQL data
- Supabase Storage files from the configured buckets
- Vercel production environment variables, encrypted with `BACKUP_ENV_PASSPHRASE`

## Required GitHub Actions secrets

- `BACKUP_REPO_TOKEN`
- `BACKUP_REPO`
- `SUPABASE_DB_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VERCEL_TOKEN`
- `BACKUP_ENV_PASSPHRASE`

## Default schedule

- Daily at 00:17 UTC
- Keeps the latest 7 dated backup folders

## Restore summary

1. Create a new Supabase project.
2. Restore `db/roles.sql`, then `db/schema.sql`, then `db/data.sql`.
3. Upload all files under `storage/` back into the matching buckets.
4. Decrypt `env/vercel-production.env.enc` and restore the variables into Vercel.
5. Deploy the current app code from this repository.
6. If seamless session continuity matters, reuse the original Supabase JWT secret before going live.
