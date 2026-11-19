import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { MeoUser } from "./catalog";
import { DatabaseService, type RuntimeStateWriter, WithRuntimeTransaction } from "./database.service";

type QuestionType = "single" | "multiple" | "true_false" | "short" | "essay";
type ExamQuestion = { id: string; prompt: string; type: QuestionType; options: string[]; answer: string | string[]; points: number; topic?: string; outcome?: string; difficulty?: string };
type MatrixQuota = { key: string; topic: string; outcome: string; difficulty: string; count: number };
type StoredExam = {
  id: string; ownerId: string; title: string; course: string; className: string; opensAt?: string; dueAt: string;
  durationMinutes: number; attemptsAllowed: number; published: boolean; audience: "class" | "student" | "public";
  targetStudentCodes: string[]; strictIntegrity: boolean; shuffleQuestions: boolean; randomQuestionCount: number;
  matrixQuotas: MatrixQuota[]; passwordSalt?: string; passwordHash?: string; candidateFields: string[]; showScore: string;
  questions: ExamQuestion[]; createdAt: string;
};
type StoredAnswer = { value: string | string[]; sequence: number; savedAt: string };
type IntegrityEvent = { kind: string; at: string; clientAt?: string };
type StoredAttempt = {
  id: string; examId: string; studentId: string; studentName: string; studentCode?: string; major?: string; email?: string;
  candidateDetails: Record<string, string>; attemptNo: number; questionIds: string[]; status: "in_progress" | "submitted" | "expired";
  startedAt: string; deadlineAt: string; lastSeenAt: string; submittedAt?: string; answers: Record<string, StoredAnswer>;
  integrityEvents: IntegrityEvent[]; strictIntegrity: boolean; fullscreenUsed: boolean; isFocused: boolean; isFullscreen: boolean; integrityAutoSubmitted: boolean;
  submissionReason?: "student" | "time-limit" | "integrity-threshold"; score?: number; objectiveScore?: number; totalPoints?: number; scoreReleased?: boolean;
  scoreReleasedAt?: string; manualScores?: Record<string, number>; manualFeedback?: Record<string, string>; tokenHash: string;
};
type RuntimeStore = { exams: StoredExam[]; attempts: StoredAttempt[]; passwordFailures?: Array<[string, { count: number; expiresAt: number }]> };

const eventKinds = new Set(["focus-loss", "fullscreen-exit", "copy-attempt", "cut-attempt", "paste-attempt", "print-attempt", "shortcut-attempt", "context-menu", "leave-attempt"]);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const matrixKey = (question: ExamQuestion) => [question.topic?.trim() || "Chưa gắn chủ đề", question.outcome?.trim() || "Chưa gắn chuẩn đầu ra", question.difficulty || "Chưa phân loại"].join("\u001f");
const normalized = (value: string | string[]) => (Array.isArray(value) ? [...value].map((item) => item.trim().toLocaleLowerCase("vi-VN")).sort() : [value.trim().toLocaleLowerCase("vi-VN")]).join("\u001f");
const hasCorrectAnswer = (answer: string | string[]) => Array.isArray(answer) ? answer.length > 0 && answer.every((value) => Boolean(value.trim())) : Boolean(answer.trim());

function countStrikes(events: IntegrityEvent[]) {
  let count = 0;
  let previousFocus = Number.NEGATIVE_INFINITY;
  for (const event of events) {
    const at = Date.parse(event.at);
    if (!Number.isFinite(at)) continue;
    if (event.kind === "focus-loss" || event.kind === "fullscreen-exit") {
      if (at - previousFocus > 2500) count += 1;
      previousFocus = at;
    } else count += 1;
  }
  return count;
}

@Injectable()
export class ExamRuntimeService {
  private readonly filePath = resolve(process.env.MEOTDC_EXAM_STORE_PATH || "data/exam-runtime.json");
  private readonly exams = new Map<string, StoredExam>();
  private readonly attempts = new Map<string, StoredAttempt>();
  private readonly passwordFailures = new Map<string, { count: number; expiresAt: number }>();
  private loadPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private runtimeWriter: RuntimeStateWriter | null = null;

  constructor(private readonly database: DatabaseService) {}

  private async ensureLoaded() {
    if (!this.loadPromise) this.loadPromise = (async () => {
      try {
        const store = JSON.parse(await readFile(this.filePath, "utf8")) as RuntimeStore;
        this.restore(store);
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
        throw error;
      }
    })();
    await this.loadPromise;
  }

  private restore(store: RuntimeStore) {
    this.exams.clear(); this.attempts.clear(); this.passwordFailures.clear();
    if (Array.isArray(store.exams)) for (const exam of store.exams) if (exam && typeof exam.id === "string") this.exams.set(exam.id, exam);
    if (Array.isArray(store.attempts)) for (const attempt of store.attempts) if (attempt && typeof attempt.id === "string") this.attempts.set(attempt.id, attempt);
    if (Array.isArray(store.passwordFailures)) for (const entry of store.passwordFailures) if (Array.isArray(entry) && typeof entry[0] === "string") this.passwordFailures.set(entry[0], entry[1]);
  }

  private snapshot(): RuntimeStore {
    return { exams: [...this.exams.values()], attempts: [...this.attempts.values()], passwordFailures: [...this.passwordFailures.entries()] };
  }

  async runWithRuntimeTransaction<T>(operation: () => Promise<T>) {
    if (!this.database.enabled) return operation();
    return this.database.withRuntimeState(async (state, write) => {
      if (state && typeof state === "object") this.restore(state as RuntimeStore);
      else {
        this.exams.clear(); this.attempts.clear(); this.passwordFailures.clear();
        try {
          const legacy = JSON.parse(await readFile(this.filePath, "utf8")) as RuntimeStore;
          this.restore(legacy);
        } catch (error) {
          if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
        }
      }
      this.loadPromise = Promise.resolve();
      this.runtimeWriter = write;
      try { return await operation(); }
      finally { this.runtimeWriter = null; }
    });
  }

  private async persist() {
    const snapshot = this.snapshot();
    if (this.runtimeWriter) { await this.runtimeWriter(snapshot); return; }
    const serialized = JSON.stringify(snapshot);
    const write = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, serialized, { flag: "wx" });
      await rename(temporaryPath, this.filePath);
    });
    this.writeQueue = write.catch(() => undefined);
    return write;
  }

  private safeExam(exam: StoredExam, includeAnswers: boolean, includeRoster = true) {
    const { ownerId: _owner, passwordHash: _hash, passwordSalt: _salt, targetStudentCodes, ...plain } = exam;
    const now = Date.now();
    const status = exam.opensAt && now < Date.parse(exam.opensAt) ? "Sắp diễn ra" : now > Date.parse(exam.dueAt) ? "Đã kết thúc" : "Đang diễn ra";
    return { ...plain, targetStudentCodes: includeRoster ? targetStudentCodes : undefined, status, questionCount: exam.randomQuestionCount || exam.questions.length, submissions: [...this.attempts.values()].filter((attempt) => attempt.examId === exam.id && attempt.status !== "in_progress").length,
      serverBacked: true, accessPasswordRequired: Boolean(exam.passwordHash), accessPassword: undefined,
      questions: exam.questions.map((question) => {
        if (includeAnswers) return question;
        const { answer: _answer, ...safeQuestion } = question;
        return { ...safeQuestion, answer: "" };
      }) };
  }

  @WithRuntimeTransaction()
  async listExams(user: MeoUser) {
    await this.ensureLoaded();
    const visible = [...this.exams.values()].filter((exam) => {
      if (user.role === "teacher") return exam.ownerId === user.id;
      if (user.role === "school" || user.role === "admin") return true;
      if (user.role !== "student" || !exam.published) return false;
      if (exam.audience === "class") return Boolean(user.className && user.className === exam.className);
      if (exam.audience === "student") return Boolean(user.studentCode && exam.targetStudentCodes.some((code) => code.toLowerCase() === user.studentCode?.toLowerCase()));
      return user.authProvider === "google";
    });
    return visible.map((exam) => this.safeExam(exam, user.role !== "student", user.role !== "student"));
  }

  @WithRuntimeTransaction()
  async createExam(user: MeoUser, body: Record<string, unknown>) {
    await this.ensureLoaded();
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 140) : "";
    if (!title) throw new BadRequestException("Vui lòng nhập tên đề thi.");
    if (!Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 300) throw new BadRequestException("Đề cần có từ 1 đến 300 câu hỏi.");
    const supported = new Set<QuestionType>(["single", "multiple", "true_false", "short", "essay"]);
    const questions = body.questions.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new BadRequestException(`Câu ${index + 1} không hợp lệ.`);
      const item = entry as Record<string, unknown>;
      const type = typeof item.type === "string" && supported.has(item.type as QuestionType) ? item.type as QuestionType : null;
      const prompt = typeof item.prompt === "string" ? item.prompt.trim().slice(0, 10_000) : "";
      const answer = typeof item.answer === "string" || Array.isArray(item.answer) && item.answer.every((part) => typeof part === "string") ? item.answer as string | string[] : "";
      const points = Number(item.points);
      const options = Array.isArray(item.options) ? item.options.filter((option): option is string => typeof option === "string").map((option) => option.slice(0, 2000)).slice(0, 20) : [];
      if (!type || !prompt || !Number.isFinite(points) || points < 0 || points > 100) throw new BadRequestException(`Câu ${index + 1} thiếu nội dung, loại hoặc điểm hợp lệ.`);
      if (hasCorrectAnswer(answer) && (type === "multiple" && !Array.isArray(answer) || type !== "multiple" && Array.isArray(answer))) throw new BadRequestException(`Đáp án câu ${index + 1} không đúng dạng.`);
      if (["single", "multiple", "true_false"].includes(type) && options.length < 2) throw new BadRequestException(`Câu ${index + 1} cần ít nhất hai phương án.`);
      if (["single", "multiple", "true_false"].includes(type) && hasCorrectAnswer(answer)) {
        const correctIndexes = Array.isArray(answer) ? answer : [answer];
        if (correctIndexes.some((value) => !/^\d+$/.test(value) || Number(value) >= options.length)) throw new BadRequestException(`Đáp án câu ${index + 1} phải tham chiếu một phương án hợp lệ.`);
      }
      if (body.published === true && type !== "essay" && !hasCorrectAnswer(answer)) throw new BadRequestException(`Câu ${index + 1} chưa có đáp án chuẩn.`);
      return { id: typeof item.id === "string" && item.id.length <= 160 ? item.id : `q-${index + 1}`, prompt, type, answer, points, options,
        topic: typeof item.topic === "string" ? item.topic.slice(0, 100) : undefined, outcome: typeof item.outcome === "string" ? item.outcome.slice(0, 120) : undefined,
        difficulty: typeof item.difficulty === "string" ? item.difficulty.slice(0, 40) : undefined } satisfies ExamQuestion;
    });
    const dueAt = typeof body.dueAt === "string" ? new Date(body.dueAt) : new Date(Number.NaN);
    const opensAt = body.opensAt === undefined ? undefined : typeof body.opensAt === "string" ? new Date(body.opensAt) : new Date(Number.NaN);
    if (!Number.isFinite(dueAt.getTime()) || opensAt && !Number.isFinite(opensAt.getTime()) || opensAt && opensAt >= dueAt) throw new BadRequestException("Lịch mở/đóng đề không hợp lệ.");
    const int = (key: string, fallback: number, min: number, max: number) => { const value = body[key] === undefined ? fallback : Number(body[key]); if (!Number.isInteger(value) || value < min || value > max) throw new BadRequestException(`${key} nằm ngoài giới hạn.`); return value; };
    const id = typeof body.id === "string" && /^exam-[a-z0-9-]{8,100}$/i.test(body.id) ? body.id : `exam-${randomUUID()}`;
    if (this.exams.has(id)) throw new ConflictException("Mã đề đã tồn tại trên máy chủ.");
    const count = int("randomQuestionCount", 0, 0, questions.length);
    const audience = body.audience === "public" || body.audience === "student" ? body.audience : "class";
    const targetStudentCodes = Array.isArray(body.targetStudentCodes) ? body.targetStudentCodes.filter((code): code is string => typeof code === "string").map((code) => code.trim()).filter(Boolean).slice(0, 5000) : [];
    if (body.published === true && audience === "student" && !targetStudentCodes.length) throw new BadRequestException("Đề giao riêng cần có ít nhất một MSSV.");
    const quotas = Array.isArray(body.matrixQuotas) ? body.matrixQuotas as MatrixQuota[] : [];
    if (count && quotas.length) {
      const buckets = new Map<string, number>();
      for (const question of questions) buckets.set(matrixKey(question), (buckets.get(matrixKey(question)) || 0) + 1);
      const seen = new Set<string>();
      const sum = quotas.reduce((total, quota) => {
        if (!quota || typeof quota.key !== "string" || seen.has(quota.key) || !Number.isInteger(quota.count) || quota.count < 0 || quota.count > (buckets.get(quota.key) || 0)) throw new BadRequestException("Quota ma trận không hợp lệ.");
        seen.add(quota.key); return total + quota.count;
      }, 0);
      if (sum !== count || seen.size !== buckets.size) throw new BadRequestException("Quota ma trận không khớp số câu đã chọn.");
    }
    const accessPassword = typeof body.accessPassword === "string" ? body.accessPassword.trim().slice(0, 100) : "";
    const salt = accessPassword ? randomBytes(16) : undefined;
    const exam: StoredExam = {
      id, ownerId: user.id, title, course: typeof body.course === "string" ? body.course.trim().slice(0, 100) : "Chưa chọn học phần",
      className: typeof body.className === "string" ? body.className.trim().slice(0, 80) : "Chưa chọn lớp", opensAt: opensAt?.toISOString(), dueAt: dueAt.toISOString(),
      durationMinutes: int("durationMinutes", 30, 1, 300), attemptsAllowed: int("attemptsAllowed", 1, 1, 20), published: body.published === true, audience, targetStudentCodes,
      strictIntegrity: body.strictIntegrity !== false, shuffleQuestions: body.shuffleQuestions === true, randomQuestionCount: count, matrixQuotas: quotas,
      passwordSalt: salt?.toString("hex"), passwordHash: salt && accessPassword ? scryptSync(accessPassword, salt, 64).toString("hex") : undefined,
      candidateFields: Array.isArray(body.candidateFields) ? body.candidateFields.filter((field): field is string => typeof field === "string").map((field) => field.trim().slice(0, 100)).filter(Boolean).slice(0, 8) : [],
      showScore: typeof body.showScore === "string" && ["after-submit", "after-window", "teacher-release"].includes(body.showScore) ? body.showScore : "after-submit", questions, createdAt: new Date().toISOString(),
    };
    this.exams.set(id, exam); await this.persist(); return this.safeExam(exam, true);
  }

  @WithRuntimeTransaction()
  async setPublished(user: MeoUser, examId: string, published: boolean) {
    await this.ensureLoaded();
    const exam = this.exams.get(examId);
    if (!exam) throw new NotFoundException("Không tìm thấy đề trên máy chủ.");
    if (user.role === "teacher" ? exam.ownerId !== user.id : user.role !== "school" && user.role !== "admin") throw new ForbiddenException("Bạn không có quyền sửa đề này.");
    if (published && exam.audience === "student" && !exam.targetStudentCodes.length) throw new BadRequestException("Đề giao riêng cần danh sách MSSV.");
    if (published && exam.questions.some((question) => question.type !== "essay" && !hasCorrectAnswer(question.answer))) throw new BadRequestException("Không thể xuất bản vì còn câu hỏi khách quan thiếu đáp án chuẩn.");
    exam.published = published; await this.persist(); return this.safeExam(exam, true);
  }

  @WithRuntimeTransaction()
  async startAttempt(user: MeoUser, body: Record<string, unknown>) {
    await this.ensureLoaded();
    if (user.role !== "student") throw new ForbiddenException("Chỉ sinh viên được bắt đầu lượt thi.");
    const exam = this.exams.get(typeof body.examId === "string" ? body.examId : "");
    if (!exam || !exam.published) throw new NotFoundException("Đề thi chưa được xuất bản hoặc không còn tồn tại.");
    if (exam.audience === "class" && (!user.className || user.className !== exam.className)) throw new ForbiddenException("Tài khoản này không thuộc lớp được giao đề.");
    if (exam.audience === "student" && (!user.studentCode || !exam.targetStudentCodes.some((code) => code.toLowerCase() === user.studentCode?.toLowerCase()))) throw new ForbiddenException("MSSV này không nằm trong danh sách được giao đề.");
    if (exam.audience === "public" && user.authProvider !== "google") throw new ForbiddenException("Đề mở yêu cầu tài khoản Google đã xác minh.");
    const now = Date.now();
    if (exam.opensAt && now < Date.parse(exam.opensAt)) throw new ConflictException("Đề chưa đến giờ mở.");
    if (now >= Date.parse(exam.dueAt)) throw new ConflictException("Đề đã đóng và không nhận lượt thi mới.");
    if (exam.passwordHash) {
      const failureKey = `${user.id}:${exam.id}`;
      const failure = this.passwordFailures.get(failureKey);
      if (failure && failure.expiresAt <= Date.now()) this.passwordFailures.delete(failureKey);
      else if (failure && failure.count >= 5) throw new ConflictException("Đã nhập sai mật khẩu đề nhiều lần. Hãy thử lại sau 5 phút.");
      const candidate = typeof body.accessPassword === "string" ? body.accessPassword : "";
      if (candidate.length > 100) throw new UnauthorizedException("Mật khẩu đề thi chưa chính xác.");
      const actual = scryptSync(candidate, Buffer.from(exam.passwordSalt || "", "hex"), 64);
      if (!timingSafeEqual(actual, Buffer.from(exam.passwordHash, "hex"))) {
        const current = this.passwordFailures.get(failureKey);
        this.passwordFailures.set(failureKey, { count: (current?.count || 0) + 1, expiresAt: current?.expiresAt || Date.now() + 5 * 60_000 });
        await this.persist();
        throw new UnauthorizedException("Mật khẩu đề thi chưa chính xác.");
      }
      this.passwordFailures.delete(failureKey);
    }
    const old = [...this.attempts.values()].filter((attempt) => attempt.examId === exam.id && attempt.studentId === user.id);
    const active = old.find((attempt) => attempt.status === "in_progress");
    const resumeToken = typeof body.resumeToken === "string" ? body.resumeToken : "";
    if (active) {
      if (resumeToken && digest(resumeToken) === active.tokenHash) return this.sessionPayload(active, exam, resumeToken);
      throw new ConflictException("Bạn đang có một lượt thi chưa nộp trên tài khoản này.");
    }
    if (old.length >= exam.attemptsAllowed) throw new ConflictException("Bạn đã dùng hết số lượt thi được phép.");
    const selected = this.selectQuestions(exam);
    const token = randomBytes(32).toString("base64url");
    const startedAt = new Date(now).toISOString();
    const candidateDetails = this.candidateDetails(body.candidateDetails, exam.candidateFields);
    const missingField = exam.candidateFields.find((field) => !candidateDetails[field]);
    if (missingField) throw new BadRequestException(`Vui lòng khai báo trường bắt buộc: ${missingField}.`);
    const attempt: StoredAttempt = {
      id: randomUUID(), examId: exam.id, studentId: user.id, studentName: user.fullName, studentCode: user.studentCode, major: user.major, email: user.email,
      candidateDetails, attemptNo: old.length + 1, questionIds: selected.map((question) => question.id),
      status: "in_progress", startedAt, deadlineAt: new Date(now + exam.durationMinutes * 60_000).toISOString(), lastSeenAt: startedAt, answers: {}, integrityEvents: [],
      strictIntegrity: exam.strictIntegrity, fullscreenUsed: body.fullscreenUsed === true, isFocused: true, isFullscreen: body.fullscreenUsed === true, integrityAutoSubmitted: false, tokenHash: digest(token),
    };
    this.attempts.set(attempt.id, attempt); await this.persist(); return this.sessionPayload(attempt, exam, token);
  }

  @WithRuntimeTransaction()
  async getAttempt(user: MeoUser, id: string, token?: string) {
    await this.ensureLoaded();
    const attempt = this.attempts.get(id);
    if (!attempt) throw new NotFoundException("Không tìm thấy lượt thi.");
    const exam = this.exams.get(attempt.examId);
    if (!exam) throw new NotFoundException("Không tìm thấy đề thi.");
    const student = user.id === attempt.studentId;
    if (student) this.requireToken(attempt, token);
    else if (!(user.role === "teacher" && exam.ownerId === user.id) && user.role !== "school" && user.role !== "admin") throw new ForbiddenException("Bạn không có quyền xem lượt thi này.");
    if (this.expireIfDue(attempt)) await this.persist();
    return { attempt: this.publicAttempt(attempt, true, !student || this.scoreIsReleased(exam, attempt)), exam: this.safeExam(exam, !student, !student) };
  }

  @WithRuntimeTransaction()
  async saveAnswer(user: MeoUser, id: string, body: Record<string, unknown>) {
    await this.ensureLoaded();
    const attempt = this.studentAttempt(user, id, body.token);
    if (attempt.status !== "in_progress") throw new ConflictException("Lượt thi đã kết thúc.");
    if (Date.now() >= Date.parse(attempt.deadlineAt)) { const exam = this.exams.get(attempt.examId); if (exam) this.finish(attempt, exam, "time-limit"); await this.persist(); throw new ConflictException("Đã hết giờ làm bài."); }
    const questionId = typeof body.questionId === "string" ? body.questionId : "";
    if (!attempt.questionIds.includes(questionId)) throw new BadRequestException("Câu hỏi không thuộc lượt thi này.");
    const sequence = Number(body.sequence);
    if (!Number.isSafeInteger(sequence) || sequence < 1) throw new BadRequestException("Số thứ tự lưu câu trả lời không hợp lệ.");
    const previous = attempt.answers[questionId];
    if (!previous || sequence > previous.sequence) attempt.answers[questionId] = { value: this.answerValue(body.answer), sequence, savedAt: new Date().toISOString() };
    attempt.lastSeenAt = new Date().toISOString(); await this.persist();
    return { ok: true, savedAt: attempt.answers[questionId].savedAt };
  }

  @WithRuntimeTransaction()
  async heartbeat(user: MeoUser, id: string, body: Record<string, unknown>) {
    await this.ensureLoaded();
    const attempt = this.studentAttempt(user, id, body.token);
    if (attempt.status === "in_progress" && Date.now() >= Date.parse(attempt.deadlineAt)) { const exam = this.exams.get(attempt.examId); if (exam) this.finish(attempt, exam, "time-limit"); }
    if (attempt.status === "in_progress") { attempt.lastSeenAt = new Date().toISOString(); attempt.isFocused = body.isFocused !== false; attempt.isFullscreen = body.isFullscreen === true; }
    await this.persist();
    return { ok: true, status: attempt.status, deadlineAt: attempt.deadlineAt, strikeCount: countStrikes(attempt.integrityEvents) };
  }

  @WithRuntimeTransaction()
  async recordEvent(user: MeoUser, id: string, body: Record<string, unknown>) {
    await this.ensureLoaded();
    const attempt = this.studentAttempt(user, id, body.token);
    if (attempt.status === "in_progress" && Date.now() >= Date.parse(attempt.deadlineAt)) { const exam = this.exams.get(attempt.examId); if (exam) this.finish(attempt, exam, "time-limit"); await this.persist(); return { status: attempt.status, strikeCount: countStrikes(attempt.integrityEvents) }; }
    if (attempt.status !== "in_progress") return { status: attempt.status, strikeCount: countStrikes(attempt.integrityEvents) };
    const kind = typeof body.kind === "string" ? body.kind : "";
    if (!eventKinds.has(kind)) throw new BadRequestException("Loại tín hiệu giám sát không hợp lệ.");
    if (attempt.integrityEvents.length >= 300) throw new ConflictException("Nhật ký giám sát đã đạt giới hạn.");
    const now = new Date();
    const last = attempt.integrityEvents[attempt.integrityEvents.length - 1];
    if (["copy-attempt", "cut-attempt", "paste-attempt", "print-attempt"].includes(kind) && last?.kind === kind && now.getTime() - Date.parse(last.at) < 1200) return { status: attempt.status, strikeCount: countStrikes(attempt.integrityEvents) };
    attempt.integrityEvents.push({ kind, at: now.toISOString(), clientAt: typeof body.clientAt === "string" ? body.clientAt.slice(0, 40) : undefined });
    attempt.lastSeenAt = now.toISOString();
    if (attempt.strictIntegrity && countStrikes(attempt.integrityEvents) >= 3) this.finish(attempt, this.exams.get(attempt.examId)!, "integrity-threshold");
    await this.persist();
    return { status: attempt.status, strikeCount: countStrikes(attempt.integrityEvents) };
  }

  @WithRuntimeTransaction()
  async submitAttempt(user: MeoUser, id: string, body: Record<string, unknown>) {
    await this.ensureLoaded();
    const attempt = this.studentAttempt(user, id, body.token);
    const exam = this.exams.get(attempt.examId)!;
    const expired = attempt.status === "in_progress" && Date.now() >= Date.parse(attempt.deadlineAt);
    if (attempt.status === "in_progress" && !expired && body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)) {
      const answers = body.answers as Record<string, unknown>;
      for (const qid of attempt.questionIds) if (qid in answers) attempt.answers[qid] = { value: this.answerValue(answers[qid]), sequence: Number.MAX_SAFE_INTEGER, savedAt: new Date().toISOString() };
    }
    if (attempt.status === "in_progress") {
      this.finish(attempt, exam, expired ? "time-limit" : "student");
      await this.persist();
    }
    return { attempt: this.publicAttempt(attempt, false, this.scoreIsReleased(exam, attempt)) };
  }

  @WithRuntimeTransaction()
  async gradeAttempt(user: MeoUser, id: string, body: Record<string, unknown>) {
    await this.ensureLoaded();
    const attempt = this.attempts.get(id);
    if (!attempt) throw new NotFoundException("Không tìm thấy lượt thi.");
    const exam = this.exams.get(attempt.examId);
    if (!exam) throw new NotFoundException("Không tìm thấy đề thi.");
    if (!(user.role === "teacher" && exam.ownerId === user.id) && user.role !== "school" && user.role !== "admin") throw new ForbiddenException("Bạn không có quyền chấm lượt thi này.");
    if (attempt.status === "in_progress") throw new ConflictException("Chỉ chấm được lượt thi đã nộp.");
    const scores = body.scores && typeof body.scores === "object" && !Array.isArray(body.scores) ? body.scores as Record<string, unknown> : {};
    const feedback = body.feedback && typeof body.feedback === "object" && !Array.isArray(body.feedback) ? body.feedback as Record<string, unknown> : {};
    const essayQuestions = exam.questions.filter((question) => question.type === "essay" && attempt.questionIds.includes(question.id));
    const nextScores: Record<string, number> = {};
    const nextFeedback: Record<string, string> = {};
    for (const question of essayQuestions) {
      if (scores[question.id] !== undefined) {
        const value = Number(scores[question.id]);
        if (!Number.isFinite(value) || value < 0 || value > question.points) throw new BadRequestException("Điểm tự luận vượt thang điểm câu hỏi.");
        nextScores[question.id] = value;
      }
      const note = feedback[question.id];
      if (typeof note === "string") nextFeedback[question.id] = note.slice(0, 4000);
    }
    attempt.manualScores = nextScores;
    attempt.manualFeedback = nextFeedback;
    attempt.score = (attempt.objectiveScore || 0) + Object.values(nextScores).reduce((sum, value) => sum + value, 0);
    if (body.releaseScore === true) { attempt.scoreReleased = true; attempt.scoreReleasedAt = new Date().toISOString(); }
    await this.persist();
    return { attempt: this.publicAttempt(attempt, true, true) };
  }

  @WithRuntimeTransaction()
  async listAttempts(user: MeoUser) {
    await this.ensureLoaded();
    return [...this.attempts.values()].filter((attempt) => {
      if (user.role === "student") return attempt.studentId === user.id && attempt.status !== "in_progress";
      const exam = this.exams.get(attempt.examId);
      return Boolean(exam && (user.role === "school" || user.role === "admin" || user.role === "teacher" && exam.ownerId === user.id));
    }).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((attempt) => {
      const exam = this.exams.get(attempt.examId);
      return this.publicAttempt(attempt, true, user.role !== "student" || Boolean(exam && this.scoreIsReleased(exam, attempt)));
    });
  }

  @WithRuntimeTransaction()
  async liveAttempts(user: MeoUser) {
    if (user.role !== "teacher" && user.role !== "school" && user.role !== "admin") throw new ForbiddenException("Chỉ giảng viên hoặc nhà trường được theo dõi phiên thi.");
    await this.ensureLoaded();
    const now = Date.now();
    let expired = false;
    for (const attempt of this.attempts.values()) if (this.expireIfDue(attempt)) expired = true;
    if (expired) await this.persist();
    return [...this.attempts.values()].filter((attempt) => {
      const exam = this.exams.get(attempt.examId);
      return attempt.status === "in_progress" && now - Date.parse(attempt.lastSeenAt) <= 90_000 && exam && (user.role !== "teacher" || exam.ownerId === user.id);
    }).map((attempt) => { const exam = this.exams.get(attempt.examId)!; return { ...this.publicAttempt(attempt, false), examTitle: exam.title, course: exam.course, className: exam.className, lastSeenAt: attempt.lastSeenAt, strikeCount: countStrikes(attempt.integrityEvents) }; });
  }

  private selectQuestions(exam: StoredExam) {
    const count = exam.randomQuestionCount || exam.questions.length;
    const random = <T>(items: T[]) => { const result = [...items]; for (let i = result.length - 1; i > 0; i--) { const j = randomBytes(4).readUInt32BE(0) % (i + 1); [result[i], result[j]] = [result[j], result[i]]; } return result; };
    if (count >= exam.questions.length) return random(exam.questions);
    if (!exam.matrixQuotas.length) return random(exam.questions).slice(0, count);
    return random(exam.matrixQuotas.flatMap((quota) => random(exam.questions.filter((question) => matrixKey(question) === quota.key)).slice(0, quota.count)));
  }

  private candidateDetails(value: unknown, allowedFields: string[]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const input = value as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const field of allowedFields) if (typeof input[field] === "string" && input[field].trim()) result[field] = input[field].trim().slice(0, 300);
    return result;
  }

  private sessionPayload(attempt: StoredAttempt, exam: StoredExam, token: string) {
    const questions = new Map(exam.questions.map((question) => [question.id, question]));
    return { attemptId: attempt.id, attemptToken: token, startedAt: attempt.startedAt, deadlineAt: attempt.deadlineAt, strikeCount: countStrikes(attempt.integrityEvents),
      questions: attempt.questionIds.map((id) => questions.get(id)).filter((question): question is ExamQuestion => Boolean(question)).map(({ answer: _answer, ...question }) => ({ ...question, answer: "" })),
      answers: Object.fromEntries(Object.entries(attempt.answers).map(([id, answer]) => [id, answer.value])), integrityEvents: attempt.integrityEvents };
  }

  private studentAttempt(user: MeoUser, id: string, token: unknown) {
    if (user.role !== "student") throw new ForbiddenException("Chỉ sinh viên được thao tác lượt thi.");
    const attempt = this.attempts.get(id);
    if (!attempt || attempt.studentId !== user.id) throw new NotFoundException("Không tìm thấy lượt thi.");
    this.requireToken(attempt, token);
    return attempt;
  }

  private requireToken(attempt: StoredAttempt, token: unknown) {
    if (typeof token !== "string" || token.length < 32 || digest(token) !== attempt.tokenHash) throw new UnauthorizedException("Phiên thi không hợp lệ hoặc đã hết hiệu lực.");
  }

  private answerValue(value: unknown): string | string[] {
    if (typeof value === "string" && value.length <= 20_000) return value;
    if (Array.isArray(value) && value.length <= 20 && value.every((item) => typeof item === "string" && item.length <= 2000)) return value as string[];
    throw new BadRequestException("Câu trả lời không hợp lệ hoặc vượt giới hạn.");
  }

  private finish(attempt: StoredAttempt, exam: StoredExam, reason: "student" | "time-limit" | "integrity-threshold") {
    if (attempt.status !== "in_progress") return;
    const selected = new Set(attempt.questionIds);
    const questions = exam.questions.filter((question) => selected.has(question.id));
    attempt.objectiveScore = questions.reduce((sum, question) => question.type === "essay" ? sum : normalized(attempt.answers[question.id]?.value ?? "") === normalized(question.answer) ? sum + question.points : sum, 0);
    attempt.score = attempt.objectiveScore;
    attempt.totalPoints = questions.reduce((sum, question) => sum + question.points, 0);
    attempt.status = reason === "time-limit" ? "expired" : "submitted";
    attempt.submittedAt = new Date().toISOString();
    attempt.submissionReason = reason;
    attempt.integrityAutoSubmitted = reason === "integrity-threshold";
  }

  private scoreIsReleased(exam: StoredExam, attempt: StoredAttempt) {
    if (exam.showScore === "teacher-release") return attempt.scoreReleased === true;
    if (exam.showScore === "after-window") return Date.now() >= Date.parse(exam.dueAt) + exam.durationMinutes * 60_000;
    return true;
  }

  private expireIfDue(attempt: StoredAttempt) {
    if (attempt.status !== "in_progress" || Date.now() < Date.parse(attempt.deadlineAt)) return false;
    const exam = this.exams.get(attempt.examId);
    if (!exam) return false;
    this.finish(attempt, exam, "time-limit");
    return true;
  }

  private publicAttempt(attempt: StoredAttempt, includeAnswers: boolean, includeScore = true) {
    const { tokenHash: _token, answers, score, objectiveScore, totalPoints, manualScores, manualFeedback, ...result } = attempt;
    return { ...result, serverAttemptId: attempt.id, score: includeScore ? score : undefined, objectiveScore: includeScore ? objectiveScore : undefined,
      totalPoints: includeScore ? totalPoints : undefined, manualScores: includeScore ? manualScores : undefined, manualFeedback: includeScore ? manualFeedback : undefined,
      answers: includeAnswers ? Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, answer.value])) : undefined };
  }
}
