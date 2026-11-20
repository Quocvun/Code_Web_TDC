CREATE TABLE IF NOT EXISTS meotdc_runtime_state (
  state_key TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meotdc_kv (
  namespace TEXT NOT NULL,
  record_key TEXT NOT NULL,
  record_json TEXT NOT NULL,
  email TEXT,
  owner_id TEXT,
  submission_id TEXT,
  assignment_id TEXT,
  student_id TEXT,
  class_name TEXT,
  course_code TEXT,
  created_at TEXT,
  due_at TEXT,
  published INTEGER,
  hit_count INTEGER,
  expires_at INTEGER,
  PRIMARY KEY (namespace, record_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS meotdc_kv_email
  ON meotdc_kv(namespace, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS meotdc_kv_assignment_student
  ON meotdc_kv(namespace, assignment_id, student_id)
  WHERE assignment_id IS NOT NULL AND student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS meotdc_kv_assignment_time
  ON meotdc_kv(namespace, assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meotdc_kv_owner_time
  ON meotdc_kv(namespace, owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meotdc_kv_class_due
  ON meotdc_kv(namespace, class_name, due_at);
