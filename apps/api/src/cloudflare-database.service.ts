import { Injectable, OnModuleInit } from "@nestjs/common";
import { createHash } from "node:crypto";
import { DatabaseService, type LearningAssignmentRecord, type LearningCourseProgressRecord, type LearningCourseRecord, type LearningSubmissionRecord, type PersistedRosterAccount, type PersistedSubmissionFile, type RuntimeStateWriter } from "./database.service";
import { getCloudflareDatabase, type D1DatabaseBinding } from "./cloudflare-runtime";
import type { MeoUser } from "./catalog";

type D1Row = {
  record_key: string;
  record_json: string;
  email: string | null;
  owner_id: string | null;
  submission_id: string | null;
  assignment_id: string | null;
  student_id: string | null;
  class_name: string | null;
  course_code: string | null;
  created_at: string | null;
  due_at: string | null;
  published: number | null;
  hit_count: number | null;
  expires_at: number | null;
};

type RecordMeta = Partial<Pick<D1Row, "email" | "owner_id" | "submission_id" | "assignment_id" | "student_id" | "class_name" | "course_code" | "created_at" | "due_at" | "published" | "hit_count" | "expires_at">>;

const schema = [
  `CREATE TABLE IF NOT EXISTS meotdc_runtime_state (
    state_key TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS meotdc_kv (
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
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS meotdc_kv_email ON meotdc_kv(namespace, email) WHERE email IS NOT NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS meotdc_kv_assignment_student ON meotdc_kv(namespace, assignment_id, student_id) WHERE assignment_id IS NOT NULL AND student_id IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS meotdc_kv_assignment_time ON meotdc_kv(namespace, assignment_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS meotdc_kv_owner_time ON meotdc_kv(namespace, owner_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS meotdc_kv_class_due ON meotdc_kv(namespace, class_name, due_at)",
];

const rosterFromRow = (row: D1Row): PersistedRosterAccount => {
  const value = JSON.parse(row.record_json) as { user: MeoUser; salt: string; passwordHash: string };
  return { user: value.user, salt: Buffer.from(value.salt, "hex"), passwordHash: Buffer.from(value.passwordHash, "hex") };
};

type FullLearningSubmission = Omit<LearningSubmissionRecord, "fileId" | "fileName" | "fileSize" | "score" | "feedback"> & {
  fileId: string | undefined;
  fileName: string | undefined;
  fileSize: number | undefined;
  score: number | undefined;
  feedback: string | undefined;
};

const normalizeSubmission = (submission: LearningSubmissionRecord): FullLearningSubmission => ({
  ...submission,
  fileId: submission.fileId,
  fileName: submission.fileName,
  fileSize: submission.fileSize,
  score: submission.score,
  feedback: submission.feedback,
});

@Injectable()
export class CloudflareDatabaseService extends DatabaseService implements OnModuleInit {
  private readonly d1: D1DatabaseBinding = getCloudflareDatabase();

  override get enabled() { return true; }

  async onModuleInit() {
    await this.d1.batch(schema.map((sql) => this.d1.prepare(sql)));
    await this.d1.prepare("DELETE FROM meotdc_kv WHERE expires_at IS NOT NULL AND expires_at <= ?").bind(Date.now()).run();
  }

  private async first<T = D1Row>(sql: string, values: unknown[] = []) {
    return this.d1.prepare(sql).bind(...values).first<T>();
  }

  private async all<T = D1Row>(sql: string, values: unknown[] = []) {
    return (await this.d1.prepare(sql).bind(...values).all<T>()).results;
  }

  private async put(namespace: string, key: string, value: unknown, meta: RecordMeta = {}) {
    const statement = this.d1.prepare(
      `INSERT INTO meotdc_kv (namespace, record_key, record_json, email, owner_id, submission_id, assignment_id, student_id, class_name, course_code, created_at, due_at, published, hit_count, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(namespace, record_key) DO UPDATE SET
         record_json = excluded.record_json, email = excluded.email, owner_id = excluded.owner_id,
         submission_id = excluded.submission_id, assignment_id = excluded.assignment_id, student_id = excluded.student_id,
         class_name = excluded.class_name, course_code = excluded.course_code, created_at = excluded.created_at,
         due_at = excluded.due_at, published = excluded.published, hit_count = excluded.hit_count, expires_at = excluded.expires_at`,
    );
    await statement.bind(namespace, key, JSON.stringify(value), meta.email ?? null, meta.owner_id ?? null, meta.submission_id ?? null,
      meta.assignment_id ?? null, meta.student_id ?? null, meta.class_name ?? null, meta.course_code ?? null, meta.created_at ?? null,
      meta.due_at ?? null, meta.published ?? null, meta.hit_count ?? null, meta.expires_at ?? null).run();
  }

  async withRuntimeState<T>(operation: (state: unknown | null, write: RuntimeStateWriter) => Promise<T>) {
    for (let retry = 0; retry < 20; retry += 1) {
      const current = await this.first<{ state_json: string; revision: number }>(
        "SELECT state_json, revision FROM meotdc_runtime_state WHERE state_key = ?", ["exam-runtime"],
      );
      let nextState: unknown;
      let dirty = false;
      const write: RuntimeStateWriter = async (state) => { nextState = state; dirty = true; };
      let result: T | undefined;
      let operationError: unknown;
      try { result = await operation(current ? JSON.parse(current.state_json) : null, write); }
      catch (error) { operationError = error; }

      if (!dirty) {
        if (operationError !== undefined) throw operationError;
        return result as T;
      }

      const now = new Date().toISOString();
      const saved = current
        ? await this.d1.prepare("UPDATE meotdc_runtime_state SET state_json = ?, revision = revision + 1, updated_at = ? WHERE state_key = ? AND revision = ?")
          .bind(JSON.stringify(nextState), now, "exam-runtime", current.revision).run()
        : await this.d1.prepare("INSERT INTO meotdc_runtime_state (state_key, state_json, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(state_key) DO NOTHING")
          .bind("exam-runtime", JSON.stringify(nextState), now).run();
      if (saved.meta.changes === 1) {
        if (operationError !== undefined) throw operationError;
        return result as T;
      }
    }
    throw new Error("D1 đang nhận nhiều thay đổi đồng thời. Vui lòng gửi lại thao tác.");
  }

  async listRosterAccounts() {
    const rows = await this.all("SELECT record_json FROM meotdc_kv WHERE namespace = 'roster' ORDER BY record_key");
    return rows.map((row) => rosterFromRow(row as D1Row));
  }

  async getRosterAccount(username: string) {
    const row = await this.first("SELECT record_json FROM meotdc_kv WHERE namespace = 'roster' AND record_key = ?", [username]);
    return row ? rosterFromRow(row as D1Row) : null;
  }

  async getRosterAccountByEmail(email: string) {
    const row = await this.first("SELECT record_json FROM meotdc_kv WHERE namespace = 'roster' AND email = ?", [email.toLowerCase()]);
    return row ? rosterFromRow(row as D1Row) : null;
  }

  async saveRosterAccounts(records: Array<{ username: string; account: PersistedRosterAccount }>) {
    for (let offset = 0; offset < records.length; offset += 100) {
      const statements = records.slice(offset, offset + 100).map(({ username, account }) => this.d1.prepare(
        `INSERT INTO meotdc_kv (namespace, record_key, record_json, email, owner_id)
         VALUES ('roster', ?, ?, ?, ?)
         ON CONFLICT(namespace, record_key) DO UPDATE SET record_json = excluded.record_json, email = excluded.email, owner_id = excluded.owner_id`,
      ).bind(username, JSON.stringify({ user: account.user, salt: account.salt.toString("hex"), passwordHash: account.passwordHash.toString("hex") }), account.user.email?.toLowerCase() || null, account.user.id));
      await this.d1.batch(statements);
    }
  }

  async createSession(sessionHash: string, user: MeoUser, expiresAt: number) {
    await this.put("session", sessionHash, { user, expiresAt }, { owner_id: user.id, expires_at: expiresAt });
  }

  async getSession(sessionHash: string) {
    const row = await this.first("SELECT record_json FROM meotdc_kv WHERE namespace = 'session' AND record_key = ? AND expires_at > ?", [sessionHash, Date.now()]);
    return row ? JSON.parse((row as D1Row).record_json) as { user: MeoUser; expiresAt: number } : null;
  }

  async deleteSession(sessionHash: string) {
    await this.d1.prepare("DELETE FROM meotdc_kv WHERE namespace = 'session' AND record_key = ?").bind(sessionHash).run();
  }

  async saveSubmissionFile(record: PersistedSubmissionFile) {
    await this.put("submission_file", record.fileId, record, { owner_id: record.ownerId, assignment_id: record.assignmentId, created_at: record.createdAt });
  }

  async getSubmissionFile(fileId: string): Promise<PersistedSubmissionFile | null> {
    const row = await this.first("SELECT record_json FROM meotdc_kv WHERE namespace = 'submission_file' AND record_key = ?", [fileId]);
    return row ? JSON.parse((row as D1Row).record_json) as PersistedSubmissionFile : null;
  }

  async listLearningAssignments() {
    return (await this.all("SELECT record_json FROM meotdc_kv WHERE namespace = 'learning_assignment' ORDER BY created_at DESC"))
      .map((row) => JSON.parse((row as D1Row).record_json) as LearningAssignmentRecord);
  }

  async getLearningAssignment(id: string) {
    const row = await this.first("SELECT record_json FROM meotdc_kv WHERE namespace = 'learning_assignment' AND record_key = ?", [id]);
    return row ? JSON.parse((row as D1Row).record_json) as LearningAssignmentRecord : null;
  }

  async saveLearningAssignment(assignment: LearningAssignmentRecord) {
    await this.put("learning_assignment", assignment.id, assignment, { owner_id: assignment.ownerId, class_name: assignment.className, course_code: assignment.course, due_at: assignment.dueAt, published: Number(assignment.published), created_at: assignment.createdAt });
    return assignment;
  }

  async listLearningCourses() {
    return (await this.all("SELECT record_json FROM meotdc_kv WHERE namespace = 'learning_course' ORDER BY created_at DESC"))
      .map((row) => JSON.parse((row as D1Row).record_json) as LearningCourseRecord);
  }

  async getLearningCourse(id: string) {
    const row = await this.first("SELECT record_json FROM meotdc_kv WHERE namespace = 'learning_course' AND record_key = ?", [id]);
    return row ? JSON.parse((row as D1Row).record_json) as LearningCourseRecord : null;
  }

  async saveLearningCourse(course: LearningCourseRecord) {
    const existing = await this.first<{ owner_id: string | null }>("SELECT owner_id FROM meotdc_kv WHERE namespace = 'learning_course' AND record_key = ?", [course.id]);
    if (existing && existing.owner_id !== course.ownerId) return null;
    await this.put("learning_course", course.id, course, { owner_id: course.ownerId, class_name: course.className, course_code: course.code, created_at: course.createdAt });
    return course;
  }

  async getLearningCourseProgress(courseId: string, studentId: string): Promise<LearningCourseProgressRecord> {
    const row = await this.first("SELECT record_json FROM meotdc_kv WHERE namespace = 'course_progress' AND record_key = ?", [`${courseId}:${studentId}`]);
    return row ? JSON.parse((row as D1Row).record_json) as LearningCourseProgressRecord : { completedLessons: [], progress: 0 };
  }

  async completeLearningCourseLesson(courseId: string, studentId: string, lessonId: string, totalLessons: number): Promise<LearningCourseProgressRecord> {
    const key = `${courseId}:${studentId}`;
    const current = await this.getLearningCourseProgress(courseId, studentId);
    const completedLessons = current.completedLessons.includes(lessonId) ? current.completedLessons : [...current.completedLessons, lessonId];
    const progress = Math.min(100, Math.round(completedLessons.length * 100 / Math.max(1, totalLessons)));
    const result = { completedLessons, progress };
    await this.put("course_progress", key, result, { owner_id: studentId, created_at: new Date().toISOString() });
    return result;
  }

  async listLearningSubmissions(assignmentIds: string[]) {
    const rows: D1Row[] = [];
    for (let offset = 0; offset < assignmentIds.length; offset += 90) {
      const chunk = assignmentIds.slice(offset, offset + 90);
      const placeholders = chunk.map(() => "?").join(",");
      rows.push(...await this.all(`SELECT record_json FROM meotdc_kv WHERE namespace = 'learning_submission' AND assignment_id IN (${placeholders}) ORDER BY created_at DESC`, chunk) as D1Row[]);
    }
    return rows.map((row) => normalizeSubmission(JSON.parse(row.record_json) as LearningSubmissionRecord)).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  async saveLearningSubmission(submission: LearningSubmissionRecord) {
    const key = `${submission.assignmentId}:${submission.studentId}`;
    await this.put("learning_submission", key, submission, { submission_id: submission.id, assignment_id: submission.assignmentId, student_id: submission.studentId, owner_id: submission.studentId, created_at: submission.submittedAt });
    return normalizeSubmission(submission);
  }

  async getLearningSubmission(id: string) {
    const row = await this.first("SELECT record_json FROM meotdc_kv WHERE namespace = 'learning_submission' AND submission_id = ?", [id]);
    return row ? normalizeSubmission(JSON.parse((row as D1Row).record_json) as LearningSubmissionRecord) : null;
  }

  async gradeLearningSubmission(id: string, score: number, feedback: string, status: "graded" | "revision") {
    const row = await this.first("SELECT record_key, record_json FROM meotdc_kv WHERE namespace = 'learning_submission' AND submission_id = ?", [id]);
    if (!row) return null;
    const current = JSON.parse((row as D1Row).record_json) as LearningSubmissionRecord;
    const updated = { ...current, score, feedback, status };
    await this.put("learning_submission", (row as D1Row).record_key, updated, { submission_id: id, assignment_id: current.assignmentId, student_id: current.studentId, owner_id: current.studentId, created_at: current.submittedAt });
    return normalizeSubmission(updated);
  }

  async checkRateLimit(bucketKey: string, limit: number, windowMs: number) {
    return (await this.incrementRateLimit(bucketKey, windowMs)) <= limit;
  }

  async incrementRateLimit(bucketKey: string, windowMs: number) {
    const now = Date.now();
    const result = await this.d1.prepare(
      `INSERT INTO meotdc_kv (namespace, record_key, record_json, hit_count, expires_at)
       VALUES ('rate_limit', ?, '{}', 1, ?)
       ON CONFLICT(namespace, record_key) DO UPDATE SET
         hit_count = CASE WHEN meotdc_kv.expires_at <= ? THEN 1 ELSE meotdc_kv.hit_count + 1 END,
         expires_at = CASE WHEN meotdc_kv.expires_at <= ? THEN ? ELSE meotdc_kv.expires_at END
       RETURNING hit_count`,
    ).bind(bucketKey, now + windowMs, now, now, now + windowMs).first<{ hit_count: number }>();
    return Number(result?.hit_count || 0);
  }

  async getRateLimitCount(bucketKey: string) {
    const row = await this.first<{ hit_count: number }>("SELECT hit_count FROM meotdc_kv WHERE namespace = 'rate_limit' AND record_key = ? AND expires_at > ?", [bucketKey, Date.now()]);
    return Number(row?.hit_count || 0);
  }

  async clearRateLimit(bucketKey: string) {
    await this.d1.prepare("DELETE FROM meotdc_kv WHERE namespace = 'rate_limit' AND record_key = ?").bind(bucketKey).run();
  }

  async consumeGoogleNonce(nonce: string, expiresAt: number) {
    const nonceHash = createHash("sha256").update(nonce).digest("hex");
    const result = await this.d1.prepare("INSERT INTO meotdc_kv (namespace, record_key, record_json, expires_at) VALUES ('google_nonce', ?, '{}', ?) ON CONFLICT(namespace, record_key) DO NOTHING RETURNING record_key")
      .bind(nonceHash, expiresAt).first<{ record_key: string }>();
    return Boolean(result?.record_key);
  }

  async health() {
    await this.d1.prepare("SELECT 1 AS ok").first();
    return { mode: "cloudflare-d1", database: "connected" };
  }
}
