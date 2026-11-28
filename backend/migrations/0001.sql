-- One private, single-owner database. No note text is interpreted by SQLite.
CREATE TABLE storage_chunks (
  hash TEXT PRIMARY KEY CHECK(length(hash) = 64 AND hash NOT GLOB '*[^0-9a-f]*'),
  data BLOB NOT NULL CHECK(typeof(data) = 'blob'),
  byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 1048576 AND length(data) = byte_size)
) STRICT;
CREATE TRIGGER storage_chunk_budget BEFORE INSERT ON storage_chunks
WHEN COALESCE((SELECT SUM(byte_size) FROM storage_chunks), 0) + NEW.byte_size > 268435456
BEGIN
  SELECT RAISE(ABORT, 'storage chunk budget');
END;
CREATE TRIGGER storage_chunks_immutable BEFORE UPDATE ON storage_chunks
BEGIN
  SELECT RAISE(ABORT, 'immutable storage chunk');
END;
CREATE TABLE storage_manifests (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL CHECK(length(checksum) = 64 AND checksum NOT GLOB '*[^0-9a-f]*'),
  byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 100663296),
  chunks_json TEXT NOT NULL CHECK(json_valid(chunks_json) AND length(chunks_json) <= 16384),
  state TEXT NOT NULL CHECK(state IN ('staged', 'published')),
  expires_at INTEGER,
  CHECK((state = 'staged' AND expires_at IS NOT NULL) OR (state = 'published' AND expires_at IS NULL))
) STRICT;
CREATE TABLE storage_manifest_chunks (
  manifest_id TEXT NOT NULL REFERENCES storage_manifests(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 95),
  hash TEXT NOT NULL CHECK(length(hash) = 64 AND hash NOT GLOB '*[^0-9a-f]*'),
  byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 1048576),
  PRIMARY KEY(manifest_id, position)
) STRICT;
CREATE INDEX storage_manifest_chunk_hash ON storage_manifest_chunks(hash);
CREATE TABLE storage_head (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  version INTEGER NOT NULL CHECK(version >= 0),
  manifest_id TEXT REFERENCES storage_manifests(id)
) STRICT;
INSERT INTO storage_head(singleton, version, manifest_id) VALUES(1, 0, NULL);
