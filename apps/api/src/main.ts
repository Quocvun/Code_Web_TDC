import "reflect-metadata";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { BadRequestException, Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Headers, HttpException, Inject, Injectable, Module, NotFoundException, Param, Post, Req, Res, ServiceUnavailableException, StreamableFile, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { demoAccounts, demoPassword, getMajorCatalog, majors, type MeoUser } from "./catalog";
import { CloudflareDatabaseService } from "./cloudflare-database.service";
import { hasCloudflareDatabase } from "./cloudflare-runtime";
import { ExamRuntimeService } from "./exam-runtime.service";
import { DatabaseService, type LearningAssignmentRecord, type LearningCourseRecord, type LearningSubmissionRecord, type PersistedRosterAccount, type PersistedSubmissionFile } from "./database.service";
import { ObjectStorageService } from "./object-storage.service";
import { FileScannerService } from "./file-scanner.service";

function loadPrivateEnvironment() {
  for (const filename of new Set([resolve(__dirname, "../.env"), resolve(__dirname, "../../../.env"), resolve(process.cwd(), ".env")])) {
    try {
      const contents = readFileSync(filename, "utf8");
      for (const line of contents.split(/\r?\n/)) {
        const match = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
        if (!match || process.env[match[1]] !== undefined) continue;
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        process.env[match[1]] = value;
      }
    } catch {
      // Local environment files are optional; production values come from the host.
    }
  }
}

if (process.env.CLOUDFLARE_WORKERS !== "true") loadPrivateEnvironment();

const isCloudflareWorker = () => process.env.CLOUDFLARE_WORKERS === "true" || hasCloudflareDatabase();
const isCloudflareDemo = () => isCloudflareWorker() && process.env.MEOTDC_DEMO_MODE === "true";
const enforceProductionAccessControls = () => process.env.NODE_ENV === "production" && !isCloudflareDemo();

function productionConfigurationError(message: string): never {
  throw new Error(`Cấu hình production chưa an toàn: ${message}`);
}

function validateProductionConfiguration() {
  if (process.env.NODE_ENV !== "production") return;

  if (!isCloudflareDemo()) {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || "";
    if (!clientId.endsWith(".apps.googleusercontent.com") || clientId.includes("YOUR_")) productionConfigurationError("hãy đặt GOOGLE_CLIENT_ID thật.");
    const adminEmail = process.env.MEOTDC_ADMIN_EMAIL?.trim() || "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || adminEmail.includes("YOUR_")) productionConfigurationError("hãy đặt MEOTDC_ADMIN_EMAIL thật của quản trị viên.");
  }

  if (isCloudflareWorker()) {
    if (!hasCloudflareDatabase()) productionConfigurationError("hãy gắn binding D1 tên DB cho Cloudflare Worker.");
  } else {
    const databaseUrl = process.env.DATABASE_URL?.trim() || "";
    let databasePassword = "";
    try { databasePassword = new URL(databaseUrl).password; } catch { productionConfigurationError("DATABASE_URL không hợp lệ."); }
    if (decodeURIComponent(databasePassword).length < 24 || /^(replace|change|your|example|demo|meotdc|password)/i.test(decodeURIComponent(databasePassword))) productionConfigurationError("mật khẩu PostgreSQL phải là secret riêng dài ít nhất 24 ký tự.");
    const objectSecret = process.env.S3_SECRET_KEY?.trim() || "";
    if (objectSecret.length < 24 || /^(replace|change|your|example|demo|meotdc|password)/i.test(objectSecret)) productionConfigurationError("S3_SECRET_KEY phải là secret riêng dài ít nhất 24 ký tự.");
    if (process.env.FILE_SCAN_REQUIRED !== "true" || !process.env.CLAMAV_HOST?.trim()) productionConfigurationError("cần FILE_SCAN_REQUIRED=true và CLAMAV_HOST.");
  }

  const domains = (process.env.MEOTDC_DOMAINS || process.env.MEOTDC_DOMAIN || "localhost").split(",").map((value) => value.trim()).filter(Boolean);
  if (!domains.length) productionConfigurationError("hãy khai báo MEOTDC_DOMAINS.");
  const domainHosts = new Set<string>();
  for (const domain of domains) {
    try {
      const parsed = new URL(`https://${domain}`);
      if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) productionConfigurationError(`tên miền không hợp lệ trong MEOTDC_DOMAINS: ${domain}`);
      domainHosts.add(parsed.hostname.toLowerCase());
    } catch { productionConfigurationError(`tên miền không hợp lệ trong MEOTDC_DOMAINS: ${domain}`); }
  }

  const rawOrigins = process.env.MEOTDC_WEB_ORIGINS || process.env.MEOTDC_WEB_ORIGIN || "http://localhost:3000";
  const origins = rawOrigins.split(",").map((value) => value.trim()).filter(Boolean);
  if (!origins.length) productionConfigurationError("hãy khai báo MEOTDC_WEB_ORIGINS.");
  for (const origin of origins) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { productionConfigurationError(`origin không hợp lệ: ${origin}`); }
    if (parsed.origin !== origin || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) productionConfigurationError(`chỉ chấp nhận origin đầy đủ, không có đường dẫn: ${origin}`);
    const hostname = parsed.hostname.toLowerCase();
    const localHost = hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]";
    if (parsed.protocol !== "https:" && !(localHost && parsed.protocol === "http:")) productionConfigurationError(`origin công khai phải dùng HTTPS: ${origin}`);
    if (!domainHosts.has(hostname)) productionConfigurationError(`hãy thêm host ${hostname} vào MEOTDC_DOMAINS để Caddy phục vụ đúng origin.`);
  }
}

const sessionCookieName = "meotdc_demo_session";
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const sessions = new Map<string, { user: MeoUser; expiresAt: number }>();
const loginFailures = new Map<string, { count: number; expiresAt: number }>();
const googleLoginRequests = new Map<string, { count: number; expiresAt: number }>();

type RequestLike = { headers: { cookie?: string; origin?: string; [key: string]: string | undefined }; ip?: string };
type CookieOptions = { httpOnly: boolean; secure: boolean; sameSite: "lax"; path: string; maxAge: number };
type ResponseLike = {
  cookie(name: string, value: string, options: CookieOptions): void;
  clearCookie(name: string, options: Omit<CookieOptions, "maxAge">): void;
};

type RosterDemoAccount = PersistedRosterAccount;
type UploadedMemoryFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };
type StoredAssignmentFile = PersistedSubmissionFile;
type GoogleSigningKey = { kid: string; kty: "RSA"; n: string; e: string; alg?: string; use?: string; key_ops?: string[] };
type GoogleIdTokenClaims = { sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown; aud?: unknown; azp?: unknown; iss?: unknown; exp?: unknown; iat?: unknown; nonce?: unknown };

let googleSigningKeys: GoogleSigningKey[] = [];
let googleSigningKeysExpireAt = 0;
const usedGoogleNonces = new Map<string, number>();

async function getGoogleSigningKey(kid: string) {
  if (googleSigningKeysExpireAt <= Date.now() || !googleSigningKeys.some((key) => key.kid === kid)) {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new ServiceUnavailableException("Không tải được khóa xác minh đăng nhập Google.");
    const result = await response.json() as { keys?: GoogleSigningKey[] };
    googleSigningKeys = (result.keys || []).filter((key) => key.kty === "RSA" && key.use !== "enc");
    const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] || 300);
    googleSigningKeysExpireAt = Date.now() + Math.min(maxAge, 3600) * 1000;
  }
  const key = googleSigningKeys.find((item) => item.kid === kid);
  if (!key) throw new UnauthorizedException("Token Google không được ký bằng khóa hiện hành.");
  return key;
}

async function verifyGoogleIdToken(token: string, nonce: string, clientId: string, database: DatabaseService) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new UnauthorizedException("Token Google không hợp lệ.");
  let header: { alg?: unknown; kid?: unknown };
  let claims: GoogleIdTokenClaims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as typeof header;
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as GoogleIdTokenClaims;
  } catch {
    throw new UnauthorizedException("Token Google không hợp lệ.");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new UnauthorizedException("Thuật toán ký token Google không hợp lệ.");
  const signingKey = await getGoogleSigningKey(header.kid);
  const publicKey = await crypto.subtle.importKey("jwk", signingKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const validSignature = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, Buffer.from(parts[2], "base64url"), Buffer.from(`${parts[0]}.${parts[1]}`));
  const now = Math.floor(Date.now() / 1000);
  const audiences = typeof claims.aud === "string" ? [claims.aud] : Array.isArray(claims.aud) ? claims.aud : [];
  if (!validSignature || !["accounts.google.com", "https://accounts.google.com"].includes(String(claims.iss))) throw new UnauthorizedException("Không thể xác minh tài khoản Google này.");
  if (!audiences.includes(clientId)) throw new UnauthorizedException("GOOGLE_CLIENT_ID của giao diện không khớp GOOGLE_CLIENT_ID trên API.");
  if ((claims.azp !== undefined && claims.azp !== clientId) || (audiences.length > 1 && claims.azp !== clientId)) throw new UnauthorizedException("Ứng dụng gửi token Google không đúng client đã cấu hình.");
  if (typeof claims.exp !== "number" || claims.exp <= now || typeof claims.iat !== "number" || claims.iat > now + 60 || now - claims.iat > 3600) throw new UnauthorizedException("Token Google đã hết hạn hoặc chưa có hiệu lực.");
  if (claims.nonce !== nonce) throw new UnauthorizedException("Phiên đăng nhập Google không khớp hoặc đã được dùng. Hãy thử lại.");
  if (typeof claims.sub !== "string" || !claims.sub || typeof claims.email !== "string" || !claims.email.includes("@") || !(claims.email_verified === true || claims.email_verified === "true")) throw new UnauthorizedException("Google chưa xác minh địa chỉ email này.");
  if (database.enabled) {
    if (!(await database.consumeGoogleNonce(nonce, claims.exp * 1000))) throw new UnauthorizedException("Phiên đăng nhập Google không khớp hoặc đã được dùng. Hãy thử lại.");
  } else {
    if (usedGoogleNonces.has(nonce)) throw new UnauthorizedException("Phiên đăng nhập Google không khớp hoặc đã được dùng. Hãy thử lại.");
    for (const [usedNonce, expiresAt] of usedGoogleNonces) if (expiresAt <= Date.now()) usedGoogleNonces.delete(usedNonce);
    usedGoogleNonces.set(nonce, claims.exp * 1000);
  }
  return { subject: claims.sub, email: claims.email.trim().toLowerCase(), fullName: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 120) : claims.email.split("@")[0] };
}

function hashRosterPassword(password: string, salt: Buffer) {
  return scryptSync(password, salt, 64);
}

function authFailureKey(request: RequestLike, identifier: string) {
  return `${request.ip || "unknown"}:${identifier}`;
}

async function checkAuthFailureLimit(key: string, database: DatabaseService) {
  if (database.enabled) {
    if ((await database.getRateLimitCount(key) || 0) >= 10) throw new HttpException("Đăng nhập sai quá nhiều lần. Hãy thử lại sau 15 phút.", 429);
    return;
  }
  const now = Date.now();
  for (const [storedKey, value] of loginFailures) if (value.expiresAt <= now) loginFailures.delete(storedKey);
  if ((loginFailures.get(key)?.count || 0) >= 10) throw new HttpException("Đăng nhập sai quá nhiều lần. Hãy thử lại sau 15 phút.", 429);
}

async function recordAuthFailure(key: string, database: DatabaseService) {
  if (database.enabled) { await database.incrementRateLimit(key, 15 * 60 * 1000); return; }
  const previous = loginFailures.get(key);
  loginFailures.set(key, { count: (previous?.count || 0) + 1, expiresAt: previous?.expiresAt || Date.now() + 15 * 60 * 1000 });
  if (loginFailures.size > 5000) {
    const oldestKey = loginFailures.keys().next().value;
    if (oldestKey) loginFailures.delete(oldestKey);
  }
}

async function clearAuthFailures(key: string, database: DatabaseService) {
  if (database.enabled) { await database.clearRateLimit(key); return; }
  loginFailures.delete(key);
}

async function checkGoogleLoginRate(request: RequestLike, database: DatabaseService) {
  if (database.enabled) {
    if (!(await database.checkRateLimit(`google:${request.ip || "unknown"}`, 300, 60_000))) throw new HttpException("Có quá nhiều yêu cầu đăng nhập Google. Vui lòng thử lại sau một phút.", 429);
    return;
  }
  const key = request.ip || "unknown";
  const now = Date.now();
  for (const [storedKey, value] of googleLoginRequests) if (value.expiresAt <= now) googleLoginRequests.delete(storedKey);
  const current = googleLoginRequests.get(key);
  if (current && current.count >= 300) throw new HttpException("Có quá nhiều yêu cầu đăng nhập Google. Vui lòng thử lại sau một phút.", 429);
  googleLoginRequests.set(key, current && current.expiresAt > now ? { count: current.count + 1, expiresAt: current.expiresAt } : { count: 1, expiresAt: now + 60_000 });
}

function readSessionId(request: RequestLike) {
  const cookie = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookieName}=`));
  return cookie ? decodeURIComponent(cookie.slice(sessionCookieName.length + 1)) : "";
}

function sessionHash(sessionId: string) { return createHash("sha256").update(sessionId).digest("hex"); }

async function getSession(request: RequestLike, database: DatabaseService) {
  const id = readSessionId(request);
  const key = sessionHash(id);
  const session = database.enabled ? await database.getSession(key) : sessions.get(key);
  if (!session || session.expiresAt <= Date.now()) { sessions.delete(key); if (database.enabled) await database.deleteSession(key); return null; }
  return { key, ...session };
}

async function requireAuthenticatedSession(request: RequestLike, database: DatabaseService) {
  const session = await getSession(request, database);
  if (!session) throw new UnauthorizedException("Hãy đăng nhập để tiếp tục.");
  return session.user;
}

async function requireStudentSession(request: RequestLike, database: DatabaseService) {
  const user = await requireAuthenticatedSession(request, database);
  if (user.role !== "student") throw new ForbiddenException("Chỉ sinh viên mới được nộp tệp bài tập.");
  return user;
}

function uploadContentType(extension: string, buffer: Buffer) {
  const starts = (signature: string) => buffer.subarray(0, signature.length / 2).equals(Buffer.from(signature, "hex"));
  if (extension === ".pdf" && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if ((extension === ".docx" || extension === ".zip") && starts("504b0304")) return extension === ".docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/zip";
  if (extension === ".doc" && starts("d0cf11e0a1b11ae1")) return "application/msword";
  if (extension === ".png" && starts("89504e470d0a1a0a")) return "image/png";
  if ((extension === ".jpg" || extension === ".jpeg") && starts("ffd8ff")) return "image/jpeg";
  return "";
}

async function requireInstitutionSession(request: RequestLike, database: DatabaseService) {
  const session = await getSession(request, database);
  if (!session) {
    throw new ForbiddenException("Hãy đăng nhập lại với tài khoản nhà trường hoặc quản trị viên.");
  }
  if (session.user.role !== "school" && session.user.role !== "admin") {
    throw new ForbiddenException("Chỉ nhà trường hoặc quản trị viên được cấp tài khoản sinh viên demo.");
  }
  return session.user;
}

@Injectable()
class StudentSubmissionUploadGuard implements CanActivate {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext) {
    await requireStudentSession(context.switchToHttp().getRequest<RequestLike>(), this.database);
    return true;
  }
}

@Controller("api/v1")
class AppController {

  private readonly rosterAccounts = new Map<string, RosterDemoAccount>();
  private readonly submissionFiles = new Map<string, StoredAssignmentFile>();
  private readonly learningAssignments = new Map<string, LearningAssignmentRecord>();
  private readonly learningCourses = new Map<string, LearningCourseRecord>();
  private readonly courseProgress = new Map<string, { completedLessons: string[]; progress: number }>();
  private readonly learningSubmissions = new Map<string, LearningSubmissionRecord>();
  private submissionFilesReady: Promise<void> | null = null;

  constructor(private readonly examRuntime: ExamRuntimeService, @Inject(DatabaseService) private readonly database: DatabaseService, private readonly objectStorage: ObjectStorageService, private readonly fileScanner: FileScannerService) {}

  private getSubmissionDirectory() { return resolve(process.env.MEOTDC_UPLOADS_DIR || join(process.cwd(), "data", "assignment-submissions")); }

  private async allLearningAssignments() {
    return this.database.enabled ? this.database.listLearningAssignments() : [...this.learningAssignments.values()];
  }

  private async allLearningCourses() {
    return this.database.enabled ? this.database.listLearningCourses() : [...this.learningCourses.values()];
  }

  private async getLearningAssignment(id: string) {
    return this.database.enabled ? this.database.getLearningAssignment(id) : this.learningAssignments.get(id) || null;
  }

  private teacherHasClassAccess(user: MeoUser, className: string) {
    if (!enforceProductionAccessControls() || user.role !== "teacher") return true;
    const email = user.email?.trim().toLowerCase();
    if (!email || !className.trim()) return false;
    return (process.env.MEOTDC_TEACHER_CLASS_ASSIGNMENTS || "").split(";").some((entry) => {
      const separator = entry.indexOf("=");
      if (separator < 1 || entry.slice(0, separator).trim().toLowerCase() !== email) return false;
      return entry.slice(separator + 1).split("|").some((code) => code.trim() === className.trim());
    });
  }

  private assertTeacherClassAccess(user: MeoUser, className: string) {
    if (!this.teacherHasClassAccess(user, className)) throw new ForbiddenException("Giảng viên chưa được gán quyền trên lớp này.");
  }

  private async visibleExams(user: MeoUser) {
    const exams = await this.examRuntime.listExams(user);
    return user.role === "teacher" && enforceProductionAccessControls()
      ? exams.filter((exam) => this.teacherHasClassAccess(user, exam.className || ""))
      : exams;
  }

  private async visibleExamAttempts(user: MeoUser) {
    const attempts = await this.examRuntime.listAttempts(user);
    if (user.role !== "teacher" || !enforceProductionAccessControls()) return attempts;
    const examIds = new Set((await this.visibleExams(user)).map((exam) => exam.id));
    return attempts.filter((attempt) => examIds.has(attempt.examId));
  }

  private async visibleLearningAssignments(user: MeoUser) {
    const assignments = await this.allLearningAssignments();
    if (user.role === "student") return assignments.filter((assignment) => assignment.published && assignment.className === user.className);
    if (user.role === "teacher") return assignments.filter((assignment) => assignment.ownerId === user.id && this.teacherHasClassAccess(user, assignment.className));
    return assignments;
  }

  private async visibleLearningCourses(user: MeoUser) {
    const courses = await this.allLearningCourses();
    if (user.role === "student") return courses.filter((course) => course.className === user.className || course.className === "Toàn trường (mô phỏng)");
    if (user.role === "teacher") return courses.filter((course) => course.ownerId === user.id && this.teacherHasClassAccess(user, course.className));
    return courses;
  }

  @Get("courses")
  async listLearningCourses(@Req() request: RequestLike) {
    const user = await requireAuthenticatedSession(request, this.database);
    const courses = await this.visibleLearningCourses(user);
    return Promise.all(courses.map(async (course) => {
      const progress = user.role === "student"
        ? this.database.enabled
          ? await this.database.getLearningCourseProgress(course.id, user.id)
          : this.courseProgress.get(`${course.id}:${user.id}`) || { completedLessons: [], progress: 0 }
        : { completedLessons: [], progress: 0 };
      const totalLessons = course.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0);
      const completedLessons = user.role === "student" ? progress.completedLessons.filter((id) => {
        const match = /^(\d+)-(\d+)$/.exec(id);
        return Boolean(match && course.chapters[Number(match[1])]?.lessons[Number(match[2])]);
      }) : [];
      return { id: course.id, title: course.title, code: course.code, className: course.className, chapters: course.chapters, progress: totalLessons ? Math.round(completedLessons.length * 100 / totalLessons) : 0, completedLessons, serverBacked: true };
    }));
  }

  @Post("courses")
  async saveLearningCourse(@Req() request: RequestLike, @Body() body: Record<string, unknown>) {
    const user = await requireAuthenticatedSession(request, this.database);
    if (user.role !== "teacher" && user.role !== "admin") throw new ForbiddenException("Chỉ giảng viên hoặc quản trị viên được chỉnh sửa nội dung khóa học.");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("Thông tin khóa học không hợp lệ.");
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const className = typeof body.className === "string" ? body.className.trim() : "";
    const chapters = body.chapters;
    if (!/^[a-z0-9-]{1,160}$/i.test(id) || !title || title.length > 180 || !code || code.length > 80 || !className || className.length > 80) throw new BadRequestException("Mã, tên, học phần hoặc lớp khóa học chưa hợp lệ.");
    if (!Array.isArray(chapters) || chapters.length > 100 || chapters.some((chapter) => !chapter || typeof chapter !== "object" || typeof chapter.title !== "string" || chapter.title.length > 180 || !Array.isArray(chapter.lessons) || chapter.lessons.length > 300 || chapter.lessons.some((lesson: unknown) => !lesson || typeof lesson !== "object" || typeof (lesson as Record<string, unknown>).title !== "string" || String((lesson as Record<string, unknown>).title).length > 180 || typeof (lesson as Record<string, unknown>).duration !== "string" || String((lesson as Record<string, unknown>).duration).length > 60 || ((lesson as Record<string, unknown>).content !== undefined && (typeof (lesson as Record<string, unknown>).content !== "string" || String((lesson as Record<string, unknown>).content).length > 20_000))))) throw new BadRequestException("Nội dung chương hoặc bài học chưa hợp lệ.");
    if (Buffer.byteLength(JSON.stringify(chapters), "utf8") > 300_000) throw new BadRequestException("Nội dung khóa học vượt giới hạn 300 KB.");
    this.assertTeacherClassAccess(user, className);
    const existing = this.database.enabled ? await this.database.getLearningCourse(id) : this.learningCourses.get(id) || null;
    if (existing && user.role === "teacher" && existing.ownerId !== user.id) throw new ForbiddenException("Khóa học không thuộc phạm vi quản lý của bạn.");
    const course: LearningCourseRecord = { id, ownerId: existing?.ownerId || user.id, title, code, className, chapters: chapters as LearningCourseRecord["chapters"], createdAt: existing?.createdAt || new Date().toISOString() };
    if (this.database.enabled) {
      if (!await this.database.saveLearningCourse(course)) throw new ForbiddenException("Khóa học không thuộc phạm vi quản lý của bạn.");
    } else this.learningCourses.set(id, course);
    return { course: { id: course.id, title: course.title, code: course.code, className: course.className, chapters: course.chapters, progress: 0, completedLessons: [], serverBacked: true } };
  }

  @Post("courses/:courseId/progress")
  async markLearningLessonComplete(@Req() request: RequestLike, @Param("courseId") courseId: string, @Body() body: Record<string, unknown>) {
    const user = await requireStudentSession(request, this.database);
    const course = (await this.allLearningCourses()).find((item) => item.id === courseId);
    if (!course || (course.className !== user.className && course.className !== "Toàn trường (mô phỏng)")) throw new ForbiddenException("Khóa học không thuộc lớp của bạn.");
    const chapterIndex = Number(body?.chapterIndex);
    const lessonIndex = Number(body?.lessonIndex);
    if (!Number.isInteger(chapterIndex) || !Number.isInteger(lessonIndex) || chapterIndex < 0 || lessonIndex < 0 || !course.chapters[chapterIndex]?.lessons[lessonIndex]) throw new BadRequestException("Bài học không tồn tại trong khóa học.");
    const lessonId = `${chapterIndex}-${lessonIndex}`;
    const totalLessons = course.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0);
    if (this.database.enabled) return this.database.completeLearningCourseLesson(course.id, user.id, lessonId, totalLessons);
    const current = this.courseProgress.get(`${course.id}:${user.id}`) || { completedLessons: [], progress: 0 };
    const completedLessons = current.completedLessons.includes(lessonId) ? current.completedLessons : [...current.completedLessons, lessonId];
    const progress = totalLessons ? Math.round(completedLessons.length * 100 / totalLessons) : 0;
    const saved = { completedLessons, progress };
    this.courseProgress.set(`${course.id}:${user.id}`, saved);
    return saved;
  }

  private async submissionsForAssignments(assignments: LearningAssignmentRecord[]) {
    if (!assignments.length) return [];
    if (this.database.enabled) return this.database.listLearningSubmissions(assignments.map((assignment) => assignment.id));
    const ids = new Set(assignments.map((assignment) => assignment.id));
    return [...this.learningSubmissions.values()].filter((submission) => ids.has(submission.assignmentId));
  }

  @Get("assignments")
  async listLearningAssignments(@Req() request: RequestLike) {
    const user = await requireAuthenticatedSession(request, this.database);
    const assignments = await this.visibleLearningAssignments(user);
    const submissions = (await this.submissionsForAssignments(assignments)).filter((submission) => user.role !== "student" || submission.studentId === user.id);
    return { assignments: assignments.map(({ ownerId: _ownerId, ...assignment }) => assignment), submissions };
  }

  @Post("assignments")
  async createLearningAssignment(@Req() request: RequestLike, @Body() body: Record<string, unknown>) {
    const user = await requireAuthenticatedSession(request, this.database);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("Thông tin bài tập không hợp lệ.");
    if (!(["teacher", "school", "admin"] as string[]).includes(user.role)) throw new ForbiddenException("Chỉ giảng viên hoặc nhà trường được tạo bài tập.");
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const course = typeof body.course === "string" ? body.course.trim() : "";
    const className = typeof body.className === "string" ? body.className.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const dueAt = typeof body.dueAt === "string" ? new Date(body.dueAt) : new Date(NaN);
    const points = Number(body.points);
    if (!title || title.length > 180 || !course || course.length > 100 || !className || className.length > 80 || description.length > 10_000) throw new BadRequestException("Tên, học phần, lớp hoặc mô tả bài tập chưa hợp lệ.");
    if (!Number.isFinite(dueAt.getTime()) || !Number.isFinite(points) || points <= 0 || points > 1000) throw new BadRequestException("Hạn nộp hoặc thang điểm chưa hợp lệ.");
    if (enforceProductionAccessControls()) {
      const roster = this.database.enabled ? await this.database.listRosterAccounts() : [...this.rosterAccounts.values()];
      if (!roster.some((account) => account.user.className === className)) throw new BadRequestException("Lớp chưa có trong roster của trường.");
    }
    this.assertTeacherClassAccess(user, className);
    const assignment: LearningAssignmentRecord = { id: `task-${randomUUID()}`, ownerId: user.id, title, course, className, description, dueAt: dueAt.toISOString(), points, published: body.published === true, createdAt: new Date().toISOString() };
    if (this.database.enabled) await this.database.saveLearningAssignment(assignment);
    else this.learningAssignments.set(assignment.id, assignment);
    const { ownerId: _ownerId, ...publicAssignment } = assignment;
    return { assignment: publicAssignment };
  }

  @Post("assignments/:assignmentId/submissions")
  async submitLearningAssignment(@Req() request: RequestLike, @Param("assignmentId") assignmentId: string, @Body() body: Record<string, unknown>) {
    const user = await requireStudentSession(request, this.database);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("Nội dung bài nộp không hợp lệ.");
    const assignment = await this.getLearningAssignment(assignmentId);
    if (!assignment || !assignment.published || assignment.className !== user.className) throw new ForbiddenException("Bài tập không được giao cho lớp của bạn.");
    if (Date.parse(assignment.dueAt) < Date.now()) throw new ForbiddenException("Đã hết hạn nộp bài.");
    const response = typeof body?.response === "string" ? body.response.trim() : "";
    if (response.length > 20_000) throw new BadRequestException("Nội dung bài nộp vượt quá 20.000 ký tự.");
    await this.loadSubmissionFiles();
    const fileId = typeof body?.fileId === "string" ? body.fileId : "";
    let file: StoredAssignmentFile | PersistedSubmissionFile | null = null;
    if (fileId) {
      if (!/^[0-9a-f-]{36}$/i.test(fileId)) throw new BadRequestException("Mã tệp bài nộp không hợp lệ.");
      file = this.database.enabled ? await this.database.getSubmissionFile(fileId) : this.submissionFiles.get(fileId) || null;
      if (!file || file.assignmentId !== assignment.id || file.ownerId !== user.id) throw new ForbiddenException("Tệp không thuộc bài tập hoặc tài khoản hiện tại.");
    }
    if (!response && !fileId) throw new BadRequestException("Hãy nhập nội dung hoặc đính kèm tệp trước khi nộp.");
    const existing = (await this.submissionsForAssignments([assignment])).find((submission) => submission.studentId === user.id);
    if (existing?.status === "graded") throw new ForbiddenException("Bài đã được chấm và không thể nộp lại.");
    const submission: LearningSubmissionRecord = {
      id: existing?.id || `submission-${randomUUID()}`,
      assignmentId: assignment.id,
      studentId: user.id,
      studentName: user.fullName,
      response,
      fileId: file?.fileId || existing?.fileId,
      fileName: file?.originalName || existing?.fileName,
      fileSize: file?.size || existing?.fileSize,
      submittedAt: new Date().toISOString(),
      status: "submitted",
    };
    const saved = this.database.enabled ? await this.database.saveLearningSubmission(submission) : submission;
    if (!this.database.enabled) this.learningSubmissions.set(`${assignment.id}:${user.id}`, saved);
    return { submission: saved };
  }

  @Post("assignments/:assignmentId/submissions/:submissionId/grade")
  async gradeLearningAssignment(@Req() request: RequestLike, @Param("assignmentId") assignmentId: string, @Param("submissionId") submissionId: string, @Body() body: Record<string, unknown>) {
    const user = await requireAuthenticatedSession(request, this.database);
    if (!(["teacher", "school", "admin"] as string[]).includes(user.role)) throw new ForbiddenException("Chỉ giảng viên hoặc nhà trường được chấm bài.");
    const assignment = await this.getLearningAssignment(assignmentId);
    if (!assignment || user.role === "teacher" && assignment.ownerId !== user.id) throw new ForbiddenException("Bài tập không thuộc phạm vi quản lý của bạn.");
    const submission = (await this.submissionsForAssignments([assignment])).find((item) => item.id === submissionId);
    if (!submission) throw new NotFoundException("Không tìm thấy bài nộp.");
    const score = Number(body?.score);
    const status = body?.status;
    const feedback = typeof body?.feedback === "string" ? body.feedback.trim().slice(0, 4000) : "";
    if (!Number.isFinite(score) || score < 0 || score > assignment.points || (status !== "graded" && status !== "revision")) throw new BadRequestException("Điểm hoặc trạng thái chấm chưa hợp lệ.");
    const gradeStatus = status as "graded" | "revision";
    const saved = this.database.enabled
      ? await this.database.gradeLearningSubmission(submission.id, score, feedback, gradeStatus)
      : { ...submission, score, feedback, status: gradeStatus };
    if (!saved) throw new NotFoundException("Không tìm thấy bài nộp.");
    if (!this.database.enabled) this.learningSubmissions.set(`${assignment.id}:${submission.studentId}`, saved);
    return { submission: saved };
  }

  private async loadSubmissionFiles() {
    if (this.database.enabled) return;
    if (!this.submissionFilesReady) this.submissionFilesReady = (async () => {
      const directory = this.getSubmissionDirectory();
      let entries: string[];
      try { entries = await readdir(directory); } catch { return; }
      for (const entry of entries.filter((name) => name.endsWith(".json"))) {
        try {
          const record = JSON.parse(await readFile(join(directory, entry), "utf8")) as StoredAssignmentFile;
          if (/^[0-9a-f-]{36}$/.test(record.fileId) && entry === record.fileId + ".json" && record.storedName === record.fileId + extname(record.originalName) && /^[a-z0-9.-]{1,180}$/i.test(record.assignmentId) && typeof record.ownerId === "string" && typeof record.contentType === "string" && Number.isInteger(record.size)) this.submissionFiles.set(record.fileId, record);
        } catch { /* Ignore malformed local metadata and keep other submissions available. */ }
      }
    })();
    await this.submissionFilesReady;
  }

  @UseGuards(StudentSubmissionUploadGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  @Post("assignments/submission-files")
  async uploadAssignmentSubmissionFile(@Req() request: RequestLike, @Body() body: Record<string, unknown>, @UploadedFile() file?: UploadedMemoryFile) {
    const user = await requireStudentSession(request, this.database);
    const assignmentId = typeof body?.assignmentId === "string" ? body.assignmentId.trim() : "";
    if (!/^[a-z0-9-]{1,160}$/i.test(assignmentId)) throw new BadRequestException("Mã bài tập không hợp lệ.");
    if (enforceProductionAccessControls()) {
      const assignment = await this.getLearningAssignment(assignmentId);
      if (!assignment || !assignment.published || assignment.className !== user.className) throw new ForbiddenException("Bài tập không được giao cho lớp của bạn.");
      if (Date.parse(assignment.dueAt) < Date.now()) throw new ForbiddenException("Đã hết hạn nộp bài.");
    }
    if (!file || !Buffer.isBuffer(file.buffer) || file.size <= 0) throw new BadRequestException("Hãy chọn một tệp để tải lên.");
    const originalName = (file.originalname.split(/[\\/]/).pop() || "bai-nop").replace(/[\r\n\\"]/g, "_").slice(0, 180);
    const extension = extname(originalName).toLowerCase();
    const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".zip"]);
    if (!allowedExtensions.has(extension)) throw new BadRequestException("Chỉ nhận PDF, DOC/DOCX, PNG/JPG hoặc ZIP.");
    const contentType = uploadContentType(extension, file.buffer);
    if (!contentType) throw new BadRequestException("Nội dung tệp không khớp với phần mở rộng được chọn.");
    await this.fileScanner.scan(file.buffer);
    const fileId = randomUUID();
    const record: StoredAssignmentFile = { fileId, assignmentId, ownerId: user.id, originalName, contentType, size: file.size, storedName: fileId + extension, createdAt: new Date().toISOString() };
    const directory = this.getSubmissionDirectory();
    if (this.objectStorage.enabled) await this.objectStorage.put(record.storedName, file.buffer, contentType);
    else {
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, record.storedName), file.buffer, { flag: "wx" });
    }
    try {
      if (this.database.enabled) await this.database.saveSubmissionFile(record);
      else await writeFile(join(directory, fileId + ".json"), JSON.stringify(record), { flag: "wx" });
    } catch (error) {
      if (this.objectStorage.enabled) await this.objectStorage.delete(record.storedName).catch(() => undefined);
      else await unlink(join(directory, record.storedName)).catch(() => undefined);
      throw error;
    }
    this.submissionFiles.set(fileId, record);
    return { fileId, fileName: originalName, size: file.size, contentType };
  }

  @Get("assignments/submission-files/:fileId")
  async downloadAssignmentSubmissionFile(@Req() request: RequestLike, @Param("fileId") fileId: string) {
    const user = await requireAuthenticatedSession(request, this.database);
    if (!/^[0-9a-f-]{36}$/.test(fileId)) throw new NotFoundException("Không tìm thấy tệp bài nộp.");
    await this.loadSubmissionFiles();
    const record = this.database.enabled ? await this.database.getSubmissionFile(fileId) : this.submissionFiles.get(fileId);
    if (!record) throw new NotFoundException("Không tìm thấy tệp bài nộp.");
    if (user.role === "student" && record.ownerId !== user.id) throw new ForbiddenException("Bạn không có quyền tải tệp bài nộp này.");
    const assignment = await this.getLearningAssignment(record.assignmentId);
    const canReviewFiles = user.role === "admin" || user.role === "school" || user.role === "teacher" && assignment?.ownerId === user.id && this.teacherHasClassAccess(user, assignment.className);
    if (user.role !== "student" && !canReviewFiles) throw new ForbiddenException("Bạn không có quyền xem tệp bài nộp này.");
    let fileBuffer: Buffer;
    try { fileBuffer = this.objectStorage.enabled ? await this.objectStorage.get(record.storedName) : await readFile(join(this.getSubmissionDirectory(), record.storedName)); } catch { throw new NotFoundException("Tệp bài nộp không còn trên máy chủ."); }
    return new StreamableFile(fileBuffer, { type: record.contentType, disposition: "attachment; filename*=UTF-8''" + encodeURIComponent(record.originalName) });
  }

  @Get("catalog/majors")
  listMajors() {
    return getMajorCatalog();
  }

  @Get("catalog/classes")
  async listAcademicClasses(@Req() request: RequestLike) {
    const user = await requireAuthenticatedSession(request, this.database);
    const known = new Map<string, { courses: Set<string>; students: Map<string, MeoUser> }>();
    const ensure = (code: string) => {
      const normalized = code.trim().slice(0, 80);
      if (!normalized) return null;
      const existing = known.get(normalized) || { courses: new Set<string>(), students: new Map<string, MeoUser>() };
      known.set(normalized, existing);
      return existing;
    };
    if (user.role === "school" || user.role === "admin" || user.role === "teacher") {
      const roster = this.database.enabled ? await this.database.listRosterAccounts() : [...this.rosterAccounts.values()];
      for (const { user: student } of roster) {
        if (!student.className || (user.role === "teacher" && !this.teacherHasClassAccess(user, student.className))) continue;
        ensure(student.className)?.students.set(student.id, student);
      }
    } else if (user.className) ensure(user.className)?.students.set(user.id, user);
    const [courses, assignments, exams] = await Promise.all([
      this.visibleLearningCourses(user),
      this.visibleLearningAssignments(user),
      this.visibleExams(user),
    ]);
    for (const course of courses) ensure(course.className)?.courses.add(course.title);
    for (const assignment of assignments) ensure(assignment.className)?.courses.add(assignment.course);
    for (const exam of exams) ensure(exam.className || "")?.courses.add(exam.course);
    if (user.role === "teacher" && enforceProductionAccessControls()) {
      const email = user.email?.trim().toLowerCase() || "";
      for (const entry of (process.env.MEOTDC_TEACHER_CLASS_ASSIGNMENTS || "").split(";")) {
        const separator = entry.indexOf("=");
        if (separator > 0 && entry.slice(0, separator).trim().toLowerCase() === email) {
          for (const code of entry.slice(separator + 1).split("|")) ensure(code);
        }
      }
    }
    return [...known.entries()].sort(([left], [right]) => left.localeCompare(right, "vi")).map(([code, details]) => {
      const students = [...details.students.values()];
      const studentCodes: Record<string, string> = {};
      const studentEmails: Record<string, string> = {};
      for (const student of students) {
        if (student.studentCode) studentCodes[student.fullName] = student.studentCode;
        if (student.email) studentEmails[student.fullName] = student.email;
      }
      return {
        id: `server-class-${encodeURIComponent(code)}`,
        code,
        name: code,
        major: students.find((student) => student.major)?.major || "",
        course: [...details.courses][0] || "Chưa gán học phần chính thức",
        teacher: user.role === "teacher" ? user.fullName : "",
        students: students.map((student) => student.fullName),
        studentCodes,
        studentEmails,
      };
    });
  }

  @Get("auth/demo-accounts")
  listDemoAccounts() {
    if (enforceProductionAccessControls()) return [];
    return demoAccounts.map(({ id, username, fullName, role, major }) => ({ id, username, fullName, role, major }));
  }

  @Get("auth/roster-accounts")
  async listRosterAccounts(@Req() request: RequestLike) {
    await requireInstitutionSession(request, this.database);
    const accounts = this.database.enabled ? await this.database.listRosterAccounts() : [...this.rosterAccounts.values()];
    return accounts.map(({ user }) => user);
  }

  @Post("auth/roster-accounts")
  async provisionRosterAccounts(@Req() request: RequestLike, @Body() body: Record<string, unknown>) {
    await requireInstitutionSession(request, this.database);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("Danh sách cấp tài khoản không hợp lệ.");
    const classCode = typeof body.classCode === "string" ? body.classCode.trim().slice(0, 80) : "";
    const students = Array.isArray(body.students) ? body.students : [];
    if (!classCode || students.length === 0 || students.length > 5000) throw new BadRequestException("Cần chọn lớp có từ 1 đến 5.000 sinh viên.");

    const rosterAccounts = this.database.enabled
      ? new Map((await this.database.listRosterAccounts()).map((account) => [account.user.username || account.user.studentCode?.toLowerCase() || account.user.id, account]))
      : this.rosterAccounts;
    const changedAccounts = new Map<string, RosterDemoAccount>();
    const submittedEmails = new Map<string, string>();
    const submittedStudentCodes = new Set<string>();
    const rosterUsernameByEmail = new Map<string, string>();
    for (const [username, account] of rosterAccounts) {
      const email = account.user.email?.trim().toLowerCase();
      if (email) rosterUsernameByEmail.set(email, username);
    }
    for (const entry of students) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const row = entry as Record<string, unknown>;
      const studentCode = typeof row.studentCode === "string" ? row.studentCode.trim().toLowerCase() : "";
      const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      if (studentCode && submittedStudentCodes.has(studentCode)) throw new BadRequestException("MSSV bị trùng trong danh sách cấp tài khoản.");
      if (studentCode) submittedStudentCodes.add(studentCode);
      if (!email) continue;
      if (submittedEmails.has(email) && submittedEmails.get(email) !== studentCode) throw new BadRequestException("Mỗi địa chỉ email chỉ được liên kết với một MSSV trong roster.");
      const existingUsername = rosterUsernameByEmail.get(email);
      if (existingUsername && existingUsername !== studentCode) throw new BadRequestException("Email này đã được liên kết với một MSSV khác.");
      submittedEmails.set(email, studentCode);
    }

    const results: { username: string; initialPassword?: string; fullName: string; studentCode: string; className: string; email?: string; status: "created" | "reset" | "already-exists" }[] = [];
    for (const entry of students) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const row = entry as Record<string, unknown>;
      const studentCode = typeof row.studentCode === "string" ? row.studentCode.trim().slice(0, 80) : "";
      const fullName = typeof row.fullName === "string" ? row.fullName.trim().slice(0, 120) : "";
      const majorName = typeof row.major === "string" ? row.major.trim() : "";
      const email = typeof row.email === "string" ? row.email.trim().toLowerCase().slice(0, 254) : "";
      const major = majors.find((item) => item.name === majorName);
      if (!studentCode || !fullName || !major || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) continue;
      const username = studentCode.toLowerCase();
      if (demoAccounts.some((account) => account.username === username)) continue;
      if (rosterAccounts.has(username)) {
        const existingAccount = rosterAccounts.get(username)!;
        const existing = existingAccount.user;
        const updatedUser: MeoUser = { ...existing, fullName, studentCode, major: major.name, majorGroup: major.group, className: classCode, ...(email ? { email } : {}) };
        if (body.resetExisting === true) {
          const initialPassword = randomBytes(9).toString("base64url");
          const salt = randomBytes(16);
          const updatedAccount = { user: updatedUser, salt, passwordHash: hashRosterPassword(initialPassword, salt) };
          rosterAccounts.set(username, updatedAccount); changedAccounts.set(username, updatedAccount);
          results.push({ username, initialPassword, fullName: updatedUser.fullName, studentCode: updatedUser.studentCode || studentCode, className: updatedUser.className || classCode, email: updatedUser.email, status: "reset" });
        } else {
          const updatedAccount = { ...existingAccount, user: updatedUser };
          rosterAccounts.set(username, updatedAccount); changedAccounts.set(username, updatedAccount);
          results.push({ username, fullName: updatedUser.fullName, studentCode: updatedUser.studentCode || studentCode, className: updatedUser.className || classCode, email: updatedUser.email, status: "already-exists" });
        }
        continue;
      }
      const initialPassword = randomBytes(9).toString("base64url");
      const salt = randomBytes(16);
      const passwordHash = hashRosterPassword(initialPassword, salt);
      const user: MeoUser = { id: `roster-${randomUUID()}`, username, fullName, role: "student", email: email || undefined, major: major.name, majorGroup: major.group, studentCode, className: classCode };
      const createdAccount = { user, salt, passwordHash };
      rosterAccounts.set(username, createdAccount); changedAccounts.set(username, createdAccount);
      results.push({ username, initialPassword, fullName, studentCode, className: classCode, email: user.email, status: "created" });
    }
    if (this.database.enabled) await this.database.saveRosterAccounts([...changedAccounts].map(([username, account]) => ({ username, account })));
    return { created: results.filter((item) => item.status === "created").length, reset: results.filter((item) => item.status === "reset").length, alreadyExists: results.filter((item) => item.status === "already-exists").length, accounts: results };
  }

  @Post("auth/login")
  async login(@Body() body: Record<string, unknown>, @Req() request: RequestLike, @Res({ passthrough: true }) response: ResponseLike) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new BadRequestException("Thông tin đăng nhập không hợp lệ.");
    }
    const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
    if (username.length > 254) throw new BadRequestException("Tên đăng nhập vượt quá giới hạn cho phép.");
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length > 256) throw new BadRequestException("Mật khẩu vượt quá giới hạn cho phép.");
    const failureKey = authFailureKey(request, username || "unknown");
    await checkAuthFailureLimit(failureKey, this.database);
    if (username === "admin" || username === "admin.demo") {
      await recordAuthFailure(failureKey, this.database);
      throw new UnauthorizedException("Tên đăng nhập hoặc mật khẩu chưa đúng.");
    }
    const account = demoAccounts.find((item) => item.username === username);
    const rosterAccount = this.database.enabled ? await this.database.getRosterAccount(username) : this.rosterAccounts.get(username);
    let user: MeoUser;
    if (account) {
      if (enforceProductionAccessControls()) throw new UnauthorizedException("Tài khoản dùng thử đã tắt ở môi trường này.");
      if (password !== demoPassword) {
        await recordAuthFailure(failureKey, this.database);
        throw new UnauthorizedException("Tên đăng nhập hoặc mật khẩu chưa đúng.");
      }
      user = account;
    } else if (rosterAccount) {
      const submittedHash = hashRosterPassword(password, rosterAccount.salt);
      if (!timingSafeEqual(submittedHash, rosterAccount.passwordHash)) {
        await recordAuthFailure(failureKey, this.database);
        throw new UnauthorizedException("Tên đăng nhập hoặc mật khẩu chưa đúng.");
      }
      user = rosterAccount.user;
    } else {
      await recordAuthFailure(failureKey, this.database);
      throw new UnauthorizedException("Tên đăng nhập hoặc mật khẩu chưa đúng.");
    }
    await clearAuthFailures(failureKey, this.database);

    if (account?.role === "student" && typeof body.major === "string") {
      const selectedMajor = majors.find((major) => major.name === body.major);
      if (!selectedMajor) throw new BadRequestException("Vui lòng chọn ngành trong danh mục TDC.");
      const className = selectedMajor.name === "Công nghệ thông tin" ? "CĐ23_TH1" : selectedMajor.name === "Thiết kế đồ họa" ? "CĐ23_TKDH1" : selectedMajor.name === "Công nghệ kỹ thuật ô tô" ? "CĐ24_OTO1" : selectedMajor.name === "Truyền thông và mạng máy tính" ? "CĐ24_MMT2" : "Toàn trường (mô phỏng)";
      user = { ...account, major: selectedMajor.name, majorGroup: selectedMajor.group, className };
    }

    const sessionId = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + sessionLifetimeMs;
    if (!this.database.enabled) sessions.set(sessionHash(sessionId), { user, expiresAt });
    await this.database.createSession(sessionHash(sessionId), user, expiresAt);
    response.cookie(sessionCookieName, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      path: "/",
      maxAge: sessionLifetimeMs,
    });
    return { user };
  }

  @Post("auth/google-login")
  async googleLogin(@Body() body: Record<string, unknown>, @Req() request: RequestLike, @Res({ passthrough: true }) response: ResponseLike) {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) throw new ServiceUnavailableException("Google OAuth chưa được cấu hình. Thêm GOOGLE_CLIENT_ID vào .env để bật đăng nhập Gmail.");
    await checkGoogleLoginRate(request, this.database);
    const credential = typeof body?.credential === "string" ? body.credential : "";
    const nonce = typeof body?.nonce === "string" ? body.nonce : "";
    if (!credential || credential.length > 10000 || nonce.length < 20 || nonce.length > 200) throw new BadRequestException("Thiếu thông tin đăng nhập Google.");
    const identity = await verifyGoogleIdToken(credential, nonce, clientId, this.database);
    const configuredAdminEmail = process.env.MEOTDC_ADMIN_EMAIL?.trim().toLowerCase();
    const isAdmin = Boolean(configuredAdminEmail && identity.email === configuredAdminEmail);
    const teacherEmails = new Set((process.env.MEOTDC_TEACHER_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
    const schoolEmails = new Set((process.env.MEOTDC_SCHOOL_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
    const isTeacher = teacherEmails.has(identity.email);
    const isSchool = schoolEmails.has(identity.email);
    if (enforceProductionAccessControls() && !configuredAdminEmail && !teacherEmails.size && !schoolEmails.size) throw new ServiceUnavailableException("Máy chủ chưa cấu hình danh sách email được phép đăng nhập Google.");
    const linkedRosterAccount = this.database.enabled
      ? await this.database.getRosterAccountByEmail(identity.email)
      : [...this.rosterAccounts.values()].find(({ user }) => user.email?.toLowerCase() === identity.email);
    if (enforceProductionAccessControls() && !isAdmin && !isTeacher && !isSchool && !linkedRosterAccount) throw new UnauthorizedException("Email này chưa được nhà trường cấp quyền hoặc liên kết roster.");
    const user: MeoUser = isAdmin ? {
      id: "system-admin",
      username: "admin",
      fullName: "Quản trị viên MeoTDC",
      role: "admin",
      authProvider: "google",
    } : isSchool ? {
      id: `google-school-${createHash("sha256").update(identity.subject).digest("hex").slice(0, 24)}`,
      username: identity.email,
      fullName: identity.fullName,
      role: "school",
      email: identity.email,
      authProvider: "google",
    } : isTeacher ? {
      id: `google-teacher-${createHash("sha256").update(identity.subject).digest("hex").slice(0, 24)}`,
      username: identity.email,
      fullName: identity.fullName,
      role: "teacher",
      email: identity.email,
      authProvider: "google",
    } : linkedRosterAccount ? { ...linkedRosterAccount.user, email: identity.email, authProvider: "google" } : {
      id: `google-${createHash("sha256").update(identity.subject).digest("hex").slice(0, 32)}`,
      username: identity.email,
      fullName: identity.fullName,
      role: "student",
      email: identity.email,
      authProvider: "google",
      className: "Toàn trường (mô phỏng)",
    };
    const sessionId = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + sessionLifetimeMs;
    if (!this.database.enabled) sessions.set(sessionHash(sessionId), { user, expiresAt });
    await this.database.createSession(sessionHash(sessionId), user, expiresAt);
    response.cookie(sessionCookieName, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      path: "/",
      maxAge: sessionLifetimeMs,
    });
    return { user, linkedToRoster: !isAdmin && Boolean(linkedRosterAccount) };
  }

  @Get("auth/me")
  async currentUser(@Req() request: RequestLike) {
    const session = await getSession(request, this.database);
    if (!session) return { user: null };
    return { user: session.user };
  }

  @Post("auth/logout")
  async logout(@Req() request: RequestLike, @Res({ passthrough: true }) response: ResponseLike) {
    const key = sessionHash(readSessionId(request));
    sessions.delete(key);
    await this.database.deleteSession(key);
    response.clearCookie(sessionCookieName, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      path: "/",
    });
    return { ok: true };
  }

  @Get("health")
  async health() {
    return { status: "ok", service: "meotdc-api", persistence: await this.database.health(), fileStorage: this.objectStorage.health(), fileScan: await this.fileScanner.health(), now: new Date().toISOString() };
  }

  @Get("overview")
  async overview(@Req() request: RequestLike) {
    const user = await requireAuthenticatedSession(request, this.database);
    const [exams, attempts, assignments] = await Promise.all([
      this.visibleExams(user),
      this.visibleExamAttempts(user),
      this.visibleLearningAssignments(user),
    ]);
    const submissions = await this.submissionsForAssignments(assignments);
    const roster = this.database.enabled ? await this.database.listRosterAccounts() : [...this.rosterAccounts.values()];
    const managedClasses = new Set([...assignments.map((item) => item.className), ...exams.map((item) => item.className)].filter(Boolean));
    if (user.role === "student" && user.className) managedClasses.add(user.className);
    const scopedRoster = roster.filter((item) => user.role === "school" || user.role === "admin" || managedClasses.has(item.user.className || ""));
    const classNames = new Set([...managedClasses, ...scopedRoster.map((item) => item.user.className || "")].filter(Boolean));
    const courses = new Set([...assignments.map((item) => item.course), ...exams.map((item) => item.course)].filter(Boolean));
    const students = new Set(scopedRoster.filter((item) => classNames.has(item.user.className || "")).map((item) => item.user.id));
    for (const attempt of attempts) students.add(attempt.studentId);
    if (user.role === "student") students.add(user.id);
    const examById = new Map(exams.map((exam) => [exam.id, exam]));
    const pendingEssayAttempts = attempts.filter((attempt) => {
      const essayQuestions = examById.get(attempt.examId)?.questions?.filter((question) => question.type === "essay") || [];
      return essayQuestions.some((question) => attempt.manualScores?.[question.id] === undefined);
    }).length;
    return {
      classes: classNames.size,
      courses: courses.size,
      students: students.size,
      openExams: exams.filter((exam) => exam.status === "Đang diễn ra").length,
      publishedExams: exams.filter((exam) => exam.published !== false).length,
      publishedAssignments: assignments.filter((assignment) => assignment.published).length,
      pendingGrading: submissions.filter((submission) => submission.status === "submitted").length + pendingEssayAttempts,
      metricsStatus: this.database.enabled ? "postgres" : "demo-memory",
      updatedAt: new Date().toISOString(),
    };
  }

  @Get("exams")
  async listExams(@Req() request: RequestLike) {
    return this.visibleExams(await requireAuthenticatedSession(request, this.database));
  }

  @Post("exams")
  async createExam(@Body() body: Record<string, unknown>, @Req() request: RequestLike) {
    const user = await requireAuthenticatedSession(request, this.database);
    if (!["teacher", "school", "admin"].includes(user.role)) throw new ForbiddenException("Chỉ giảng viên hoặc nhà trường được tạo đề.");
    if (user.role === "teacher") this.assertTeacherClassAccess(user, typeof body?.className === "string" ? body.className.trim() : "");
    const exam = await this.examRuntime.createExam(user, body);

    return exam;
  }

  @Post("exams/:examId/publish")
  async publishExam(@Req() request: RequestLike, @Param("examId") examId: string) {
    const user = await requireAuthenticatedSession(request, this.database);
    if (user.role === "teacher") {
      const exam = (await this.examRuntime.listExams(user)).find((item) => item.id === examId);
      if (exam) this.assertTeacherClassAccess(user, exam.className || "");
    }
    return this.examRuntime.setPublished(user, examId, true);
  }

  @Post("exams/:examId/unpublish")
  async unpublishExam(@Req() request: RequestLike, @Param("examId") examId: string) {
    const user = await requireAuthenticatedSession(request, this.database);
    if (user.role === "teacher") {
      const exam = (await this.examRuntime.listExams(user)).find((item) => item.id === examId);
      if (exam) this.assertTeacherClassAccess(user, exam.className || "");
    }
    return this.examRuntime.setPublished(user, examId, false);
  }

  @Get("exam-attempts/live")
  async liveExamAttempts(@Req() request: RequestLike) {
    const user = await requireAuthenticatedSession(request, this.database);
    const attempts = await this.examRuntime.liveAttempts(user);
    return user.role === "teacher" && enforceProductionAccessControls()
      ? attempts.filter((attempt) => this.teacherHasClassAccess(user, attempt.className || ""))
      : attempts;
  }

  @Get("exam-attempts")
  async listExamAttempts(@Req() request: RequestLike) {
    return this.visibleExamAttempts(await requireAuthenticatedSession(request, this.database));
  }

  @Get("exam-attempts/:attemptId")
  async getExamAttempt(@Req() request: RequestLike, @Param("attemptId") attemptId: string, @Headers("x-meotdc-attempt-token") token?: string) {
    const user = await requireAuthenticatedSession(request, this.database);
    const result = await this.examRuntime.getAttempt(user, attemptId, token);
    if (user.role === "teacher") this.assertTeacherClassAccess(user, result.exam.className || "");
    return result;
  }

  @Post("exam-attempts/start")
  async startExamAttempt(@Req() request: RequestLike, @Body() body: Record<string, unknown>) {
    return this.examRuntime.startAttempt(await requireAuthenticatedSession(request, this.database), body);
  }

  @Post("exam-attempts/:attemptId/answers")
  async saveExamAnswer(@Req() request: RequestLike, @Param("attemptId") attemptId: string, @Body() body: Record<string, unknown>) {
    return this.examRuntime.saveAnswer(await requireAuthenticatedSession(request, this.database), attemptId, body);
  }

  @Post("exam-attempts/:attemptId/heartbeat")
  async examHeartbeat(@Req() request: RequestLike, @Param("attemptId") attemptId: string, @Body() body: Record<string, unknown>) {
    return this.examRuntime.heartbeat(await requireAuthenticatedSession(request, this.database), attemptId, body);
  }

  @Post("exam-attempts/:attemptId/integrity-events")
  async recordIntegrityEvent(@Req() request: RequestLike, @Param("attemptId") attemptId: string, @Body() body: Record<string, unknown>) {
    return this.examRuntime.recordEvent(await requireAuthenticatedSession(request, this.database), attemptId, body);
  }

  @Post("exam-attempts/:attemptId/submit")
  async submitExamAttempt(@Req() request: RequestLike, @Param("attemptId") attemptId: string, @Body() body: Record<string, unknown>) {
    return this.examRuntime.submitAttempt(await requireAuthenticatedSession(request, this.database), attemptId, body);
  }

  @Post("exam-attempts/:attemptId/grade")
  async gradeExamAttempt(@Req() request: RequestLike, @Param("attemptId") attemptId: string, @Body() body: Record<string, unknown>) {
    const user = await requireAuthenticatedSession(request, this.database);
    if (user.role === "teacher") {
      const result = await this.examRuntime.getAttempt(user, attemptId);
      this.assertTeacherClassAccess(user, result.exam.className || "");
    }
    return this.examRuntime.gradeAttempt(user, attemptId, body);
  }
}

@Module({ controllers: [AppController], providers: [{ provide: DatabaseService, useClass: hasCloudflareDatabase() ? CloudflareDatabaseService : DatabaseService }, ObjectStorageService, FileScannerService, ExamRuntimeService, StudentSubmissionUploadGuard] })
class AppModule {}

async function createApplication() {
  validateProductionConfiguration();
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) app.getHttpAdapter().getInstance().set("trust proxy", trustProxyHops);
  const allowedOrigins = (process.env.MEOTDC_WEB_ORIGINS || process.env.MEOTDC_WEB_ORIGIN || "http://localhost:3000").split(",").map((origin) => origin.trim()).filter(Boolean);
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.use((request: { method: string; headers: { origin?: string; cookie?: string; host?: string } }, response: { setHeader(name: string, value: string): void; status(code: number): { json(body: unknown): void } }, next: () => void) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    response.setHeader("Cache-Control", "no-store");
    if (process.env.NODE_ENV === "production") response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    const origin = request.headers.origin;
    const changesState = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
    const hasSessionCookie = request.headers.cookie?.split(";").some((part) => part.trim().startsWith(`${sessionCookieName}=`));
    const sameOriginCloudflareRequest = isCloudflareWorker() && Boolean(origin && request.headers.host && origin === `https://${request.headers.host}`);
    if (changesState && ((origin && !allowedOrigins.includes(origin) && !sameOriginCloudflareRequest) || (!origin && hasSessionCookie))) {
      response.status(403).json({ statusCode: 403, message: "Nguồn yêu cầu không được phép." });
      return;
    }
    next();
  });
  return app;
}

export async function startCloudflareApiServer() {
  const app = await createApplication();
  await app.listen(8787, "127.0.0.1");
  return app.getHttpServer();
}

async function bootstrap() {
  const app = await createApplication();
  const port = Number(process.env.API_PORT || 4000);
  const host = process.env.API_HOST || "127.0.0.1";
  await app.listen(port, host);
  console.log(`MeoTDC API đang chạy tại http://localhost:${port}/api/v1/health`);
}

if (process.env.CLOUDFLARE_WORKERS !== "true") void bootstrap();
