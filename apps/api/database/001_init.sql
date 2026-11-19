CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  auth_provider text NOT NULL DEFAULT 'password' CHECK (auth_provider IN ('password', 'google', 'tdc_sso')),
  auth_provider_subject text,
  student_code text,
  full_name text NOT NULL,
  password_hash text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'invited')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_provider, auth_provider_subject)
);

CREATE TABLE school_memberships (
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('school_admin', 'teacher', 'student', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, user_id)
);

CREATE TABLE terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_at date,
  ends_at date,
  UNIQUE (school_id, name)
);

CREATE TABLE classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  term_id uuid REFERENCES terms(id),
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, term_id, code)
);

CREATE TABLE class_members (
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, student_id)
);

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);

CREATE TABLE course_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  term_id uuid REFERENCES terms(id),
  class_id uuid REFERENCES classes(id),
  teacher_id uuid NOT NULL REFERENCES users(id),
  section_code text NOT NULL,
  UNIQUE (course_id, term_id, section_code)
);

CREATE TABLE enrollments (
  section_id uuid NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'completed')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (section_id, student_id)
);

CREATE TABLE question_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'course', 'school')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
  question_type text NOT NULL CHECK (question_type IN ('single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay')),
  body jsonb NOT NULL,
  answer_key jsonb,
  explanation text,
  points numeric(7,2) NOT NULL DEFAULT 1 CHECK (points >= 0),
  tags text[] NOT NULL DEFAULT '{}',
  difficulty smallint CHECK (difficulty BETWEEN 1 AND 5),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE exam_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  version_no integer NOT NULL CHECK (version_no > 0),
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  settings jsonb NOT NULL DEFAULT '{}',
  published_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, version_no)
);

CREATE TABLE exam_questions (
  exam_version_id uuid NOT NULL REFERENCES exam_versions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id),
  position integer NOT NULL CHECK (position >= 0),
  points numeric(7,2) NOT NULL CHECK (points >= 0),
  question_snapshot jsonb NOT NULL,
  PRIMARY KEY (exam_version_id, position)
);

CREATE TABLE assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_version_id uuid NOT NULL REFERENCES exam_versions(id),
  created_by uuid NOT NULL REFERENCES users(id),
  opens_at timestamptz,
  closes_at timestamptz,
  audience text NOT NULL DEFAULT 'class' CHECK (audience IN ('class', 'google_public')),
  max_attempts smallint NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 1 AND 20),
  access_code_hash text,
  score_release_at timestamptz,
  answer_release_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at IS NULL OR opens_at IS NULL OR closes_at > opens_at)
);

CREATE TABLE assignment_targets (
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  PRIMARY KEY (assignment_id, section_id)
);

CREATE TABLE attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id),
  student_id uuid NOT NULL REFERENCES users(id),
  candidate_name text NOT NULL,
  candidate_student_code text,
  candidate_major text,
  candidate_email text,
  attempt_no smallint NOT NULL CHECK (attempt_no > 0),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'expired', 'graded')),
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  submitted_at timestamptz,
  objective_score numeric(8,2),
  total_score numeric(8,2),
  score_released_at timestamptz,
  submission_reason text CHECK (submission_reason IN ('student', 'time-limit', 'integrity-threshold')),
  integrity_auto_submitted boolean NOT NULL DEFAULT false,
  strict_integrity boolean NOT NULL DEFAULT true,
  fullscreen_used boolean NOT NULL DEFAULT false,
  attempt_token_hash text NOT NULL,
  version integer NOT NULL DEFAULT 0,
  UNIQUE (assignment_id, student_id, attempt_no)
);

CREATE TABLE attempt_answers (
  attempt_id uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id),
  answer jsonb,
  client_sequence bigint NOT NULL DEFAULT 0,
  is_correct boolean,
  score numeric(8,2),
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id)
);

CREATE TABLE essay_grades (
  attempt_id uuid NOT NULL,
  question_id uuid NOT NULL,
  grader_id uuid NOT NULL REFERENCES users(id),
  score numeric(8,2) NOT NULL CHECK (score >= 0),
  feedback text,
  graded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id),
  FOREIGN KEY (attempt_id, question_id) REFERENCES attempt_answers(attempt_id, question_id) ON DELETE CASCADE
);

CREATE TABLE attempt_integrity_events (
  id bigserial PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  event_kind text NOT NULL CHECK (event_kind IN ('focus-loss', 'fullscreen-exit', 'copy-attempt', 'cut-attempt', 'paste-attempt', 'print-attempt', 'shortcut-attempt', 'context-menu', 'leave-attempt')),
  received_at timestamptz NOT NULL DEFAULT now(),
  client_at timestamptz,
  source text NOT NULL DEFAULT 'browser-reported' CHECK (source IN ('browser-reported', 'server')),
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id),
  object_key text NOT NULL,
  original_name text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'review', 'failed', 'approved')),
  result jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_classes_school_term ON classes (school_id, term_id);
CREATE INDEX idx_sections_teacher_term ON course_sections (teacher_id, term_id);
CREATE INDEX idx_enrollments_student ON enrollments (student_id, status);
CREATE INDEX idx_questions_bank_type ON questions (bank_id, question_type);
CREATE INDEX idx_assignments_window ON assignments (opens_at, closes_at);
CREATE INDEX idx_attempts_student_status ON attempts (student_id, status, started_at DESC);
CREATE INDEX idx_attempts_assignment_status ON attempts (assignment_id, status);
CREATE INDEX idx_attempts_candidate_code ON attempts (candidate_student_code) WHERE candidate_student_code IS NOT NULL;
CREATE INDEX idx_integrity_events_attempt_time ON attempt_integrity_events (attempt_id, received_at);
CREATE INDEX idx_import_jobs_owner_status ON import_jobs (owner_id, status, created_at DESC);
CREATE INDEX idx_audit_school_created ON audit_events (school_id, created_at DESC);
