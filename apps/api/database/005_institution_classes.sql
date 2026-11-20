CREATE TABLE IF NOT EXISTS meotdc_institution_classes (
  id text PRIMARY KEY,
  class_code text NOT NULL,
  owner_id text NOT NULL,
  record_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meotdc_institution_classes_owner ON meotdc_institution_classes (owner_id, created_at DESC);
