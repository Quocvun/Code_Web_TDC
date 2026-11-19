CREATE TABLE IF NOT EXISTS meotdc_learning_assignments (
  assignment_id text PRIMARY KEY,
  owner_id text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  course text NOT NULL CHECK (length(course) BETWEEN 1 AND 100),
  class_name text NOT NULL CHECK (length(class_name) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '',
  due_at timestamptz NOT NULL,
  points numeric(7,2) NOT NULL CHECK (points > 0 AND points <= 1000),
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meotdc_learning_assignments_class_due
  ON meotdc_learning_assignments (class_name, due_at) WHERE published = true;
CREATE INDEX IF NOT EXISTS idx_meotdc_learning_assignments_owner
  ON meotdc_learning_assignments (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS meotdc_learning_submissions (
  submission_id text PRIMARY KEY,
  assignment_id text NOT NULL REFERENCES meotdc_learning_assignments(assignment_id) ON DELETE CASCADE,
  student_id text NOT NULL,
  student_name text NOT NULL,
  response text NOT NULL DEFAULT '',
  file_id uuid,
  file_name text,
  file_size bigint,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  score numeric(7,2) CHECK (score IS NULL OR score >= 0),
  feedback text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'revision')),
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_meotdc_learning_submissions_assignment_time
  ON meotdc_learning_submissions (assignment_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_meotdc_learning_submissions_student
  ON meotdc_learning_submissions (student_id, submitted_at DESC);
