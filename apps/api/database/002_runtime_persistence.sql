CREATE TABLE IF NOT EXISTS meotdc_runtime_state (
  state_key text PRIMARY KEY,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meotdc_roster_accounts (
  username text PRIMARY KEY,
  email text UNIQUE,
  user_payload jsonb NOT NULL,
  password_salt bytea NOT NULL,
  password_hash bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meotdc_sessions (
  session_hash text PRIMARY KEY,
  user_payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meotdc_sessions_expiry ON meotdc_sessions (expires_at);

CREATE TABLE IF NOT EXISTS meotdc_rate_limits (
  bucket_key text PRIMARY KEY,
  hit_count integer NOT NULL CHECK (hit_count >= 0),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meotdc_google_nonces (
  nonce_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS meotdc_submission_files (
  file_id uuid PRIMARY KEY,
  assignment_id text NOT NULL,
  owner_id text NOT NULL,
  original_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  storage_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meotdc_submission_files_owner ON meotdc_submission_files (owner_id, created_at DESC);

