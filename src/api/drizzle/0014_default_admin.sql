-- Seed the built-in admin account. Username 'admin', password 'adminadmin'
-- stored as a scrypt hash matching what verifyPasswordHash expects.
--
-- ON CONFLICT DO NOTHING keeps the migration safe on databases where the
-- runtime bootstrapAdmin helper already inserted the row. The runtime
-- helper stays in place so a fresh dev box without this migration applied
-- (e.g. a CI integration test that wires the schema up by hand) still
-- ends up with a working admin user.
INSERT INTO "ytai"."user" (name, role, status, auth_provider, user_name, password_hash)
VALUES (
  'admin',
  'admin',
  'approved',
  'local',
  'admin',
  'scrypt$369e139ed2f8f5ad78bbc60d4860b50d$67a42401bcf9238eb04d9b426d3329b30284cb7798f263e6e1271414c6cb53c54cdef6281700c6cf9a691eb2842133b8efe5382132197949bdd64c5cc9a01df8'
)
ON CONFLICT (user_name) DO NOTHING;
