CREATE TABLE IF NOT EXISTS meotdc_learning_courses (
  course_id text PRIMARY KEY,
  owner_id text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  course_code text NOT NULL CHECK (length(course_code) BETWEEN 1 AND 80),
  class_name text NOT NULL CHECK (length(class_name) BETWEEN 1 AND 80),
  chapters jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(chapters) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meotdc_learning_courses_class
  ON meotdc_learning_courses (class_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_meotdc_learning_courses_owner
  ON meotdc_learning_courses (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS meotdc_learning_course_progress (
  course_id text NOT NULL REFERENCES meotdc_learning_courses(course_id) ON DELETE CASCADE,
  student_id text NOT NULL,
  completed_lessons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(completed_lessons) = 'array'),
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_meotdc_learning_course_progress_student
  ON meotdc_learning_course_progress (student_id, updated_at DESC);
