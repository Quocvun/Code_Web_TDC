import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Pool, type QueryResultRow } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { MeoUser } from "./catalog";

export type PersistedRosterAccount = { user: MeoUser; salt: Buffer; passwordHash: Buffer };
export type RuntimeStateWriter = (state: unknown) => Promise<void>;
export type PersistedSubmissionFile = { fileId: string; assignmentId: string; ownerId: string; originalName: string; contentType: string; size: number; storedName: string; createdAt: string };
export type LearningAssignmentRecord = { id: string; ownerId: string; title: string; course: string; className: string; description: string; dueAt: string; points: number; published: boolean; createdAt: string };
export type LearningSubmissionRecord = { id: string; assignmentId: string; studentId: string; studentName: string; response: string; fileId?: string; fileName?: string; fileSize?: number; submittedAt: string; score?: number; feedback?: string; status: "submitted" | "graded" | "revision" };

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  get enabled() { return Boolean(this.pool); }

  async onModuleInit() {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL là bắt buộc khi NODE_ENV=production.");
      return;
    }
    this.pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX || 20),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "meotdc-api",
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
    });
    await this.pool.query("SELECT 1");
    await this.migrate();
    this.cleanupTimer = setInterval(() => {
      void this.pool?.query("DELETE FROM meotdc_rate_limits WHERE expires_at <= now(); DELETE FROM meotdc_google_nonces WHERE expires_at <= now(); DELETE FROM meotdc_sessions WHERE expires_at <= now()")
        .catch((error) => console.error("Dọn phiên/rate limit hết hạn không thành công:", error instanceof Error ? error.message : "database error"));
    }, 10 * 60_000);
    this.cleanupTimer.unref();
  }

  async onModuleDestroy() { if (this.cleanupTimer) clearInterval(this.cleanupTimer); await this.pool?.end(); }

  async query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
    if (!this.pool) throw new Error("PostgreSQL chưa được cấu hình.");
    return this.pool.query<T>(text, values);
  }

  async withRuntimeState<T>(operation: (state: unknown | null, write: RuntimeStateWriter) => Promise<T>) {
    if (!this.pool) return operation(null, async () => undefined);
    const client = await this.pool.connect();
    let dirty = false;
    let inTransaction = false;
    try {
      await client.query("BEGIN");
      inTransaction = true;
      await client.query("SELECT pg_advisory_xact_lock(74821391)");
      const result = await client.query<{ state: unknown }>("SELECT state FROM meotdc_runtime_state WHERE state_key = 'exam-runtime' FOR UPDATE");
      const write: RuntimeStateWriter = async (state) => {
        await client.query(
          `INSERT INTO meotdc_runtime_state (state_key, state, updated_at)
           VALUES ('exam-runtime', $1::jsonb, now())
           ON CONFLICT (state_key) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
          [JSON.stringify(state)],
        );
        dirty = true;
      };
      try {
        const value = await operation(result.rows[0]?.state ?? null, write);
        await client.query("COMMIT");
        inTransaction = false;
        return value;
      } catch (error) {
        if (dirty) {
          await client.query("COMMIT");
          inTransaction = false;
        }
        throw error;
      }
    } catch (error) {
      if (inTransaction) await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listRosterAccounts() {
    if (!this.pool) return [];
    const result = await this.query<{ user_payload: MeoUser; password_salt: Buffer; password_hash: Buffer }>(
      "SELECT user_payload, password_salt, password_hash FROM meotdc_roster_accounts ORDER BY username",
    );
    return result.rows.map((row) => ({ user: row.user_payload, salt: row.password_salt, passwordHash: row.password_hash }));
  }

  async getRosterAccount(username: string) {
    if (!this.pool) return null;
    const result = await this.query<{ user_payload: MeoUser; password_salt: Buffer; password_hash: Buffer }>(
      "SELECT user_payload, password_salt, password_hash FROM meotdc_roster_accounts WHERE username = $1",
      [username],
    );
    const row = result.rows[0];
    return row ? { user: row.user_payload, salt: row.password_salt, passwordHash: row.password_hash } : null;
  }

  async getRosterAccountByEmail(email: string) {
    if (!this.pool) return null;
    const result = await this.query<{ user_payload: MeoUser; password_salt: Buffer; password_hash: Buffer }>(
      "SELECT user_payload, password_salt, password_hash FROM meotdc_roster_accounts WHERE email = $1",
      [email.toLowerCase()],
    );
    const row = result.rows[0];
    return row ? { user: row.user_payload, salt: row.password_salt, passwordHash: row.password_hash } : null;
  }

  async saveRosterAccounts(records: Array<{ username: string; account: PersistedRosterAccount }>) {
    if (!this.pool || !records.length) return;
    const rows = records.map(({ username, account }) => ({ username, email: account.user.email?.toLowerCase() || null, user_payload: account.user, salt: account.salt.toString("hex"), password_hash: account.passwordHash.toString("hex") }));
    await this.query(
      `INSERT INTO meotdc_roster_accounts (username, email, user_payload, password_salt, password_hash)
       SELECT username, email, user_payload, decode(salt, 'hex'), decode(password_hash, 'hex')
       FROM jsonb_to_recordset($1::jsonb) AS x(username text, email text, user_payload jsonb, salt text, password_hash text)
       ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, user_payload = EXCLUDED.user_payload,
         password_salt = EXCLUDED.password_salt, password_hash = EXCLUDED.password_hash, updated_at = now()`,
      [JSON.stringify(rows)],
    );
  }

  async createSession(sessionHash: string, user: MeoUser, expiresAt: number) {
    if (!this.pool) return;
    await this.query(
      `INSERT INTO meotdc_sessions (session_hash, user_payload, expires_at) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (session_hash) DO UPDATE SET user_payload = EXCLUDED.user_payload, expires_at = EXCLUDED.expires_at`,
      [sessionHash, JSON.stringify(user), new Date(expiresAt).toISOString()],
    );
  }

  async getSession(sessionHash: string) {
    if (!this.pool) return null;
    const result = await this.query<{ user_payload: MeoUser; expires_at: Date }>(
      "SELECT user_payload, expires_at FROM meotdc_sessions WHERE session_hash = $1 AND expires_at > now()",
      [sessionHash],
    );
    const row = result.rows[0];
    return row ? { user: row.user_payload, expiresAt: new Date(row.expires_at).getTime() } : null;
  }

  async deleteSession(sessionHash: string) {
    if (this.pool) await this.query("DELETE FROM meotdc_sessions WHERE session_hash = $1", [sessionHash]);
  }

  async saveSubmissionFile(record: PersistedSubmissionFile) {
    if (!this.pool) return;
    await this.query(
      `INSERT INTO meotdc_submission_files (file_id, assignment_id, owner_id, original_name, content_type, size_bytes, storage_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [record.fileId, record.assignmentId, record.ownerId, record.originalName, record.contentType, record.size, record.storedName, record.createdAt],
    );
  }

  async getSubmissionFile(fileId: string): Promise<PersistedSubmissionFile | null> {
    if (!this.pool) return null;
    const result = await this.query<{ file_id: string; assignment_id: string; owner_id: string; original_name: string; content_type: string; size_bytes: string; storage_key: string; created_at: Date }>(
      "SELECT file_id, assignment_id, owner_id, original_name, content_type, size_bytes, storage_key, created_at FROM meotdc_submission_files WHERE file_id = $1",
      [fileId],
    );
    const row = result.rows[0];
    return row ? { fileId: row.file_id, assignmentId: row.assignment_id, ownerId: row.owner_id, originalName: row.original_name, contentType: row.content_type, size: Number(row.size_bytes), storedName: row.storage_key, createdAt: new Date(row.created_at).toISOString() } : null;
  }

  async listLearningAssignments() {
    const result = await this.query<{ assignment_id: string; owner_id: string; title: string; course: string; class_name: string; description: string; due_at: Date; points: string; published: boolean; created_at: Date }>(
      "SELECT assignment_id, owner_id, title, course, class_name, description, due_at, points, published, created_at FROM meotdc_learning_assignments ORDER BY created_at DESC",
    );
    return result.rows.map((row): LearningAssignmentRecord => ({ id: row.assignment_id, ownerId: row.owner_id, title: row.title, course: row.course, className: row.class_name, description: row.description, dueAt: new Date(row.due_at).toISOString(), points: Number(row.points), published: row.published, createdAt: new Date(row.created_at).toISOString() }));
  }

  async getLearningAssignment(id: string) {
    const result = await this.query<{ assignment_id: string; owner_id: string; title: string; course: string; class_name: string; description: string; due_at: Date; points: string; published: boolean; created_at: Date }>(
      "SELECT assignment_id, owner_id, title, course, class_name, description, due_at, points, published, created_at FROM meotdc_learning_assignments WHERE assignment_id = $1",
      [id],
    );
    const row = result.rows[0];
    return row ? { id: row.assignment_id, ownerId: row.owner_id, title: row.title, course: row.course, className: row.class_name, description: row.description, dueAt: new Date(row.due_at).toISOString(), points: Number(row.points), published: row.published, createdAt: new Date(row.created_at).toISOString() } satisfies LearningAssignmentRecord : null;
  }

  async saveLearningAssignment(assignment: LearningAssignmentRecord) {
    await this.query(
      `INSERT INTO meotdc_learning_assignments (assignment_id, owner_id, title, course, class_name, description, due_at, points, published, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (assignment_id) DO UPDATE SET title = EXCLUDED.title, course = EXCLUDED.course, class_name = EXCLUDED.class_name, description = EXCLUDED.description, due_at = EXCLUDED.due_at, points = EXCLUDED.points, published = EXCLUDED.published, updated_at = now()`,
      [assignment.id, assignment.ownerId, assignment.title, assignment.course, assignment.className, assignment.description, assignment.dueAt, assignment.points, assignment.published, assignment.createdAt],
    );
    return assignment;
  }

  async listLearningSubmissions(assignmentIds: string[]) {
    if (!assignmentIds.length) return [];
    const result = await this.query<{ submission_id: string; assignment_id: string; student_id: string; student_name: string; response: string; file_id: string | null; file_name: string | null; file_size: string | null; submitted_at: Date; score: string | null; feedback: string | null; status: LearningSubmissionRecord["status"] }>(
      "SELECT submission_id, assignment_id, student_id, student_name, response, file_id, file_name, file_size, submitted_at, score, feedback, status FROM meotdc_learning_submissions WHERE assignment_id = ANY($1::text[]) ORDER BY submitted_at DESC",
      [assignmentIds],
    );
    return result.rows.map((row): LearningSubmissionRecord => ({ id: row.submission_id, assignmentId: row.assignment_id, studentId: row.student_id, studentName: row.student_name, response: row.response, fileId: row.file_id || undefined, fileName: row.file_name || undefined, fileSize: row.file_size ? Number(row.file_size) : undefined, submittedAt: new Date(row.submitted_at).toISOString(), score: row.score === null ? undefined : Number(row.score), feedback: row.feedback || undefined, status: row.status }));
  }

  async saveLearningSubmission(submission: LearningSubmissionRecord) {
    const result = await this.query<{ submission_id: string; assignment_id: string; student_id: string; student_name: string; response: string; file_id: string | null; file_name: string | null; file_size: string | null; submitted_at: Date; score: string | null; feedback: string | null; status: LearningSubmissionRecord["status"] }>(
      `INSERT INTO meotdc_learning_submissions (submission_id, assignment_id, student_id, student_name, response, file_id, file_name, file_size, submitted_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'submitted')
       ON CONFLICT (assignment_id, student_id) DO UPDATE SET submission_id = EXCLUDED.submission_id, student_name = EXCLUDED.student_name, response = EXCLUDED.response, file_id = EXCLUDED.file_id, file_name = EXCLUDED.file_name, file_size = EXCLUDED.file_size, submitted_at = EXCLUDED.submitted_at, score = NULL, feedback = NULL, status = 'submitted'
       RETURNING submission_id, assignment_id, student_id, student_name, response, file_id, file_name, file_size, submitted_at, score, feedback, status`,
      [submission.id, submission.assignmentId, submission.studentId, submission.studentName, submission.response, submission.fileId || null, submission.fileName || null, submission.fileSize ?? null, submission.submittedAt],
    );
    const row = result.rows[0];
    return { id: row.submission_id, assignmentId: row.assignment_id, studentId: row.student_id, studentName: row.student_name, response: row.response, fileId: row.file_id || undefined, fileName: row.file_name || undefined, fileSize: row.file_size ? Number(row.file_size) : undefined, submittedAt: new Date(row.submitted_at).toISOString(), score: row.score === null ? undefined : Number(row.score), feedback: row.feedback || undefined, status: row.status } satisfies LearningSubmissionRecord;
  }

  async getLearningSubmission(id: string) {
    const result = await this.query<{ submission_id: string; assignment_id: string; student_id: string; student_name: string; response: string; file_id: string | null; file_name: string | null; file_size: string | null; submitted_at: Date; score: string | null; feedback: string | null; status: LearningSubmissionRecord["status"] }>(
      "SELECT submission_id, assignment_id, student_id, student_name, response, file_id, file_name, file_size, submitted_at, score, feedback, status FROM meotdc_learning_submissions WHERE submission_id = $1",
      [id],
    );
    const row = result.rows[0];
    return row ? { id: row.submission_id, assignmentId: row.assignment_id, studentId: row.student_id, studentName: row.student_name, response: row.response, fileId: row.file_id || undefined, fileName: row.file_name || undefined, fileSize: row.file_size ? Number(row.file_size) : undefined, submittedAt: new Date(row.submitted_at).toISOString(), score: row.score === null ? undefined : Number(row.score), feedback: row.feedback || undefined, status: row.status } satisfies LearningSubmissionRecord : null;
  }

  async gradeLearningSubmission(id: string, score: number, feedback: string, status: "graded" | "revision") {
    const result = await this.query<{ submission_id: string; assignment_id: string; student_id: string; student_name: string; response: string; file_id: string | null; file_name: string | null; file_size: string | null; submitted_at: Date; score: string | null; feedback: string | null; status: LearningSubmissionRecord["status"] }>(
      "UPDATE meotdc_learning_submissions SET score = $2, feedback = $3, status = $4 WHERE submission_id = $1 RETURNING submission_id, assignment_id, student_id, student_name, response, file_id, file_name, file_size, submitted_at, score, feedback, status",
      [id, score, feedback, status],
    );
    const row = result.rows[0];
    return row ? { id: row.submission_id, assignmentId: row.assignment_id, studentId: row.student_id, studentName: row.student_name, response: row.response, fileId: row.file_id || undefined, fileName: row.file_name || undefined, fileSize: row.file_size ? Number(row.file_size) : undefined, submittedAt: new Date(row.submitted_at).toISOString(), score: row.score === null ? undefined : Number(row.score), feedback: row.feedback || undefined, status: row.status } satisfies LearningSubmissionRecord : null;
  }

  async checkRateLimit(bucketKey: string, limit: number, windowMs: number) {
    if (!this.pool) return null;
    const hitCount = await this.incrementRateLimit(bucketKey, windowMs);
    return hitCount === null ? null : hitCount <= limit;
  }

  async incrementRateLimit(bucketKey: string, windowMs: number) {
    if (!this.pool) return null;
    const result = await this.query<{ hit_count: number }>(
      `INSERT INTO meotdc_rate_limits (bucket_key, hit_count, expires_at)
       VALUES ($1, 1, now() + ($2::double precision * interval '1 millisecond'))
       ON CONFLICT (bucket_key) DO UPDATE SET
         hit_count = CASE WHEN meotdc_rate_limits.expires_at <= now() THEN 1 ELSE meotdc_rate_limits.hit_count + 1 END,
         expires_at = CASE WHEN meotdc_rate_limits.expires_at <= now() THEN now() + ($2::double precision * interval '1 millisecond') ELSE meotdc_rate_limits.expires_at END,
         updated_at = now()
       RETURNING hit_count`,
      [bucketKey, windowMs],
    );
    return Number(result.rows[0]?.hit_count || 0);
  }

  async getRateLimitCount(bucketKey: string) {
    if (!this.pool) return null;
    const result = await this.query<{ hit_count: number }>("SELECT hit_count FROM meotdc_rate_limits WHERE bucket_key = $1 AND expires_at > now()", [bucketKey]);
    return Number(result.rows[0]?.hit_count || 0);
  }

  async clearRateLimit(bucketKey: string) {
    if (this.pool) await this.query("DELETE FROM meotdc_rate_limits WHERE bucket_key = $1", [bucketKey]);
  }

  async consumeGoogleNonce(nonce: string, expiresAt: number) {
    if (!this.pool) return null;
    const nonceHash = createHash("sha256").update(nonce).digest("hex");
    await this.query("DELETE FROM meotdc_google_nonces WHERE expires_at <= now()");
    const result = await this.query(
      "INSERT INTO meotdc_google_nonces (nonce_hash, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING nonce_hash",
      [nonceHash, new Date(expiresAt).toISOString()],
    );
    return Boolean(result.rowCount);
  }

  async health() {
    if (!this.pool) return { mode: "local-json", database: "not-configured" };
    await this.query("SELECT 1");
    return { mode: "postgres", database: "connected" };
  }

  private async migrate() {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(74821392)");
      await client.query("CREATE TABLE IF NOT EXISTS meotdc_schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
      const directory = join(__dirname, "../database");
      const files = (await readdir(directory)).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name)).sort();
      for (const filename of files) {
        const version = filename.slice(0, filename.indexOf("_"));
        const applied = await client.query("SELECT 1 FROM meotdc_schema_migrations WHERE version = $1", [version]);
        if (applied.rowCount) continue;
        const sql = await readFile(join(directory, filename), "utf8");
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query("INSERT INTO meotdc_schema_migrations (version) VALUES ($1)", [version]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw new Error(`Không thể áp dụng migration ${filename}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(74821392)").catch(() => undefined);
      client.release();
    }
  }
}

export type ExamRuntimeTransactionTarget = { runWithRuntimeTransaction<T>(operation: () => Promise<T>): Promise<T> };

export function WithRuntimeTransaction(): MethodDecorator {
  return (_target, _propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    descriptor.value = function (this: ExamRuntimeTransactionTarget, ...args: unknown[]) {
      return this.runWithRuntimeTransaction(() => original.apply(this, args));
    };
    return descriptor;
  };
}

