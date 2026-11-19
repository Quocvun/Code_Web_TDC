"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";

type IconName = "grid" | "clipboard" | "users" | "book" | "layers" | "chart" | "settings" | "plus" | "search" | "bell" | "chevron" | "clock" | "dots" | "spark" | "arrow" | "close" | "file";
type NavKey = "Tổng quan" | "Lớp học" | "Bài kiểm tra" | "Bài tập" | "Khóa học" | "Ngân hàng câu hỏi" | "Báo cáo";
type ExamMatrixQuota = { key: string; topic: string; outcome: string; difficulty: string; count: number };
type Exam = {
  id: string;
  title: string;
  course: string;
  className: string;
  opensAt?: string;
  dueAt: string;
  questionCount: number;
  submissions: number;
  status: "Đang diễn ra" | "Sắp diễn ra" | "Đã kết thúc";
  published?: boolean;
  audience?: "class" | "student" | "public";
  targetStudentCodes?: string[];
  durationMinutes?: number;
  attemptsAllowed?: number;
  strictIntegrity?: boolean;
  shuffleQuestions?: boolean;
  randomQuestionCount?: number;
  matrixQuotas?: ExamMatrixQuota[];
  accessPassword?: string;
  accessPasswordRequired?: boolean;
  serverBacked?: boolean;
  candidateFields?: string[];
  showScore?: string;
  questions?: ExamQuestion[];
};
type QuestionDifficulty = "Nhận biết" | "Thông hiểu" | "Vận dụng" | "Vận dụng cao";
type ExamQuestion = { id: string; prompt: string; type: "single" | "multiple" | "true_false" | "short" | "essay"; options: string[]; answer: string | string[]; points: number; topic?: string; outcome?: string; difficulty?: QuestionDifficulty };
type DemoAssignment = { id: string; title: string; course: string; className: string; description: string; dueAt: string; points: number; published: boolean };
type DemoSubmission = { id: string; assignmentId: string; studentId: string; studentName: string; response: string; fileName?: string; fileId?: string; fileSize?: number; submittedAt: string; score?: number; feedback?: string; status: "submitted" | "graded" | "revision" };
type LearningData = { assignments: DemoAssignment[]; submissions: DemoSubmission[] };
type InstitutionOverview = { classes: number; courses: number; students: number; openExams: number; publishedExams: number; publishedAssignments: number; pendingGrading: number; metricsStatus: string; updatedAt: string };
type ExamIntegrityKind = "focus-loss" | "fullscreen-exit" | "copy-attempt" | "cut-attempt" | "paste-attempt" | "print-attempt" | "shortcut-attempt" | "context-menu" | "leave-attempt";
type ExamIntegrityEvent = { kind: ExamIntegrityKind; at: string };
type DemoAttempt = { id: string; examId: string; studentId: string; studentName: string; studentCode?: string; major?: string; email?: string; answers: Record<string, string | string[]>; score: number; objectiveScore?: number; totalPoints: number; submittedAt: string; manualScores?: Record<string, number>; manualFeedback?: Record<string, string>; scoreReleased?: boolean; questionIds?: string[]; candidateDetails?: Record<string, string>; integrityEvents?: ExamIntegrityEvent[]; strictIntegrity?: boolean; fullscreenUsed?: boolean; integrityAutoSubmitted?: boolean; submissionReason?: "student" | "time-limit" | "integrity-threshold" | "fullscreen-exit"; serverAttemptId?: string };
type LiveExamAttempt = { id: string; examId: string; studentName: string; studentCode?: string; examTitle: string; course: string; className: string; startedAt: string; lastSeenAt: string; deadlineAt: string; status: string; strictIntegrity: boolean; isFocused: boolean; isFullscreen: boolean; integrityEvents: ExamIntegrityEvent[]; strikeCount: number };
type ServerExamSession = { attemptId: string; attemptToken: string; startedAt: string; deadlineAt: string; strikeCount: number; questions: ExamQuestion[]; answers: Record<string, string | string[]>; integrityEvents: ExamIntegrityEvent[] };
type QueuedExamAnswer = { key: string; userId: string; attemptId: string; token: string; questionId: string; sequence: number; answer: string | string[]; queuedAt: number };
type DemoClass = { id: string; code: string; name: string; major: string; course: string; teacher: string; students: string[]; studentCodes?: Record<string, string>; studentEmails?: Record<string, string> };
type DemoCourse = { id: string; title: string; code: string; className: string; progress: number; completedLessons?: string[]; serverBacked?: boolean; chapters: { title: string; lessons: { title: string; duration: string; content?: string }[] }[] };
type UserRole = "student" | "teacher" | "school" | "admin";
type MeoUser = { id: string; username: string; fullName: string; role: UserRole; email?: string; authProvider?: "google"; major?: string; majorGroup?: string; studentCode?: string; className?: string };
type DemoAccount = Pick<MeoUser, "id" | "username" | "fullName" | "role" | "major">;
type RosterStudentAccount = Pick<MeoUser, "id" | "username" | "fullName" | "role" | "email" | "major" | "studentCode" | "className">;
type ProvisionedCredential = { username: string; initialPassword?: string; fullName: string; studentCode: string; className: string; email?: string; status: "created" | "reset" | "already-exists" };
type MajorResource = { id: string; title: string; url: string; year: string; description: string };
type Major = { id: string; name: string; level: "Cao đẳng" | "Trung cấp"; group: string; recruitment2026?: boolean; resources?: MajorResource[] };
type CandidateIdentity = { fullName: string; studentCode: string; major: string; extra?: Record<string, string> };
type RosterImportStudent = { studentCode: string; fullName: string; email: string; line: number; major?: string };
type RosterImportPreview = { fileName: string; students: RosterImportStudent[]; totalRows: number; skipped: number; issueCount: number; issues: string[] };

declare global {
  interface Window {
    google?: { accounts: { id: {
      initialize: (options: { client_id: string; nonce: string; callback: (response: { credential: string }) => void }) => void;
      renderButton: (element: HTMLElement, options: { theme: "outline"; size: "large"; text: "signin_with" | "signup_with"; shape: "rectangular"; width: number; logo_alignment: "left"; locale: "vi" }) => void;
    } } };
  }
}

const roleNames: Record<UserRole, string> = { student: "Sinh viên", teacher: "Giảng viên", school: "Nhà trường", admin: "Quản trị viên" };
const questionDifficultyLabels: QuestionDifficulty[] = ["Nhận biết", "Thông hiểu", "Vận dụng", "Vận dụng cao"];
const demoMode = process.env.NODE_ENV !== "production";
const demoPassword = "MeoTDC@2026";
const demoStorageEvent = "meotdc-demo-storage-updated";
const maxIntegrityStrikes = 3;
const integrityEventLabels: Record<ExamIntegrityKind, string> = {
  "focus-loss": "Rời tab hoặc cửa sổ thi",
  "fullscreen-exit": "Thoát chế độ toàn màn hình",
  "copy-attempt": "Thử sao chép nội dung",
  "cut-attempt": "Thử cắt nội dung",
  "paste-attempt": "Thử dán nội dung",
  "print-attempt": "Thử in nội dung",
  "shortcut-attempt": "Thử dùng phím tắt bị chặn",
  "context-menu": "Thử mở menu chuột phải",
  "leave-attempt": "Thử tải lại hoặc rời trang",
};

function integrityStrikeCount(events: ExamIntegrityEvent[]) {
  let strikes = 0;
  let previousFocusAt = Number.NEGATIVE_INFINITY;
  for (const event of events) {
    const at = Date.parse(event.at);
    if (!Number.isFinite(at)) continue;
    if (event.kind === "focus-loss" || event.kind === "fullscreen-exit") {
      if (at - previousFocusAt > 2500) strikes += 1;
      previousFocusAt = at;
    } else strikes += 1;
  }
  return strikes;
}

function integritySummary(events?: ExamIntegrityEvent[]) {
  if (!events) return "Chưa có nhật ký";
  return events.length ? events.map((event) => integrityEventLabels[event.kind]).join("; ") : "Không ghi nhận";
}
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

function readDemoData<T>(key: string, fallback: T): T {
  if (!demoMode) return (Array.isArray(fallback) ? [] : fallback) as T;
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.localStorage.getItem(`meotdc:${key}`);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as T;
    if (key === "exams" && Array.isArray(parsed)) {
      const safe = sanitizeStoredExams(parsed as Exam[]);
      const serialized = JSON.stringify(safe);
      if (serialized !== saved) window.localStorage.setItem(`meotdc:${key}`, serialized);
      return safe as T;
    }
    if (key === "bank-questions" && Array.isArray(parsed)) {
      const safe = sanitizeStoredBankQuestions(parsed as ExamQuestion[], readDemoData<Exam[]>("exams", []));
      const serialized = JSON.stringify(safe);
      if (serialized !== saved) window.localStorage.setItem(`meotdc:${key}`, serialized);
      return safe as T;
    }
    if (key === "attempts" && Array.isArray(parsed)) {
      const safe = (parsed as DemoAttempt[]).filter((attempt) => !attempt.serverAttemptId);
      const serialized = JSON.stringify(safe);
      if (serialized !== saved) window.localStorage.setItem(`meotdc:${key}`, serialized);
      return safe as T;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

function sanitizeStoredExams(exams: Exam[]) {
  return exams.map((exam) => exam.serverBacked ? {
    ...exam,
    accessPassword: undefined,
    targetStudentCodes: undefined,
    questions: exam.questions?.map((question) => ({ ...question, answer: "" })),
  } : exam);
}

function sanitizeStoredBankQuestions(questions: ExamQuestion[], exams: Exam[]) {
  const serverPrompts = new Set(exams.filter((exam) => exam.serverBacked).flatMap((exam) => exam.questions || []).map((question) => question.prompt.trim().toLocaleLowerCase("vi-VN")));
  return questions.filter((question) => !/^exam-[a-z0-9-]+:q-/i.test(question.id)).map((question) => serverPrompts.has(question.prompt.trim().toLocaleLowerCase("vi-VN")) ? { ...question, answer: "" } : question);
}

function writeDemoData<T>(key: string, value: T) {
  if (!demoMode || typeof window === "undefined") return;
  const safeExams = key === "exams" && Array.isArray(value) ? sanitizeStoredExams(value as Exam[]) : readDemoData<Exam[]>("exams", []);
  const safeValue = key === "exams" ? safeExams : key === "bank-questions" && Array.isArray(value) ? sanitizeStoredBankQuestions(value as ExamQuestion[], safeExams) : key === "attempts" && Array.isArray(value) ? (value as DemoAttempt[]).filter((attempt) => !attempt.serverAttemptId) : value;
  if (key === "exams") {
    try {
      const savedBank = window.localStorage.getItem("meotdc:bank-questions");
      if (savedBank) window.localStorage.setItem("meotdc:bank-questions", JSON.stringify(sanitizeStoredBankQuestions(JSON.parse(savedBank) as ExamQuestion[], safeExams)));
    } catch { /* Keep the exam write independent from a damaged demo bank. */ }
  }
  window.localStorage.setItem(`meotdc:${key}`, JSON.stringify(safeValue));
  window.dispatchEvent(new Event(demoStorageEvent));
}

const examOutboxDatabase = "meotdc-exam-outbox";
const examOutboxStore = "queuedAnswers";
const fallbackExamOutboxKey = (userId: string) => `meotdc:answer-outbox:${userId}`;

function readFallbackExamOutbox(userId: string) {
  try { return (JSON.parse(window.localStorage.getItem(fallbackExamOutboxKey(userId)) || "[]") as QueuedExamAnswer[]).filter((item) => item.userId === userId); }
  catch { return [] as QueuedExamAnswer[]; }
}

function openExamOutbox() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) { reject(new Error("Trình duyệt không hỗ trợ lưu hàng đợi thi an toàn.")); return; }
    const request = window.indexedDB.open(examOutboxDatabase, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(examOutboxStore)) request.result.createObjectStore(examOutboxStore, { keyPath: "key" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Không mở được kho tự lưu bài."));
  });
}

async function queueExamAnswer(item: Omit<QueuedExamAnswer, "key" | "queuedAt">) {
  const row = { ...item, key: `${item.userId}:${item.attemptId}:${item.questionId}`, queuedAt: Date.now() } satisfies QueuedExamAnswer;
  let db: IDBDatabase;
  try { db = await openExamOutbox(); }
  catch {
    const queued = readFallbackExamOutbox(item.userId).filter((entry) => entry.key !== row.key);
    queued.push(row);
    window.localStorage.setItem(fallbackExamOutboxKey(item.userId), JSON.stringify(queued));
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(examOutboxStore, "readwrite");
      tx.objectStore(examOutboxStore).put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Không lưu được câu trả lời ngoại tuyến."));
      tx.onabort = () => reject(tx.error || new Error("Không lưu được câu trả lời ngoại tuyến."));
    });
  } finally { db.close(); }
}

async function listQueuedExamAnswers(userId: string, attemptId: string) {
  let db: IDBDatabase;
  try { db = await openExamOutbox(); }
  catch { return readFallbackExamOutbox(userId).filter((item) => item.attemptId === attemptId); }
  try {
    return await new Promise<QueuedExamAnswer[]>((resolve, reject) => {
      const request = db.transaction(examOutboxStore, "readonly").objectStore(examOutboxStore).getAll();
      request.onsuccess = () => resolve((request.result as QueuedExamAnswer[]).filter((item) => item.userId === userId && item.attemptId === attemptId));
      request.onerror = () => reject(request.error || new Error("Không đọc được hàng đợi tự lưu."));
    });
  } finally { db.close(); }
}

async function removeQueuedExamAnswer(key: string, sentSequence: number) {
  const userId = key.split(":", 1)[0];
  let db: IDBDatabase;
  try { db = await openExamOutbox(); }
  catch {
    const remaining = readFallbackExamOutbox(userId).filter((item) => item.key !== key || item.sequence !== sentSequence);
    window.localStorage.setItem(fallbackExamOutboxKey(userId), JSON.stringify(remaining));
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(examOutboxStore, "readwrite");
      const store = tx.objectStore(examOutboxStore);
      const request = store.get(key);
      request.onsuccess = () => { if ((request.result as QueuedExamAnswer | undefined)?.sequence === sentSequence) store.delete(key); };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Không cập nhật được hàng đợi tự lưu."));
      tx.onabort = () => reject(tx.error || new Error("Không cập nhật được hàng đợi tự lưu."));
    });
  } finally { db.close(); }
}

async function clearQueuedExamAnswers(userId: string, attemptId: string) {
  let db: IDBDatabase;
  try { db = await openExamOutbox(); }
  catch {
    window.localStorage.setItem(fallbackExamOutboxKey(userId), JSON.stringify(readFallbackExamOutbox(userId).filter((item) => item.attemptId !== attemptId)));
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(examOutboxStore, "readwrite");
      const store = tx.objectStore(examOutboxStore);
      const request = store.getAll();
      request.onsuccess = () => (request.result as QueuedExamAnswer[]).filter((item) => item.userId === userId && item.attemptId === attemptId).forEach((item) => store.delete(item.key));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Không dọn được hàng đợi tự lưu."));
      tx.onabort = () => reject(tx.error || new Error("Không dọn được hàng đợi tự lưu."));
    });
  } finally { db.close(); }
}

function mergeExamLists(local: Exam[], remote: Exam[]) {
  const exams = new Map(local.filter((exam) => !exam.serverBacked).map((exam) => [exam.id, exam]));
  remote.forEach((exam) => exams.set(exam.id, { ...(exams.get(exam.id) || {}), ...exam, accessPassword: undefined }));
  return [...exams.values()];
}

function mergeCourseLists(local: DemoCourse[], remote: DemoCourse[]) {
  const courses = new Map(local.map((course) => [course.id, course]));
  remote.forEach((course) => courses.set(course.id, { ...(courses.get(course.id) || {}), ...course, serverBacked: true }));
  return [...courses.values()];
}

function canShowExamScore(exam: Exam | undefined, attempt: DemoAttempt) {
  const policy = exam?.showScore || "after-submit";
  if (policy === "after-submit") return true;
  if (policy === "teacher-release") return attempt.scoreReleased === true;
  const releaseAt = exam ? new Date(exam.dueAt).getTime() + (exam.durationMinutes || 30) * 60000 : Number.POSITIVE_INFINITY;
  return Date.now() >= releaseAt;
}

function downloadCsvFile(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"','""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseDelimitedRow(line: string, separator: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === separator && !quoted) { cells.push(value.trim()); value = ""; }
    else value += char;
  }
  cells.push(value.trim());
  return cells;
}

const sampleQuestions: ExamQuestion[] = [
  { id: "q-cs-1", prompt: "Trong mô hình quan hệ, khóa chính dùng để làm gì?", type: "single", options: ["Định danh duy nhất mỗi bản ghi", "Lưu nhiều giá trị trong một ô", "Mã hóa toàn bộ bảng", "Sắp xếp dữ liệu theo ngày"], answer: "0", points: 2 },
  { id: "q-cs-2", prompt: "Phép nối nào giữ lại mọi dòng của bảng bên trái?", type: "single", options: ["INNER JOIN", "LEFT JOIN", "CROSS JOIN", "SELF JOIN"], answer: "1", points: 2 },
  { id: "q-cs-3", prompt: "Chuẩn hóa dữ liệu giúp giảm dư thừa và bất thường cập nhật.", type: "true_false", options: ["Đúng", "Sai"], answer: "0", points: 2 },
  { id: "q-cs-4", prompt: "Lệnh SQL nào dùng để lấy dữ liệu từ bảng?", type: "short", options: [], answer: "select", points: 2 },
  { id: "q-cs-5", prompt: "Nêu một lợi ích của việc tạo chỉ mục trong cơ sở dữ liệu.", type: "essay", options: [], answer: "", points: 2 },
];

const networkQuestions: ExamQuestion[] = [
  { id: "q-net-1", prompt: "Tầng nào của mô hình OSI chịu trách nhiệm định tuyến gói tin?", type: "single", options: ["Liên kết dữ liệu", "Mạng", "Giao vận", "Ứng dụng"], answer: "1", points: 1 },
  { id: "q-net-2", prompt: "TCP cung cấp cơ chế truyền tin tin cậy và có kiểm soát thứ tự.", type: "true_false", options: ["Đúng", "Sai"], answer: "0", points: 1 },
  { id: "q-net-3", prompt: "Giao thức nào thường dùng để phân giải tên miền?", type: "single", options: ["DNS", "DHCP", "FTP", "ARP"], answer: "0", points: 1 },
];
const designQuestions: ExamQuestion[] = [
  { id: "q-design-1", prompt: "Nguyên tắc nào giúp các phần tử trong bố cục có cảm giác liên quan với nhau?", type: "single", options: ["Căn chỉnh", "Ngẫu nhiên hóa", "Thu nhỏ toàn bộ", "Dùng thật nhiều kiểu chữ"], answer: "0", points: 1 },
  { id: "q-design-2", prompt: "Độ tương phản giúp người xem nhận biết điểm nhấn và thứ bậc nội dung.", type: "true_false", options: ["Đúng", "Sai"], answer: "0", points: 1 },
  { id: "q-design-3", prompt: "Nêu một cách tạo phân cấp thị giác giữa tiêu đề và nội dung.", type: "essay", options: [], answer: "", points: 2 },
];
const autoQuestions: ExamQuestion[] = [
  { id: "q-auto-1", prompt: "Đơn vị đo hiệu điện thế là gì?", type: "single", options: ["Ampe", "Vôn", "Ôm", "Oát"], answer: "1", points: 1 },
  { id: "q-auto-2", prompt: "Cầu chì được dùng để bảo vệ mạch điện khi dòng điện vượt ngưỡng cho phép.", type: "true_false", options: ["Đúng", "Sai"], answer: "0", points: 1 },
  { id: "q-auto-3", prompt: "Dụng cụ nào có thể dùng để đo điện áp của ắc quy?", type: "single", options: ["Thước cặp", "Đồng hồ vạn năng", "Cờ lê lực", "Nhiệt kế"], answer: "1", points: 1 },
];
const digitalSkillsQuestions: ExamQuestion[] = [
  { id: "q-digital-1", prompt: "Bạn nên kiểm tra địa chỉ người gửi trước khi mở liên kết trong email lạ.", type: "true_false", options: ["Đúng", "Sai"], answer: "0", points: 1 },
  { id: "q-digital-2", prompt: "Xác thực đa yếu tố giúp tài khoản an toàn hơn vì sao?", type: "single", options: ["Yêu cầu thêm một bằng chứng xác thực", "Tự động chia sẻ mật khẩu", "Tắt mã hóa", "Bỏ qua đăng nhập"], answer: "0", points: 1 },
  { id: "q-digital-3", prompt: "Hãy nêu một dấu hiệu thường gặp của email lừa đảo.", type: "short", options: [], answer: "đường dẫn lạ", points: 1 },
];

const seedAssignments: DemoAssignment[] = [
  { id: "task-web-01", title: "Nộp giao diện trang đăng ký", course: "Lập trình Web", className: "CĐ23_LTW1", description: "Nộp ảnh chụp giao diện và đường dẫn repository. Ghi rõ phần việc của từng thành viên.", dueAt: "2026-11-27T16:59:00.000Z", points: 10, published: true },
  { id: "task-db-01", title: "Thiết kế ERD quản lý thư viện", course: "Cơ sở dữ liệu", className: "CĐ23_TH1", description: "Vẽ ERD, liệt kê khóa chính/khóa ngoại và nêu giả định nghiệp vụ.", dueAt: "2026-11-29T16:59:00.000Z", points: 10, published: true },
  { id: "task-design-01", title: "Thiết kế poster sự kiện sinh viên", course: "Đồ họa ứng dụng", className: "CĐ23_TKDH1", description: "Tạo poster theo khổ A3, thể hiện rõ thứ bậc tiêu đề, màu sắc và thông tin sự kiện.", dueAt: "2026-11-30T16:59:00.000Z", points: 10, published: true },
  { id: "task-auto-01", title: "Phiếu thực hành kiểm tra ắc quy", course: "Điện ô tô cơ bản", className: "CĐ24_OTO1", description: "Ghi quy trình đo điện áp ắc quy, kết quả quan sát và lưu ý an toàn tại xưởng.", dueAt: "2026-11-30T16:59:00.000Z", points: 10, published: true },
  { id: "task-digital-01", title: "Thực hành an toàn tài khoản học tập", course: "Kỹ năng học tập số TDC", className: "Toàn trường (mô phỏng)", description: "Mô tả ba bước bảo vệ tài khoản và cách báo cáo một email đáng ngờ.", dueAt: "2026-11-30T16:59:00.000Z", points: 10, published: true },
];

const seedSubmissions: DemoSubmission[] = [
  { id: "submission-db-01", assignmentId: "task-db-01", studentId: "demo-student-01", studentName: "Nguyễn Minh Anh", response: "Em đã xác định các thực thể Độc giả, Sách, Phiếu mượn và Chi tiết phiếu mượn; khóa ngoại liên kết theo mã tương ứng.", fileName: "erd-thu-vien.png", submittedAt: "2026-11-17T08:20:00.000Z", status: "submitted" },
  { id: "submission-web-02", assignmentId: "task-web-01", studentId: "demo-student-02", studentName: "Lê Hoàng Nam", response: "Đã hoàn thành giao diện trang đăng ký và kiểm tra responsive.", fileName: "dang-ky-demo.pdf", submittedAt: "2026-11-16T10:45:00.000Z", score: 8, feedback: "Bố cục tốt, bổ sung kiểm tra định dạng email.", status: "graded" },
];

const seedClasses: DemoClass[] = [
  { id: "cl-it-23-1", code: "CĐ23_TH1", name: "Công nghệ thông tin 23 — Nhóm 1", major: "Công nghệ thông tin", course: "Cơ sở dữ liệu", teacher: "Trần Minh Giang", students: ["Nguyễn Minh Anh", "Lê Hoàng Nam", "Trần Ngọc Hà", "Phạm Gia Bảo", "Võ Thảo My", "Đặng Tuấn Kiệt"] },
  { id: "cl-it-24-2", code: "CĐ24_MMT2", name: "Công nghệ thông tin 24 — Nhóm 2", major: "Công nghệ thông tin", course: "Mạng máy tính", teacher: "Trần Minh Giang", students: ["Bùi Khánh Linh", "Nguyễn Quốc Huy", "Đỗ Phương Thảo", "Hoàng Anh Tuấn", "Mai Nhật Vy"] },
  { id: "cl-design-23-1", code: "CĐ23_TKDH1", name: "Thiết kế đồ họa 23 — Nhóm 1", major: "Thiết kế đồ họa", course: "Đồ họa ứng dụng", teacher: "Lê Minh Châu", students: ["Phan Ngọc Yến", "Nguyễn Gia Hân", "Trần Minh Khoa", "Lê Bảo Trân"] },
  { id: "cl-auto-24-1", code: "CĐ24_OTO1", name: "Công nghệ kỹ thuật ô tô 24 — Nhóm 1", major: "Công nghệ kỹ thuật ô tô", course: "Điện ô tô cơ bản", teacher: "Nguyễn Hữu Phúc", students: ["Võ Thành Đạt", "Nguyễn Văn Tín", "Phạm Quốc Bảo", "Lý Hoàng Long"] },
];

const seedCourses: DemoCourse[] = [
  { id: "course-db", title: "Cơ sở dữ liệu", code: "CSDL · 3 tín chỉ", className: "CĐ23_TH1", progress: 72, chapters: [{ title: "1. Mô hình dữ liệu quan hệ", lessons: [{ title: "Bảng, dòng và thuộc tính", duration: "18 phút", content: "Bảng lưu dữ liệu của một thực thể. Mỗi dòng là một bản ghi, mỗi cột là một thuộc tính có kiểu dữ liệu xác định." }, { title: "Khóa chính và khóa ngoại", duration: "22 phút", content: "Khóa chính định danh duy nhất một dòng. Khóa ngoại tham chiếu khóa chính ở bảng khác để thể hiện quan hệ và giữ tính toàn vẹn dữ liệu." }] }, { title: "2. Truy vấn SQL", lessons: [{ title: "SELECT và điều kiện lọc", duration: "25 phút", content: "SELECT chọn cột cần đọc; FROM chỉ ra bảng nguồn; WHERE lọc bản ghi. Ví dụ: SELECT ma_sach, ten_sach FROM Sach WHERE nam_xb >= 2020;" }, { title: "JOIN nhiều bảng", duration: "30 phút", content: "JOIN kết hợp các dòng liên quan qua điều kiện khóa. INNER JOIN chỉ lấy cặp khớp; LEFT JOIN giữ toàn bộ dòng ở bảng bên trái." }] }] },
  { id: "course-web", title: "Lập trình Web", code: "LTW · 4 tín chỉ", className: "CĐ23_LTW1", progress: 64, chapters: [{ title: "1. Nền tảng giao diện", lessons: [{ title: "HTML ngữ nghĩa", duration: "20 phút", content: "Dùng header, nav, main, article và footer để mô tả cấu trúc trang. HTML ngữ nghĩa giúp trình đọc màn hình và công cụ tìm kiếm hiểu nội dung tốt hơn." }, { title: "CSS responsive", duration: "28 phút", content: "Thiết kế mobile-first với bố cục linh hoạt, đơn vị tương đối và media query. Kiểm tra nội dung ở chiều rộng điện thoại, máy tính bảng và màn hình lớn." }] }, { title: "2. Tương tác và dữ liệu", lessons: [{ title: "JavaScript và DOM", duration: "35 phút", content: "DOM biểu diễn trang HTML dưới dạng cây nút. JavaScript có thể chọn nút, đọc giá trị biểu mẫu và cập nhật giao diện theo sự kiện." }] }] },
  { id: "course-network", title: "Mạng máy tính", code: "MMT · 3 tín chỉ", className: "CĐ24_MMT2", progress: 48, chapters: [{ title: "1. Mô hình mạng", lessons: [{ title: "OSI và TCP/IP", duration: "24 phút", content: "Mô hình OSI chia truyền thông thành bảy lớp. Bộ TCP/IP nhóm các chức năng thành lớp ứng dụng, giao vận, Internet và truy cập mạng." }, { title: "Địa chỉ IPv4", duration: "26 phút", content: "IPv4 có 32 bit, thường viết thành bốn octet. Subnet mask xác định phần mạng và phần máy; địa chỉ mạng và broadcast không gán trực tiếp cho thiết bị." }] }] },
  { id: "course-design", title: "Đồ họa ứng dụng", code: "DHAU · 3 tín chỉ", className: "CĐ23_TKDH1", progress: 35, chapters: [{ title: "1. Nguyên lý thị giác", lessons: [{ title: "Căn chỉnh và khoảng trắng", duration: "20 phút", content: "Căn chỉnh tạo trật tự, còn khoảng trắng phân tách nhóm nội dung. Hãy dùng lưới nhất quán để poster dễ đọc từ tiêu đề đến thông tin phụ." }, { title: "Màu sắc và tương phản", duration: "25 phút", content: "Chọn bảng màu có vai trò rõ ràng; kiểm tra độ tương phản chữ và nền để nội dung vẫn dễ đọc." }] }] },
  { id: "course-auto", title: "Điện ô tô cơ bản", code: "ĐOTO · 3 tín chỉ", className: "CĐ24_OTO1", progress: 28, chapters: [{ title: "1. Đo kiểm an toàn", lessons: [{ title: "Đo điện áp ắc quy", duration: "22 phút", content: "Kiểm tra đồng hồ đo và dây que trước khi dùng. Chọn thang đo điện áp một chiều, đặt que đúng cực và tránh làm chập hai cọc ắc quy." }, { title: "Cầu chì và bảo vệ mạch", duration: "18 phút", content: "Cầu chì ngắt mạch khi dòng điện vượt mức thiết kế. Chỉ thay bằng cầu chì đúng trị số sau khi tìm nguyên nhân quá dòng." }] }] },
  { id: "course-digital", title: "Kỹ năng học tập số TDC", code: "KNSO · Đại cương", className: "Toàn trường (mô phỏng)", progress: 15, chapters: [{ title: "1. Học tập và an toàn số", lessons: [{ title: "Bảo vệ tài khoản", duration: "15 phút", content: "Dùng mật khẩu riêng, bật xác thực đa yếu tố, đăng xuất khỏi thiết bị dùng chung và không chia sẻ mã xác minh." }, { title: "Nhận diện email lừa đảo", duration: "12 phút", content: "Kiểm tra người gửi, tên miền, liên kết và yêu cầu cung cấp thông tin. Khi nghi ngờ, không bấm liên kết; hãy xác minh qua kênh chính thức." }] }] },
];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toLocaleUpperCase("vi-VN") || "").join("");
}

function formatCandidateDetails(details?: Record<string, string>) {
  return Object.entries(details || {}).filter(([, value]) => value.trim()).map(([label, value]) => label + ": " + value).join(" · ");
}

const iconContents: Record<IconName, React.ReactNode> = {
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6a1.5 1.5 0 0 0-1.5-1.5h-3A1.5 1.5 0 0 0 9 4.5ZM8.5 10h7M8.5 14h7M8.5 18h4"/></>,
  users: <><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M17 4.3a3.5 3.5 0 0 1 0 6.8M21 20v-1.5a4 4 0 0 0-3-3.87"/></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5Zm0 0v12M8 7h8M8 11h8"/></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  chart: <><path d="M4 19.5h16M6.5 16V9M12 16V5M17.5 16v-4"/><circle cx="6.5" cy="7" r="1"/><circle cx="12" cy="3.5" r="1"/><circle cx="17.5" cy="10" r="1"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.2 1-1.2 2.1-1.5-.6a8.2 8.2 0 0 1-1.5.9l-.2 1.6h-2.5l-.3-1.6a8.2 8.2 0 0 1-1.6-.9l-1.5.6-1.2-2.1 1.2-1a7.5 7.5 0 0 1 0-1.8l-1.2-1 1.2-2.1 1.5.6a8.2 8.2 0 0 1 1.6-.9l.3-1.6h2.5l.2 1.6a8.2 8.2 0 0 1 1.5.9l1.5-.6 1.2 2.1-1.2 1a7.5 7.5 0 0 1-.1 1.7Z" transform="translate(-1.1 -1.6) scale(1.1)"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></>,
  bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  dots: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  spark: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  file: <><path d="M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></>,
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{iconContents[name]}</svg>;
}

const fallbackExams: Exam[] = [
  { id: "exam-101", title: "Kiểm tra giữa kỳ — Cơ sở dữ liệu", course: "Cơ sở dữ liệu", className: "CĐ23_TH1", dueAt: "2026-11-20T14:00:00.000Z", questionCount: 30, submissions: 28, status: "Đang diễn ra" },
  { id: "exam-102", title: "Ôn tập chương 4 — Mạng máy tính", course: "Mạng máy tính", className: "CĐ24_MMT2", dueAt: "2026-11-22T02:30:00.000Z", questionCount: 3, submissions: 12, status: "Sắp diễn ra", questions: networkQuestions },
  { id: "exam-103", title: "Bài tập tuần 8 — Lập trình Web", course: "Lập trình Web", className: "CĐ23_LTW1", dueAt: "2026-11-28T10:00:00.000Z", questionCount: 3, submissions: 0, status: "Sắp diễn ra", questions: digitalSkillsQuestions },
  { id: "exam-104", title: "Kiểm tra nhanh — Toán rời rạc", course: "Toán rời rạc", className: "CĐ24_TH2", dueAt: "2026-11-24T08:00:00.000Z", questionCount: 3, submissions: 0, status: "Sắp diễn ra", questions: digitalSkillsQuestions },
  { id: "exam-tdc-digital", title: "Kiểm tra kỹ năng học tập số TDC", course: "Kỹ năng học tập số TDC", className: "Toàn trường (mô phỏng)", dueAt: "2026-11-30T16:00:00.000Z", questionCount: digitalSkillsQuestions.length, submissions: 0, status: "Sắp diễn ra", questions: digitalSkillsQuestions },
];

const navigation: { label: NavKey; icon: IconName }[] = [
  { label: "Tổng quan", icon: "grid" },
  { label: "Lớp học", icon: "users" },
  { label: "Bài kiểm tra", icon: "clipboard" },
  { label: "Bài tập", icon: "file" },
  { label: "Khóa học", icon: "book" },
  { label: "Ngân hàng câu hỏi", icon: "layers" },
  { label: "Báo cáo", icon: "chart" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}


function questionMatrixKey(question: ExamQuestion) {
  return [question.topic?.trim() || "Chưa gắn chủ đề", question.outcome?.trim() || "Chưa gắn chuẩn đầu ra", question.difficulty || "Chưa phân loại"].join("\u001f");
}

function matrixBuckets(questions: ExamQuestion[]) {
  const groups = new Map<string, { key: string; topic: string; outcome: string; difficulty: string; availableCount: number }>();
  for (const question of questions) {
    const key = questionMatrixKey(question);
    const [topic, outcome, difficulty] = key.split("\u001f");
    const current = groups.get(key);
    groups.set(key, { key, topic, outcome, difficulty, availableCount: (current?.availableCount || 0) + 1 });
  }
  return [...groups.values()];
}

function allocateMatrixQuotas(questions: ExamQuestion[], count: number): ExamMatrixQuota[] {
  const buckets = matrixBuckets(questions);
  if (!questions.length || count <= 0) return buckets.map((bucket) => ({ ...bucket, count: 0 }));
  const target = Math.min(count, questions.length);
  const allocated = buckets.map((bucket) => {
    const exact = target * bucket.availableCount / questions.length;
    return { ...bucket, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  const remaining = target - allocated.reduce((sum, item) => sum + item.count, 0);
  for (const item of [...allocated].sort((a, b) => b.remainder - a.remainder).slice(0, remaining)) item.count += 1;
  return allocated.map(({ remainder: _remainder, availableCount: _availableCount, ...quota }) => quota);
}

function sampleQuestionMatrix(pool: ExamQuestion[], count: number, requestedQuotas?: ExamMatrixQuota[]) {
  if (count <= 0) return [];
  if (count >= pool.length) return [...pool];
  const buckets = matrixBuckets(pool);
  const quotas = requestedQuotas?.length ? requestedQuotas : allocateMatrixQuotas(pool, count);
  const available = new Map(buckets.map((bucket) => [bucket.key, bucket.availableCount]));
  const quotaKeys = new Set(quotas.map((quota) => quota.key));
  const valid = quotas.length === buckets.length && quotaKeys.size === buckets.length && buckets.every((bucket) => quotaKeys.has(bucket.key)) && quotas.reduce((sum, quota) => sum + quota.count, 0) === count && quotas.every((quota) => Number.isInteger(quota.count) && quota.count >= 0 && quota.count <= (available.get(quota.key) || 0));
  const effectiveQuotas = valid ? quotas : allocateMatrixQuotas(pool, count);
  const selected: ExamQuestion[] = [];
  for (const quota of effectiveQuotas) {
    const candidates = pool.filter((question) => questionMatrixKey(question) === quota.key);
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
    }
    selected.push(...candidates.slice(0, quota.count));
  }
  for (let index = selected.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [selected[index], selected[swap]] = [selected[swap], selected[index]];
  }
  return selected;
}

function demoRosterCode(classItem: DemoClass, name: string, index: number) {
  const classTag = classItem.code.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return classItem.studentCodes?.[name] || `SV-${classTag}-${String(index + 1).padStart(3, "0")}`;
}

function statusClass(status: Exam["status"]) {
  if (status === "Đang diễn ra") return "status-live";
  if (status === "Đã kết thúc") return "status-done";
  return "status-soon";
}

function liveExamStatus(exam: Exam): Exam["status"] {
  if (exam.published === false || !exam.opensAt) return exam.status;
  const now = Date.now();
  if (now < new Date(exam.opensAt).getTime()) return "Sắp diễn ra";
  return now < new Date(exam.dueAt).getTime() ? "Đang diễn ra" : "Đã kết thúc";
}

function seedDemoExams(): Exam[] {
  if (!demoMode) return [];
  const additions: Exam[] = [
    { id: "exam-design-01", title: "Thực hành bố cục và phân cấp thị giác", course: "Đồ họa ứng dụng", className: "CĐ23_TKDH1", dueAt: "2026-11-28T16:00:00.000Z", questionCount: designQuestions.length, submissions: 0, status: "Sắp diễn ra", questions: designQuestions },
    { id: "exam-auto-01", title: "Kiểm tra hệ thống điện ô tô cơ bản", course: "Điện ô tô cơ bản", className: "CĐ24_OTO1", dueAt: "2026-11-29T16:00:00.000Z", questionCount: autoQuestions.length, submissions: 0, status: "Sắp diễn ra", questions: autoQuestions },
  ];
  return [...fallbackExams,...additions].map((exam) => ({ ...exam, published: true, durationMinutes: 30, attemptsAllowed: 1, strictIntegrity: true, shuffleQuestions: true, showScore: "after-submit", questions: (exam.questions || sampleQuestions).map((question) => ({ ...question, id: `${exam.id}:${question.id}` })) }));
}

export default function HomePage() {
  const [user, setUser] = useState<MeoUser | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [majors, setMajors] = useState<Major[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/v1/auth/demo-accounts"),
      fetch("/api/v1/catalog/majors"),
      fetch("/api/v1/auth/me"),
    ]).then(async ([accountsResponse, majorsResponse, sessionResponse]) => {
      if (!alive) return;
      if (accountsResponse.ok) setDemoAccounts(await accountsResponse.json());
      if (majorsResponse.ok) setMajors(await majorsResponse.json());
      if (sessionResponse.ok) {
        const session = await sessionResponse.json();
        setUser(session.user);
      }
      setApiReady(accountsResponse.ok && majorsResponse.ok);
    }).catch(() => {
      if (alive) setApiReady(false);
    }).finally(() => {
      if (alive) setAuthReady(true);
    });
    return () => { alive = false; };
  }, []);

  async function login(username: string, password: string, major?: string) {
    setLoggingIn(true);
    setLoginError("");
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, major }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "Đăng nhập chưa thành công.");
      setUser(payload.user as MeoUser);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Không kết nối được máy chủ MeoTDC.");
    } finally {
      setLoggingIn(false);
    }
  }

  async function loginWithGoogle(credential: string, nonce: string): Promise<boolean> {
    setLoggingIn(true);
    setLoginError("");
    try {
      const response = await fetch("/api/v1/auth/google-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential, nonce }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "Đăng nhập Google chưa thành công.");
      setUser(payload.user as MeoUser);
      return true;
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Không kết nối được dịch vụ đăng nhập Google.");
      return false;
    } finally {
      setLoggingIn(false);
    }
  }

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
  }

  if (!authReady) return <div className="auth-loading"><span className="brand-mark"><span className="brand-dot"/><span className="brand-ear brand-ear-left"/><span className="brand-ear brand-ear-right"/></span><strong>MeoTDC</strong><span>Đang kết nối không gian học tập…</span></div>;
  if (!user) return <LoginPage accounts={demoMode ? demoAccounts : []} majors={majors} googleClientId={googleClientId} apiReady={apiReady} error={loginError} loading={loggingIn} onLogin={login} onGoogleLogin={loginWithGoogle}/>;
  if (user.role === "student") return <StudentWorkspace user={user} majors={majors} onLogout={logout}/>;
  if (user.role === "school" || user.role === "admin") return <InstitutionWorkspace user={user} majors={majors} accounts={demoMode ? demoAccounts : []} onLogout={logout}/>;
  return <TeacherWorkspace user={user} majors={majors} onLogout={logout}/>;
}

function TeacherWorkspace({ user, majors, onLogout }: { user: MeoUser; majors: Major[]; onLogout: () => void }) {
  const [active, setActive] = useState<NavKey>("Tổng quan");
  useEffect(() => { document.title = `${active} · MeoTDC`; return () => { document.title = "MeoTDC — Cổng học tập số TDC"; }; }, [active]);
  const [exams, setExams] = useState<Exam[]>(demoMode ? fallbackExams : []);
  const [connected, setConnected] = useState(false);
  const [modal, setModal] = useState<"exam" | "import" | "assignment" | null>(null);
  const [assignments, setAssignments] = useState<DemoAssignment[]>(demoMode ? seedAssignments : []);
  const [courses, setCourses] = useState<DemoCourse[]>(demoMode ? seedCourses : []);
  const [submissions, setSubmissions] = useState<DemoSubmission[]>([]);
  const [attempts, setAttempts] = useState<DemoAttempt[]>([]);
  const [classes, setClasses] = useState<DemoClass[]>(demoMode ? seedClasses : []);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    const localExams = readDemoData<Exam[] | null>("exams", null) || seedDemoExams();
    const localAssignments = readDemoData<DemoAssignment[] | null>("assignments", null) || seedAssignments;
    const localSubmissions = readDemoData<DemoSubmission[] | null>("submissions", null) || seedSubmissions;
    const localAttempts = readDemoData<DemoAttempt[]>("attempts", []);
    setExams(localExams);
    setAssignments(localAssignments);
    setCourses(readDemoData("courses", seedCourses));
    setSubmissions(localSubmissions);
    setAttempts(localAttempts);
    setClasses(demoMode ? readDemoData("classes", seedClasses) : []);
    if (!readDemoData<Exam[] | null>("exams", null)) writeDemoData("exams", localExams);
    if (!readDemoData<DemoAssignment[] | null>("assignments", null)) writeDemoData("assignments", localAssignments);
    const refreshLocalData = () => {
      setExams(readDemoData("exams", seedDemoExams()));
      setAssignments(readDemoData("assignments", seedAssignments));
      setCourses(readDemoData("courses", seedCourses));
      setSubmissions(readDemoData("submissions", seedSubmissions));
      setAttempts(readDemoData("attempts", []));
      setClasses(demoMode ? readDemoData("classes", seedClasses) : []);
    };
    window.addEventListener(demoStorageEvent, refreshLocalData);
    fetch("/api/v1/health").then((response) => {
      if (alive) setConnected(response.ok);
    }).catch(() => {
      if (alive) setConnected(false);
    });
    return () => { alive = false; window.removeEventListener(demoStorageEvent, refreshLocalData); };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let alive = true;
    const refreshServerData = async () => {
      try {
        const [examResponse, attemptResponse, assignmentResponse, courseResponse, classResponse] = await Promise.all([fetch("/api/v1/exams"), fetch("/api/v1/exam-attempts"), fetch("/api/v1/assignments"), fetch("/api/v1/courses"), fetch("/api/v1/catalog/classes")]);
        if (!alive) return;
        if (examResponse.ok) {
          const remote = await examResponse.json() as Exam[];
          setExams((current) => mergeExamLists(current, remote));
        }
        if (attemptResponse.ok) {
          const remoteAttempts = await attemptResponse.json() as DemoAttempt[];
          setAttempts((current) => [...new Map([...current, ...remoteAttempts].map((attempt) => [attempt.id, attempt])).values()]);
        }
        if (!demoMode && assignmentResponse.ok) {
          const remote = await assignmentResponse.json() as LearningData;
          setAssignments(remote.assignments);
          setSubmissions(remote.submissions);
        }
        if (courseResponse.ok) {
          const remoteCourses = await courseResponse.json() as DemoCourse[];
          setCourses(demoMode ? mergeCourseLists(readDemoData("courses", seedCourses), remoteCourses) : remoteCourses);
        }
        if (classResponse.ok) {
          const remoteClasses = await classResponse.json() as DemoClass[];
          setClasses(demoMode ? readDemoData("classes", seedClasses) : remoteClasses);
        }
      } catch { /* Keep local demo data visible when the API is unavailable. */ }
    };
    void refreshServerData();
    const timer = window.setInterval(() => { void refreshServerData(); }, 10_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const filteredExams = useMemo(() => exams.filter((exam) => `${exam.title} ${exam.course} ${exam.className}`.toLowerCase().includes(query.toLowerCase())), [exams, query]);

  async function saveCourse(course: DemoCourse) {
    const response = await fetch("/api/v1/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(course) });
    const payload = await response.json();
    if (!response.ok || !payload.course) throw new Error(typeof payload.message === "string" ? payload.message : "Không lưu được khóa học lên máy chủ.");
    const saved = payload.course as DemoCourse;
    setCourses((current) => {
      const next = [...current.filter((item) => item.id !== saved.id), saved];
      if (demoMode) writeDemoData("courses", next);
      return next;
    });
  }

  async function createExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const form = new FormData(event.currentTarget, submitter instanceof HTMLButtonElement ? submitter : undefined);
    const localOpenAt = String(form.get("opensAt") || "");
    const localDueAt = String(form.get("dueAt") || "");
    const parsedOpenAt = new Date(localOpenAt);
    const parsedDueAt = new Date(localDueAt);
    const questionsJson = String(form.get("questionsJson") || "[]");
    const published = form.get("publish") === "true";
    const audience = String(form.get("audience") || "class");
    const targetStudentCodes = form.getAll("targetStudentCodes").map(String);
    const randomQuestionCount = Number(form.get("randomQuestionCount") || 0);
    let matrixQuotas: ExamMatrixQuota[] = [];
    try { matrixQuotas = JSON.parse(String(form.get("matrixQuotasJson") || "[]")) as ExamMatrixQuota[]; } catch { setNotice("Không đọc được quota ma trận câu hỏi."); return; }
    const accessPassword = String(form.get("accessPassword") || "").trim();
    const candidateFields = [...new Set(String(form.get("candidateFields") || "").split(/[,;]/).map((field) => field.trim()).filter(Boolean))].slice(0, 8);
    let questions: ExamQuestion[] = [];
    try { questions = JSON.parse(questionsJson) as ExamQuestion[]; } catch { setNotice("Không đọc được danh sách câu hỏi. Hãy kiểm tra lại bản nháp."); return; }
    if (questions.length === 0 || questions.some((question) => !question.prompt.trim())) { setNotice("Hãy nhập nội dung cho ít nhất một câu hỏi."); return; }
    if (questions.some((question) => question.type === "single" && !question.options.some((option) => option.trim()))) { setNotice("Câu trắc nghiệm cần có các phương án trả lời."); return; }
    if (published && questions.some((question) => question.type !== "essay" && !String(question.answer).trim())) { setNotice("Mỗi câu khách quan cần có đáp án trước khi xuất bản."); return; }
    if (published && audience === "student" && targetStudentCodes.length === 0) { setNotice("Hãy chọn ít nhất một sinh viên được giao đề."); return; }
    if (!Number.isInteger(randomQuestionCount) || randomQuestionCount < 0 || randomQuestionCount > questions.length) { setNotice("Số câu rút ngẫu nhiên phải nằm trong bộ câu hỏi hiện có."); return; }
    if (randomQuestionCount > 0) {
      const available = new Map(matrixBuckets(questions).map((bucket) => [bucket.key, bucket.availableCount]));
      const totalQuota = matrixQuotas.reduce((sum, quota) => sum + Number(quota.count), 0);
      if (totalQuota !== randomQuestionCount || matrixQuotas.length !== available.size || matrixQuotas.some((quota) => !available.has(quota.key) || !Number.isInteger(quota.count) || quota.count < 0 || quota.count > (available.get(quota.key) || 0)) || new Set(matrixQuotas.map((quota) => quota.key)).size !== available.size) { setNotice("Quota ma trận phải đủ số câu đã chọn và không vượt số câu có trong từng nhóm."); return; }
    } else matrixQuotas = [];
    const opensAt = localOpenAt && !Number.isNaN(parsedOpenAt.getTime()) ? parsedOpenAt : new Date();
    const dueAt = localDueAt && !Number.isNaN(parsedDueAt.getTime()) ? parsedDueAt : new Date(Date.now() + 7 * 86400000);
    if (published && opensAt.getTime() >= dueAt.getTime()) { setNotice("Giờ mở đề phải sớm hơn giờ đóng đề."); return; }
    const examId = `exam-${crypto.randomUUID()}`;
    questions = questions.map((question, index) => ({ ...question, id: `${examId}:q-${index + 1}` }));
    const exam: Exam = {
      id: examId,
      title: String(form.get("title") || "").trim(),
      course: String(form.get("course") || "Cơ sở dữ liệu"),
      className: String(form.get("className") || "CĐ23_TH1"),
      opensAt: opensAt.toISOString(),
      dueAt: dueAt.toISOString(),
      questionCount: randomQuestionCount || questions.length,
      submissions: 0,
      status: opensAt.getTime() > Date.now() ? "Sắp diễn ra" : dueAt.getTime() <= Date.now() ? "Đã kết thúc" : "Đang diễn ra",
      published,
      audience: audience === "public" ? "public" : audience === "student" ? "student" : "class",
      targetStudentCodes,
      durationMinutes: Number(form.get("durationMinutes") || 30),
      attemptsAllowed: Number(form.get("attemptsAllowed") || 1),
      strictIntegrity: form.get("strictIntegrity") === "on",
      shuffleQuestions: form.get("shuffleQuestions") === "true",
      randomQuestionCount,
      matrixQuotas,
      accessPassword: accessPassword || undefined,
      candidateFields,
      showScore: String(form.get("showScore") || "after-submit"),
      questions,
    };
    setSaving(true);
    try {
      const response = await fetch("/api/v1/exams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(exam) });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "Không lưu được đề lên máy chủ.");
      const storedExam = { ...exam, ...(payload as Exam), accessPassword: undefined };
      const nextExams = [storedExam, ...exams.filter((item) => item.id !== exam.id)];
      writeDemoData("exams", nextExams);
      if (!storedExam.serverBacked) {
        const currentBank = readDemoData<ExamQuestion[]>("bank-questions", sampleQuestions);
        const bankPrompts = new Set(currentBank.map((question) => question.prompt.trim().toLocaleLowerCase("vi-VN")));
        writeDemoData("bank-questions", [...currentBank, ...questions.filter((question) => !bankPrompts.has(question.prompt.trim().toLocaleLowerCase("vi-VN")))]);
      }
      setExams(nextExams);
      setModal(null);
      setNotice(published ? "Đã xuất bản đề. Đáp án được giữ ở máy chủ và không lưu trong trình duyệt." : "Đã lưu đề vào máy chủ; câu trả lời chuẩn không được đưa vào dữ liệu trình duyệt.");
      setActive(published ? "Bài kiểm tra" : "Tổng quan");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể lưu đề lên máy chủ.");
    } finally {
      setSaving(false);
    }
  }

  async function setExamPublished(examId: string, published: boolean) {
    const exam = exams.find((item) => item.id === examId);
    if (!exam) return;
    setSaving(true);
    try {
      if (exam.serverBacked) {
        const response = await fetch(`/api/v1/exams/${examId}/${published ? "publish" : "unpublish"}`, { method: "POST" });
        const payload = await response.json();
        if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "Không cập nhật được trạng thái đề.");
      }
      const next = exams.map((item) => item.id === examId ? { ...item, published } : item);
      writeDemoData("exams", next);
      setExams(next);
      setNotice(published ? "Đề đã được xuất bản lên máy chủ." : "Đề đã chuyển về bản nháp trên máy chủ.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không cập nhật được đề.");
    } finally {
      setSaving(false);
    }
  }

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const form = new FormData(event.currentTarget, submitter instanceof HTMLButtonElement ? submitter : undefined);
    const assignment: DemoAssignment = { id: `task-${crypto.randomUUID()}`, title: String(form.get("title") || "").trim(), course: String(form.get("course") || "Cơ sở dữ liệu"), className: String(form.get("className") || "CĐ23_TH1"), description: String(form.get("description") || ""), dueAt: new Date(String(form.get("dueAt") || Date.now() + 7 * 86400000)).toISOString(), points: Number(form.get("points") || 10), published: form.get("publish") === "true" };
    if (!demoMode) {
      try {
        const response = await fetch("/api/v1/assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(assignment) });
        const payload = await response.json();
        if (!response.ok || !payload.assignment) throw new Error(typeof payload.message === "string" ? payload.message : "Không lưu được bài tập lên máy chủ.");
        setAssignments((current) => [payload.assignment as DemoAssignment, ...current]);
        setModal(null);
        setNotice(assignment.published ? "Đã giao bài tập và lưu trên máy chủ." : "Đã lưu bản nháp trên máy chủ.");
        setActive("Bài tập");
      } catch (error) { setNotice(error instanceof Error ? error.message : "Không lưu được bài tập."); }
      return;
    }
    const next = [assignment, ...assignments];
    writeDemoData("assignments", next);
    setAssignments(next);
    setModal(null);
    setNotice(assignment.published ? "Đã giao bài tập cho lớp." : "Đã lưu bài tập vào bản nháp.");
    setActive("Bài tập");
  }

  async function gradeSubmission(submissionId: string, score: number, feedback: string, status: DemoSubmission["status"]) {
    if (!demoMode) {
      const submission = submissions.find((item) => item.id === submissionId);
      if (!submission) { setNotice("Không tìm thấy bài nộp cần chấm."); return; }
      try {
        const response = await fetch(`/api/v1/assignments/${encodeURIComponent(submission.assignmentId)}/submissions/${encodeURIComponent(submissionId)}/grade`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score, feedback, status }) });
        const payload = await response.json();
        if (!response.ok || !payload.submission) throw new Error(typeof payload.message === "string" ? payload.message : "Không lưu được điểm.");
        setSubmissions((current) => current.map((item) => item.id === submissionId ? payload.submission as DemoSubmission : item));
        setNotice(status === "revision" ? "Đã yêu cầu sinh viên nộp lại." : "Đã lưu điểm và nhận xét lên máy chủ.");
      } catch (error) { setNotice(error instanceof Error ? error.message : "Không lưu được điểm."); }
      return;
    }
    const next = submissions.map((submission) => submission.id === submissionId ? { ...submission, score, feedback, status } : submission);
    writeDemoData("submissions", next);
    setSubmissions(next);
    setNotice(status === "revision" ? "Đã yêu cầu sinh viên nộp lại." : "Đã lưu điểm và nhận xét.");
  }

  function gradeExamAttempt(attemptId: string, scores: Record<string, number>, feedback: Record<string, string>) {
    const next = attempts.map((attempt) => {
      if (attempt.id !== attemptId) return attempt;
      const manualScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
      return { ...attempt, manualScores: scores, manualFeedback: feedback, score: (attempt.objectiveScore ?? attempt.score) + manualScore, scoreReleased: true };
    });
    writeDemoData("attempts", next);
    setAttempts(next);
    setNotice("Đã lưu điểm và nhận xét cho bài thi.");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); setActive("Tổng quan"); }}>
          <span className="brand-mark"><span className="brand-dot"/><span className="brand-ear brand-ear-left"/><span className="brand-ear brand-ear-right"/></span>
          <span className="brand-word">Meo<span>TDC</span></span>
        </a>
        <div className="school-switcher">
          <div className="school-seal">T</div>
          <div className="school-copy"><strong>Cao đẳng TDC</strong><span>{roleNames[user.role]}</span></div>
          <Icon name="chevron" size={16}/>
        </div>
        <div className="nav-section-label">QUẢN LÝ GIẢNG DẠY</div>
        <nav className="main-nav" aria-label="Điều hướng chính">
          {navigation.filter((item) => demoMode || ["Tổng quan", "Bài kiểm tra", "Báo cáo"].includes(item.label)).map((item) => <button key={item.label} className={`nav-item ${active === item.label ? "active" : ""}`} onClick={() => setActive(item.label)}><Icon name={item.icon}/><span>{item.label}</span>{item.label === "Bài kiểm tra" && <span className="nav-count">{exams.filter((exam) => exam.published !== false).length}</span>}{item.label === "Bài tập" && <span className="nav-count">{assignments.filter((assignment) => assignment.published).length}</span>}</button>)}
        </nav>
        <div className="nav-section-label tools-label">CÁ NHÂN</div>
        <nav className="main-nav"><button className="nav-item" onClick={() => setNotice("Cài đặt tài khoản sẽ có trong giai đoạn xác thực.")}><Icon name="settings"/><span>Cài đặt</span></button></nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><Icon name="spark" size={18}/></div><strong>Cần hỗ trợ?</strong><p>Trung tâm hướng dẫn MeoTDC</p><button onClick={() => setNotice("Tài liệu hướng dẫn sẽ được bổ sung cùng bản MVP.")}>Xem hướng dẫn <Icon name="arrow" size={14}/></button></div>
          <button className="profile" onClick={onLogout} title="Đăng xuất"><span className="avatar">{initials(user.fullName)}</span><span className="profile-copy"><strong>{user.fullName}</strong><small>{roleNames[user.role]}</small></span><Icon name="dots" size={18}/></button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Không gian {roleNames[user.role].toLowerCase()}</span><Icon name="chevron" size={14}/><strong>{active}</strong></div>
          <div className="topbar-actions">
            <div className={`connection-pill ${connected ? "online" : "offline"}`}><span className="connection-dot"/>{connected ? "API đang hoạt động" : "Chế độ xem mẫu"}</div>
            <button className="icon-button search-toggle" aria-label="Tìm kiếm" onClick={() => { setActive("Bài kiểm tra"); window.setTimeout(() => document.getElementById("exam-search")?.focus(), 50); }}><Icon name="search"/></button>
            <button className="icon-button notification-button" aria-label="Thông báo" onClick={() => setNotice("Bạn đã xem hết thông báo mới.")}><Icon name="bell"/><i/></button>
            <span className="topbar-divider"/>
            <button className="top-avatar" aria-label={`Tài khoản ${user.fullName}`} onClick={onLogout}>{initials(user.fullName)}</button>
            <button className="logout-button" onClick={onLogout}>Đăng xuất</button>
          </div>
        </header>

        <div className="content-wrap page-scene" key={active}>
          {!demoMode && <ProductionReadinessNotice/>}
          {active === "Tổng quan" && <Dashboard user={user} exams={filteredExams} classes={classes} onCreate={() => setModal("exam")} onImport={() => setModal("import")} onSeeAll={() => setActive("Bài kiểm tra")} query={query} setQuery={setQuery} assignments={assignments} submissions={submissions} attempts={attempts} />}
          {active === "Bài kiểm tra" && <ExamPage exams={filteredExams} query={query} setQuery={setQuery} onCreate={() => setModal("exam")} onImport={() => setModal("import")} onPublish={(examId) => { void setExamPublished(examId, true); }} onUnpublish={(examId) => { void setExamPublished(examId, false); }} />}
          {active === "Bài tập" && <AssignmentPage assignments={assignments} submissions={submissions} onCreate={() => setModal("assignment")} onGrade={gradeSubmission} />}
          {active === "Lớp học" && <ClassesPage majors={majors} initialClasses={classes} />}
          {active === "Khóa học" && <CoursesPage courses={courses} onSave={saveCourse} />}
          {active === "Ngân hàng câu hỏi" && <QuestionBankPage onImport={() => setModal("import")} />}
          {active === "Báo cáo" && <ReportsPage exams={exams} attempts={attempts} submissions={submissions} assignments={assignments} onGradeAttempt={gradeExamAttempt} />}
        </div>
      </section>

      {modal === "exam" && <ExamModal onClose={() => setModal(null)} onSubmit={createExam} saving={saving}/>}
      {modal === "import" && <ImportModal onClose={() => setModal(null)} onCreateExam={(questions, fileName) => { setModal("exam"); window.setTimeout(() => window.dispatchEvent(new CustomEvent("meotdc-import-questions", { detail: { questions, fileName } })), 0); }} />}
      {modal === "assignment" && <AssignmentModal onClose={() => setModal(null)} onSubmit={createAssignment}/>}
      {notice && <div role="status" className="toast"><span className="toast-check">✓</span>{notice}</div>}
    </main>
  );
}

function ProductionReadinessNotice() {
  return <aside className="production-readiness-notice" role="note"><strong>Phiên bản triển khai giới hạn</strong><span>Đề thi, lượt thi, bài tập, roster và khóa học đã có API; khi bật PostgreSQL, dữ liệu được lưu trên máy chủ. Lớp hiện được suy ra từ roster và nội dung đã giao, chưa có quản lý học kỳ/ghi danh chính thức; ngân hàng câu hỏi vẫn là dữ liệu demo. Không nhập dữ liệu thật trước khi trường nghiệm thu SSO, ghi danh, phân quyền và quy trình bảo vệ dữ liệu.</span></aside>;
}

function PublicLanding({ majors, onLogin, onRegister }: { majors: Major[]; onLogin: () => void; onRegister: () => void }) {
  return <main className="public-site" id="home">
    <header className="public-nav">
      <a className="public-brand" href="#home" aria-label="MeoTDC trang chủ"><span className="brand-mark"><span className="brand-dot"/><span className="brand-ear brand-ear-left"/><span className="brand-ear brand-ear-right"/></span><span className="brand-word">Meo<span>TDC</span></span></a>
      <nav className="public-nav-links" aria-label="Điều hướng chính"><a href="#tinh-nang">Tính năng</a><a href="#nganh-dao-tao">Ngành đào tạo</a><a href="#nha-truong">Dành cho nhà trường</a><a href="#quy-trinh">Quy trình</a></nav>
      <div className="public-nav-actions"><button className="public-login-button" type="button" onClick={onLogin}>Đăng nhập</button><button className="public-register-button" type="button" onClick={onRegister}>Đăng ký <Icon name="arrow" size={15}/></button></div>
    </header>
    <section className="public-hero">
      <div className="public-hero-copy">
        <div className="public-eyebrow"><span/> KHÔNG GIAN HỌC TẬP SỐ CHO TDC</div>
        <h1>Dạy và học<br/><em>rõ ràng hơn.</em></h1>
        <p className="public-hero-lead">Tạo đề theo chuẩn đầu ra, giao đúng lớp, theo dõi bài làm và tiến độ học tập trong một không gian dành cho giảng viên, sinh viên và nhà trường.</p>
        <div className="public-hero-actions"><button className="public-register-button public-register-large" type="button" onClick={onRegister}>Tạo tài khoản bằng Google <Icon name="arrow" size={17}/></button><a className="public-explore-button" href="#tinh-nang">Khám phá MeoTDC <span>↓</span></a></div>
        <div className="public-hero-foot"><span className="public-check">✓</span><span>Đề thi</span><i/><span>Lớp học</span><i/><span>Khóa học</span><i/><span>Báo cáo</span></div>
      </div>
      <div className="public-hero-visual" aria-hidden="true">
        <div className="public-orbit public-orbit-a"/><div className="public-orbit public-orbit-b"/><div className="public-orbit public-orbit-c"/>
        <div className="public-glass-dashboard">
          <div className="public-dash-top"><span><b className="public-live-dot"/> MEOTDC · TỔNG QUAN</span><span className="public-term-pill">HỌC KỲ I</span></div>
          <div className="public-dash-heading">Không gian<br/><strong>đào tạo TDC</strong></div>
          <div className="public-dash-rows"><div><span className="public-row-icon row-purple"><Icon name="book" size={15}/></span><span><b>Học phần</b><small>Gắn với ngành và lớp</small></span><span className="public-row-arrow">↗</span></div><div><span className="public-row-icon row-teal"><Icon name="clipboard" size={15}/></span><span><b>Đề kiểm tra</b><small>Ma trận theo chuẩn đầu ra</small></span><span className="public-row-arrow">↗</span></div><div><span className="public-row-icon row-amber"><Icon name="chart" size={15}/></span><span><b>Kết quả học tập</b><small>Theo dõi theo từng lớp</small></span><span className="public-row-arrow">↗</span></div></div>
          <div className="public-dash-bottom"><span>QUẢN LÝ ĐÀO TẠO</span><div><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><span>TDC</span></div>
        </div>
        <div className="public-float-card public-float-top"><span className="public-float-icon"><Icon name="spark" size={15}/></span><span><b>Chuẩn đầu ra</b><small>Rõ trong từng ma trận</small></span></div>
        <div className="public-float-card public-float-bottom"><span className="public-float-icon teal-float"><Icon name="users" size={15}/></span><span><b>Đúng người học</b><small>Lớp · MSSV · ngành</small></span></div>
        <div className="public-orbit-dot"/>
      </div>
    </section>
    <div className="public-audience-strip"><span>MEOTDC KẾT NỐI</span><b>Giảng viên</b><i/><b>Sinh viên</b><i/><b>Nhà trường</b><i/><b>Quản trị đào tạo</b></div>
    <section className="public-section" id="tinh-nang">
      <div className="public-section-heading"><div><span className="public-section-kicker">MỘT QUY TRÌNH LIỀN MẠCH</span><h2>Từ câu hỏi đến<br/><em>kết quả học tập.</em></h2></div><p>MeoTDC gom những việc thường ngày của trường vào cùng một luồng làm việc, để mỗi đề, lớp và bài nộp đều gắn với đúng học phần.</p></div>
      <div className="public-feature-grid">
        <article className="public-feature-card feature-purple"><span className="public-feature-icon"><Icon name="layers" size={18}/></span><small>01 · ĐÁNH GIÁ</small><h3>Đề theo ma trận</h3><p>Phân bổ câu theo chủ đề, chuẩn đầu ra và mức độ; kiểm tra quota trước khi xuất bản.</p><a href="#quy-trinh">Xem cách hoạt động <span>↗</span></a></article>
        <article className="public-feature-card feature-teal"><span className="public-feature-icon"><Icon name="users" size={18}/></span><small>02 · LỚP HỌC</small><h3>Danh sách rõ ràng</h3><p>Quản lý lớp theo ngành và học phần; nhập roster, đối chiếu MSSV và gắn email Google.</p><a href="#nha-truong">Dành cho nhà trường <span>↗</span></a></article>
        <article className="public-feature-card feature-amber"><span className="public-feature-icon"><Icon name="book" size={18}/></span><small>03 · HỌC TẬP</small><h3>Bài tập và khóa học</h3><p>Giao bài, nhận tệp, chấm nhận xét và theo dõi tiến độ bài học trong cùng hồ sơ lớp.</p><a href="#quy-trinh">Xem quy trình <span>↗</span></a></article>
        <article className="public-feature-card feature-blue"><span className="public-feature-icon"><Icon name="chart" size={18}/></span><small>04 · BÁO CÁO</small><h3>Tổng hợp theo vai trò</h3><p>Giảng viên xem bài cần chấm; nhà trường theo dõi ngành, lớp, đề và kết quả tổng hợp.</p><a href="#nha-truong">Xem không gian trường <span>↗</span></a></article>
      </div>
    </section>
    <MajorCatalogSection majors={majors}/>
    <section className="public-school-section" id="nha-truong">
      <div className="public-school-copy"><span className="public-section-kicker">ĐIỂM KHÁC BIỆT CHO TDC</span><h2>Không chỉ giao đề.<br/><em>Gắn đề với đào tạo.</em></h2><p>MeoTDC tập trung vào cấu trúc của trường cao đẳng: ngành → học phần → lớp → người học. Ma trận đề có thể đi sâu đến chuẩn đầu ra để giảng viên nhìn rõ nội dung đang đánh giá.</p>
        <ul><li><span>✓</span> Roster lớp có MSSV và email đối chiếu</li><li><span>✓</span> Quota câu hỏi theo chuẩn đầu ra và độ khó</li><li><span>✓</span> Không gian riêng cho giảng viên, sinh viên, nhà trường</li><li><span>✓</span> Bài tập, khóa học và kết quả nằm trong cùng luồng</li></ul>
        <button className="public-school-link" type="button" onClick={onRegister}>Trải nghiệm cổng học tập <Icon name="arrow" size={16}/></button>
      </div>
      <div className="public-school-visual" aria-hidden="true"><div className="public-school-orbit"/><div className="public-school-board"><div className="public-board-head"><span>MEOTDC / TDC</span><span>HỌC PHẦN</span></div><div className="public-board-title">Cơ sở dữ liệu <small>CĐ23 · Học kỳ I</small></div><div className="public-outcome-row"><span>01</span><b>Thiết kế mô hình dữ liệu</b><i>Nhận biết</i></div><div className="public-outcome-row"><span>02</span><b>Truy vấn và chuẩn hóa</b><i>Vận dụng</i></div><div className="public-outcome-row"><span>03</span><b>Đánh giá chuẩn đầu ra</b><i>Thông hiểu</i></div><div className="public-board-footer"><span>MA TRẬN ĐỀ</span><span>CHỦ ĐỀ × CHUẨN ĐẦU RA × MỨC ĐỘ</span></div></div><div className="public-school-chip"><Icon name="spark" size={14}/> Thiết kế theo chương trình TDC</div></div>
    </section>
    <section className="public-workflow-section" id="quy-trinh"><div className="public-workflow-heading"><span className="public-section-kicker">NHẸ NHÀNG CHO TỪNG VAI TRÒ</span><h2>Một vòng học tập,<br/><em>có đầu có cuối.</em></h2></div><div className="public-workflow">
      <article><span>01</span><div className="workflow-icon"><Icon name="layers" size={18}/></div><b>Soạn</b><small>Tạo đề, bài tập hoặc bài học</small></article><i className="workflow-connector">→</i><article><span>02</span><div className="workflow-icon"><Icon name="users" size={18}/></div><b>Giao</b><small>Chọn lớp hoặc người học</small></article><i className="workflow-connector">→</i><article><span>03</span><div className="workflow-icon"><Icon name="clipboard" size={18}/></div><b>Thực hiện</b><small>Làm bài và nộp sản phẩm</small></article><i className="workflow-connector">→</i><article><span>04</span><div className="workflow-icon"><Icon name="chart" size={18}/></div><b>Phản hồi</b><small>Chấm, nhận xét, xem tiến độ</small></article>
    </div></section>
    <section className="public-security-strip"><div className="public-security-icon"><Icon name="settings" size={20}/></div><div><b>Quyền truy cập theo vai trò</b><span>Google xác minh email; quyền sinh viên production cần khớp roster, quyền giảng viên và nhà trường được giới hạn phía API.</span></div><span className="security-badge">MEOTDC · TDC</span></section>
    <section className="public-cta"><span className="public-section-kicker">BẮT ĐẦU CÙNG MEOTDC</span><h2>Mở một không gian<br/>học tập rõ ràng hơn.</h2><p>Đăng nhập để vào lớp học hoặc tạo hồ sơ sinh viên bằng tài khoản Google.</p><div><button className="public-register-button public-register-large" type="button" onClick={onRegister}>Đăng ký với Google <Icon name="arrow" size={17}/></button><button className="public-cta-login" type="button" onClick={onLogin}>Tôi đã có tài khoản</button></div></section>
    <footer className="public-footer"><a className="public-brand" href="#home"><span className="brand-mark"><span className="brand-dot"/><span className="brand-ear brand-ear-left"/><span className="brand-ear brand-ear-right"/></span><span className="brand-word">Meo<span>TDC</span></span></a><span>Học tập · Đánh giá · Tiến bộ</span><span>© 2026 MeoTDC · Cổng trải nghiệm TDC</span></footer>
  </main>;
}

function MajorCatalogSection({ majors }: { majors: Major[] }) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("Tất cả trình độ");
  const [group, setGroup] = useState("Tất cả nhóm ngành");
  const groups = useMemo(() => [...new Set(majors.map((major) => major.group))], [majors]);
  const filteredMajors = useMemo(() => majors.filter((major) => {
    const matchesText = (major.name + " " + major.group).toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi"));
    return matchesText && (level === "Tất cả trình độ" || major.level === level) && (group === "Tất cả nhóm ngành" || major.group === group);
  }), [group, level, majors, query]);
  return <section className="major-catalog-section" id="nganh-dao-tao">
    <div className="public-section-heading major-catalog-heading"><div><span className="public-section-kicker">BẢN ĐỒ NGÀNH HỌC TDC</span><h2>Chọn đúng ngành,<br/><em>mở đúng hành trình.</em></h2></div><p>Khám phá danh mục Cao đẳng và Trung cấp cùng các nguồn tham khảo chính thức. Thẻ ngành dùng hình khối 3D nhẹ, tối ưu cho cả máy tính và điện thoại.</p></div>
    <div className="major-catalog-controls"><label className="major-catalog-search"><span aria-hidden="true">⌕</span><span className="sr-only">Tìm ngành hoặc khoa</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm ngành, lĩnh vực hoặc khoa…"/></label><label className="major-catalog-select"><span className="sr-only">Lọc trình độ</span><select value={level} onChange={(event) => setLevel(event.target.value)}><option>Tất cả trình độ</option><option>Cao đẳng</option><option>Trung cấp</option></select></label><label className="major-catalog-select group-select"><span className="sr-only">Lọc nhóm ngành</span><select value={group} onChange={(event) => setGroup(event.target.value)}><option>Tất cả nhóm ngành</option>{groups.map((item) => <option key={item}>{item}</option>)}</select></label><span className="major-result-count">{filteredMajors.length} / {majors.length} ngành</span></div>
    <div className="major-catalog-grid">{filteredMajors.map((major, index) => {
      const art = major.group.includes("Kỹ thuật") ? "tech" : major.group.includes("du lịch") ? "service" : major.id === "design" ? "creative" : "business";
      return <article className={"major-catalog-card major-art-" + art} key={major.id}>
        <div className="major-card-art" aria-hidden="true"><img className="major-card-image" src={`/images/majors/${art}.svg`} alt="" loading="lazy"/><span className="major-art-orbit orbit-back"/><span className="major-art-orbit orbit-front"/><span className="major-art-cube"><i/><i/><i/></span><b>{String(index + 1).padStart(2, "0")}</b></div>
        <div className="major-card-meta"><span>{major.level}</span>{major.recruitment2026 && <span className="major-current-badge">FIT · 2026</span>}</div>
        <h3>{major.name}</h3><p className="major-card-group">{major.group}</p>
        <details className="major-card-resources"><summary><span>Tài liệu tham khảo TDC</span><span>{major.resources?.length || 0} nguồn&nbsp;＋</span></summary><div className="major-resource-list">{major.resources?.map((resource) => <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer"><span className="major-resource-icon">↗</span><span><b>{resource.title}</b><small>{resource.year} · {resource.description}</small></span></a>)}<p>Nguồn để tra cứu danh mục/ngữ cảnh đào tạo; đề cương chi tiết từng ngành cần lấy từ khoa hoặc cổng đào tạo TDC.</p></div></details>
      </article>;
    })}{filteredMajors.length === 0 && <div className="major-catalog-empty"><strong>Chưa tìm thấy ngành phù hợp</strong><span>Thử từ khóa khác hoặc chọn nhóm ngành khác.</span></div>}</div>
    <div className="major-catalog-note"><span>✦</span><p><strong>Minh bạch nguồn dữ liệu.</strong> Danh mục ngành tham chiếu thông báo học phí TDC 2025–2026; sổ tay học vụ là tài liệu 2024–2025. Chương trình FIT có nguồn 2026 riêng. Đây không phải danh mục tuyển sinh chính thức hoặc bộ đề cương học phần hoàn chỉnh.</p></div>
  </section>;
}
function LoginPage({ accounts, majors, googleClientId, apiReady, error, loading, onLogin, onGoogleLogin }: { accounts: DemoAccount[]; majors: Major[]; googleClientId: string; apiReady: boolean; error: string; loading: boolean; onLogin: (username: string, password: string, major?: string) => void; onGoogleLogin: (credential: string, nonce: string) => Promise<boolean> }) {
  const [view, setView] = useState<"home" | "login" | "register">("home");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [major, setMajor] = useState("Công nghệ thông tin");
  const [googleStatus, setGoogleStatus] = useState<"checking" | "missing-client" | "ready">("checking");
  const [googleOrigin, setGoogleOrigin] = useState("");
  const googleEnabled = googleStatus === "ready";
  const demoDetailsRef = useRef<HTMLDetailsElement>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleCallbackRef = useRef(onGoogleLogin);
  const googleInitializedRef = useRef(false);
  googleCallbackRef.current = onGoogleLogin;

  useEffect(() => {
    setGoogleOrigin(window.location.origin);
    setGoogleStatus(googleClientId ? "ready" : "missing-client");
  }, [googleClientId]);

  useEffect(() => {
    if (view === "home" || !googleEnabled) return;
    let initialized = false;
    const renderGoogleButton = (rotateNonce = false) => {
      if ((!rotateNonce && initialized) || !window.google || !googleButtonRef.current) return;
      initialized = true;
      googleButtonRef.current.replaceChildren();
      if (!googleInitializedRef.current || rotateNonce) {
        const nonce = window.crypto.randomUUID() + window.crypto.randomUUID();
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          nonce,
          callback: (response) => {
            void googleCallbackRef.current(response.credential, nonce).then((success) => {
              if (!success) renderGoogleButton(true);
            }).catch(() => renderGoogleButton(true));
          },
        });
        googleInitializedRef.current = true;
      }
      window.google.accounts.id.renderButton(googleButtonRef.current, { theme: "outline", size: "large", text: view === "register" ? "signup_with" : "signin_with", shape: "rectangular", width: Math.min(380, googleButtonRef.current.clientWidth || 380), logo_alignment: "left", locale: "vi" });
    };
    const onGoogleReady = () => renderGoogleButton();
    renderGoogleButton();
    window.addEventListener("meotdc-google-ready", onGoogleReady);
    return () => window.removeEventListener("meotdc-google-ready", onGoogleReady);
  }, [view, googleEnabled, googleClientId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onLogin(username, password, major);
  }

  function chooseAccount(account: DemoAccount) {
    setUsername(account.username);
    setPassword(demoPassword);
    setShowPassword(false);
    if (demoDetailsRef.current) demoDetailsRef.current.open = false;
    if (account.major) setMajor(account.major);
  }

  const currentRole = accounts.find((account) => account.username === username)?.role;
  if (view === "home") return <PublicLanding majors={majors} onLogin={() => setView("login")} onRegister={() => setView("register")}/>;

  return <main className="login-shell">
    <section className="login-brand-panel">
      <a className="login-brand" href="#" onClick={(event) => { event.preventDefault(); setView("home"); }}><span className="brand-mark"><span className="brand-dot"/><span className="brand-ear brand-ear-left"/><span className="brand-ear brand-ear-right"/></span><span className="brand-word">Meo<span>TDC</span></span></a>
      <div className="login-brand-copy"><span className="login-kicker">KHÔNG GIAN HỌC TẬP SỐ</span><h1>{view === "register" ? <>Bắt đầu hành trình<br/><em>học tập số.</em></> : <>Một nơi học tập,<br/><em>nhiều cơ hội</em> tiến bộ.</>}</h1><p>{view === "register" ? "Google xác minh email; quyền sinh viên ở môi trường trường học được đối chiếu với roster." : "Thi trực tuyến, giao bài và theo dõi khóa học dành cho cộng đồng TDC."}</p></div>
      <div className="login-brand-footer"><span className="brand-seal">TDC</span><span>Cao đẳng Công nghệ Thủ Đức</span></div>
      <div className="login-orb login-orb-one"/><div className="login-orb login-orb-two"/>
    </section>
    <section className="login-main"><div className="auth-back-row"><button type="button" onClick={() => setView("home")}>← Trang giới thiệu</button><span>Cổng học tập TDC</span></div><div className="login-card page-scene" key={view}>
      <div className="login-mobile-brand"><span className="brand-mark"><span className="brand-dot"/><span className="brand-ear brand-ear-left"/><span className="brand-ear brand-ear-right"/></span><span className="brand-word">Meo<span>TDC</span></span></div>
      <div className="eyebrow">{view === "register" ? "TÀI KHOẢN SINH VIÊN TDC" : "CHÀO MỪNG BẠN TRỞ LẠI"}</div><h2>{view === "register" ? "Đăng ký bằng Google" : "Đăng nhập"}</h2><p className="login-subtitle">{view === "register" ? "Google xác minh email; để dự thi ở môi trường chính thức, email cần có trong roster do trường cấp." : "Đăng nhập để tiếp tục với lớp học, bài tập và kết quả."}</p>
      {view === "login" ? <>
        <form className="login-form" onSubmit={submit}>
          <label className="form-field"><span>Tên đăng nhập</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Nhập tên đăng nhập" required/></label>
          <label className="form-field"><span>Mật khẩu</span><div className="password-input-wrap"><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Nhập mật khẩu" required/><button className="password-visibility" type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "Ẩn" : "Hiện"}</button></div></label>
          {currentRole === "student" && <label className="form-field"><span>Ngành học muốn xem</span><select value={major} onChange={(event) => setMajor(event.target.value)}>{majors.map((item) => <option key={item.id} value={item.name}>{item.name} · {item.level}</option>)}</select></label>}
          {!apiReady && <div className="login-alert">API chưa chạy. Hãy khởi động bằng <code>pnpm dev</code> trong thư mục MeoTDC.</div>}
          {error && <div className="login-alert" role="alert">{error}</div>}
          <button className="button button-primary login-submit" type="submit" disabled={loading || !apiReady}>{loading ? "Đang đăng nhập…" : "Đăng nhập"}<Icon name="arrow" size={16}/></button>
        </form>
        <p className="auth-switch-line">Chưa có hồ sơ sinh viên? <button type="button" onClick={() => setView("register")}>Tạo tài khoản</button></p>
      </> : <>
        <div className="signup-role-card"><span className="signup-role-icon"><Icon name="users" size={18}/></span><span><strong>Dành cho sinh viên</strong><small>Email Google đã có trong roster được nối với lớp; môi trường chính thức từ chối email chưa được cấp quyền.</small></span></div>
        <div className="signup-access-note"><b>Giảng viên và nhà trường</b><span>Hãy đăng nhập bằng tài khoản do trường cấp.</span></div>
        {!apiReady && <div className="login-alert">Dịch vụ đăng nhập chưa sẵn sàng. Hãy thử lại sau.</div>}
        {error && <div className="login-alert" role="alert">{error}</div>}
      </>}
      <div className="google-login-section">
        <div className="auth-divider"><span>{view === "register" ? "ĐĂNG KÝ BẰNG GOOGLE" : "HOẶC ĐĂNG NHẬP BẰNG GOOGLE"}</span></div>
        {googleEnabled ? <><div className={"google-button-slot " + (!apiReady || loading ? "disabled" : "")} ref={googleButtonRef}/><p className="google-auth-note">Google xác minh tài khoản; MeoTDC không nhận hay lưu mật khẩu Gmail. Origin hiện tại: <code>{googleOrigin}</code>. Origin này cần có trong Authorized JavaScript origins của <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Google Web Client</a>.</p><Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => { window.dispatchEvent(new Event("meotdc-google-ready")); }}/></> : <div className="google-setup-note"><strong>Google chưa được cấu hình</strong><span>Thiếu GOOGLE_CLIENT_ID trong API hoặc giao diện. Dùng cùng Web Client ID ở cả hai nơi; client secret không được đưa vào trình duyệt.</span></div>}
      </div>
      {view === "register" && <p className="auth-switch-line">Đã có tài khoản? <button type="button" onClick={() => setView("login")}>Đăng nhập</button></p>}
      {view === "login" && demoMode && <details ref={demoDetailsRef} className="login-demo"><summary><span className="login-demo-meta"><strong>Thử với tài khoản demo</strong><small>Chọn vai trò để điền nhanh thông tin đăng nhập.</small></span><span className="login-demo-count">{accounts.length} vai trò <i aria-hidden="true">⌄</i></span></summary><div className="demo-accounts-grid">{accounts.map((account) => <button key={account.id} type="button" aria-pressed={username === account.username} className={"demo-account " + (username === account.username ? "selected" : "")} onClick={() => chooseAccount(account)}><span className="demo-account-avatar">{initials(account.fullName)}</span><span><strong>{roleNames[account.role]}</strong><small>{account.username}</small></span><span className="demo-select-mark">✓</span></button>)}</div><div className="demo-password-note"><span aria-hidden="true">ⓘ</span><p><strong>Mật khẩu dùng thử:</strong> <code>{demoPassword}</code><br/>Dữ liệu mô phỏng, không phải tài khoản TDC thật.</p></div></details>}
    </div><footer className="login-footer">© 2026 MeoTDC · Cổng học tập TDC</footer></section>
  </main>;
}
function StudentWorkspace({ user, majors, onLogout }: { user: MeoUser; majors: Major[]; onLogout: () => void }) {
  const activeExamKey = `meotdc:active-exam:${user.id}`;
  const activeQuestionIdsKey = `meotdc:active-question-ids:${user.id}`;
  const activeCandidateKey = `active-candidate:${user.id}`;
  const [active, setActive] = useState<"Tổng quan" | "Đề thi" | "Bài tập" | "Khóa học" | "Kết quả">("Tổng quan");
  const [examSearch, setExamSearch] = useState("");
  const [examFilter, setExamFilter] = useState<"all" | "unfinished" | "completed" | "expired">("all");
  useEffect(() => { document.title = `${active === "Tổng quan" ? "Cá nhân" : active} · MeoTDC`; return () => { document.title = "MeoTDC — Cổng học tập số TDC"; }; }, [active]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [assignments, setAssignments] = useState<DemoAssignment[]>([]);
  const [attempts, setAttempts] = useState<DemoAttempt[]>([]);
  const [submissions, setSubmissions] = useState<DemoSubmission[]>([]);
  const [courses, setCourses] = useState<DemoCourse[]>([]);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [candidateExam, setCandidateExam] = useState<Exam | null>(null);
  const [candidateIdentity, setCandidateIdentity] = useState<CandidateIdentity>(() => ({ fullName: user.fullName, studentCode: user.studentCode || "", major: user.major || "" }));
  const [activeCandidate, setActiveCandidate] = useState<CandidateIdentity | null>(null);
  const [candidateError, setCandidateError] = useState("");
  const [candidatePassword, setCandidatePassword] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [serverAttemptId, setServerAttemptId] = useState<string | null>(null);
  const [serverAttemptToken, setServerAttemptToken] = useState<string | null>(null);
  const [serverDeadlineAt, setServerDeadlineAt] = useState<string | null>(null);
  const answerSequences = useRef<Record<string, number>>({});
  const answerSaveTimers = useRef<Record<string, number>>({});
  const answerSyncing = useRef(new Set<string>());
  const [integrityEvents, setIntegrityEvents] = useState<ExamIntegrityEvent[]>([]);
  const [examHasFocus, setExamHasFocus] = useState(true);
  const [examFullscreen, setExamFullscreen] = useState(false);
  const integrityEventsRef = useRef<ExamIntegrityEvent[]>([]);
  const focusLostEpisode = useRef(false);
  const fullscreenWasUsed = useRef(false);
  const submitExamRef = useRef<(reason?: DemoAttempt["submissionReason"]) => void>(() => undefined);
  const [result, setResult] = useState<DemoAttempt | null>(null);
  const [notice, setNotice] = useState("");
  const [submissionBusy, setSubmissionBusy] = useState(false);
  const submittedCurrentAttempt = useRef(false);

  useEffect(() => {
    const savedExams = readDemoData<Exam[] | null>("exams", null) || seedDemoExams();
    setExams(savedExams);
    setAssignments(readDemoData("assignments", seedAssignments));
    setAttempts(readDemoData("attempts", []));
    setSubmissions(readDemoData("submissions", seedSubmissions));
    setCourses(readDemoData("courses", seedCourses));
    const legacyExamId = window.localStorage.getItem("meotdc:active-exam");
    if (legacyExamId && !window.localStorage.getItem(activeExamKey) && window.localStorage.getItem(`meotdc:server-attempt-token:${user.id}:${legacyExamId}`)) window.localStorage.setItem(activeExamKey, legacyExamId);
    window.localStorage.removeItem("meotdc:active-exam");
    window.localStorage.removeItem("meotdc:active-question-ids");
    window.localStorage.removeItem("meotdc:active-candidate");
    const activeExamId = window.localStorage.getItem(activeExamKey);
    if (activeExamId) {
      const resume = savedExams.find((exam) => exam.id === activeExamId);
      if (resume) {
        let activeQuestionIds: string[] = [];
        try { activeQuestionIds = JSON.parse(window.localStorage.getItem(activeQuestionIdsKey) || "[]") as string[]; } catch { activeQuestionIds = []; }
        const questions = activeQuestionIds.length ? (resume.questions || []).filter((question) => activeQuestionIds.includes(question.id)) : resume.questions;
        setActiveExam({ ...resume, strictIntegrity: resume.strictIntegrity !== false, questions });
        const serverId = window.localStorage.getItem(`meotdc:server-attempt-id:${user.id}:${resume.id}`);
        const serverToken = window.localStorage.getItem(`meotdc:server-attempt-token:${user.id}:${resume.id}`);
        const savedDeadline = window.localStorage.getItem(`meotdc:server-deadline:${user.id}:${resume.id}`);
        setServerAttemptId(serverId);
        setServerAttemptToken(serverToken);
        setServerDeadlineAt(savedDeadline);
        setActiveCandidate(readDemoData<CandidateIdentity | null>(activeCandidateKey, null) || { fullName: user.fullName, studentCode: user.studentCode || "", major: user.major || "" });
        setAnswers(readDemoData(`answers:${user.id}:${resume.id}`, {}));
        const savedIntegrity = readDemoData<ExamIntegrityEvent[]>("integrity:" + user.id + ":" + resume.id, []);
        integrityEventsRef.current = savedIntegrity;
        setIntegrityEvents(savedIntegrity);
        fullscreenWasUsed.current = window.localStorage.getItem(`meotdc:fullscreen-used:${user.id}:${resume.id}`) === "true";
        submittedCurrentAttempt.current = false;
        setSecondsLeft((resume.durationMinutes || 30) * 60);
        if (serverId && serverToken) fetch(`/api/v1/exam-attempts/${serverId}`, { headers: { "x-meotdc-attempt-token": serverToken } }).then(async (response) => {
          if (!response.ok) return;
          const payload = await response.json();
          const saved = payload.attempt;
          if (saved?.status === "in_progress") {
            setAnswers({ ...(saved.answers || {}), ...readDemoData<Record<string, string | string[]>>(`answers:${user.id}:${resume.id}`, {}) });
            setIntegrityEvents(saved.integrityEvents || []);
            integrityEventsRef.current = saved.integrityEvents || [];
            setServerDeadlineAt(saved.deadlineAt);
            window.localStorage.setItem(`meotdc:server-deadline:${user.id}:${resume.id}`, saved.deadlineAt);
          }
        }).catch(() => undefined);
      }
    }
    if (!readDemoData<DemoCourse[] | null>("courses", null)) writeDemoData("courses", seedCourses);
    const refresh = () => {
      setExams(readDemoData("exams", seedDemoExams()));
      setAssignments(readDemoData("assignments", seedAssignments));
      setAttempts(readDemoData("attempts", []));
      setSubmissions(readDemoData("submissions", seedSubmissions));
      setCourses(readDemoData("courses", seedCourses));
    };
    window.addEventListener(demoStorageEvent, refresh);
    return () => window.removeEventListener(demoStorageEvent, refresh);
  }, [user.id]);

  useEffect(() => {
    let alive = true;
    const refreshServerData = async () => {
      try {
        const [examResponse, attemptResponse, assignmentResponse, courseResponse] = await Promise.all([fetch("/api/v1/exams"), fetch("/api/v1/exam-attempts"), fetch("/api/v1/assignments"), fetch("/api/v1/courses")]);
        const remoteExams = examResponse.ok ? await examResponse.json() as Exam[] : [];
        const remoteAttempts = attemptResponse.ok ? await attemptResponse.json() as DemoAttempt[] : [];
        if (!alive) return;
        if (examResponse.ok) setExams(mergeExamLists(readDemoData<Exam[]>("exams", seedDemoExams()), remoteExams));
        if (attemptResponse.ok) {
          setAttempts((current) => [...new Map([...current.filter((attempt) => !attempt.serverAttemptId), ...remoteAttempts].map((attempt) => [attempt.id, attempt])).values()]);
          setResult((current) => current?.serverAttemptId ? remoteAttempts.find((attempt) => attempt.id === current.id) || current : current);
        }
        if (!demoMode && assignmentResponse.ok) {
          const remote = await assignmentResponse.json() as LearningData;
          setAssignments(remote.assignments);
          setSubmissions(remote.submissions);
        }
        if (courseResponse.ok) {
          const remoteCourses = await courseResponse.json() as DemoCourse[];
          setCourses(demoMode ? mergeCourseLists(readDemoData("courses", seedCourses), remoteCourses) : remoteCourses);
        }
      } catch { /* Keep the latest local state if the API is temporarily unavailable. */ }
    };
    void refreshServerData();
    const timer = window.setInterval(() => { void refreshServerData(); }, 15_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!activeExam) return;
    const integrityKey = "meotdc:integrity:" + user.id + ":" + activeExam.id;
    const strictMode = activeExam.strictIntegrity !== false;
    const saved = readDemoData<ExamIntegrityEvent[]>("integrity:" + user.id + ":" + activeExam.id, []);
    integrityEventsRef.current = saved; setIntegrityEvents(saved); focusLostEpisode.current = false;
    setExamFullscreen(Boolean(document.fullscreenElement)); setExamHasFocus(document.visibilityState === "visible" && document.hasFocus());
    const record = (kind: ExamIntegrityKind, allowAutoSubmit = true) => {
      if (submittedCurrentAttempt.current) return;
      const lastEvent = integrityEventsRef.current[integrityEventsRef.current.length - 1];
      if (["copy-attempt", "cut-attempt", "paste-attempt", "print-attempt"].includes(kind) && lastEvent?.kind === kind && Date.now() - Date.parse(lastEvent.at) < 1200) return;
      const next = [...integrityEventsRef.current, { kind, at: new Date().toISOString() }].slice(-100);
      integrityEventsRef.current = next;
      setIntegrityEvents(next);
      window.localStorage.setItem(integrityKey, JSON.stringify(next));
      if (serverAttemptId && serverAttemptToken && kind !== "fullscreen-exit") void fetch(`/api/v1/exam-attempts/${serverAttemptId}/integrity-events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: serverAttemptToken, kind, clientAt: new Date().toISOString() }) }).catch(() => undefined);
      if (kind === "fullscreen-exit") {
        setNotice("Đã thoát toàn màn hình. Bài thi đang được tự nộp.");
        submitExamRef.current("fullscreen-exit");
        return;
      }
      if (strictMode && allowAutoSubmit && integrityStrikeCount(next) >= maxIntegrityStrikes) {
        setNotice("Đã ghi nhận 3 đợt vi phạm quy tắc thi. Bài được tự nộp để giảng viên rà soát.");
        submitExamRef.current("integrity-threshold");
      }
    };
    const lostFocus = () => { setExamHasFocus(false); if (!focusLostEpisode.current) { focusLostEpisode.current = true; record("focus-loss"); } };
    const regainedFocus = () => { if (document.visibilityState === "visible" && document.hasFocus()) { focusLostEpisode.current = false; setExamHasFocus(true); } };
    const visibilityChanged = () => document.hidden ? lostFocus() : regainedFocus();
    const fullscreenChanged = () => { const enabled = Boolean(document.fullscreenElement); setExamFullscreen(enabled); if (!enabled && fullscreenWasUsed.current) record("fullscreen-exit"); };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (strictMode) record("leave-attempt", false); event.preventDefault(); event.returnValue = ""; };
    const blockAction = (event: Event, kind: ExamIntegrityKind) => { if (!strictMode) return; event.preventDefault(); record(kind); };
    const blockCopy = (event: Event) => blockAction(event, "copy-attempt");
    const blockCut = (event: Event) => blockAction(event, "cut-attempt");
    const blockPaste = (event: Event) => blockAction(event, "paste-attempt");
    const blockContextMenu = (event: Event) => blockAction(event, "context-menu");
    const blockShortcut = (event: KeyboardEvent) => {
      if (!strictMode || event.repeat) return;
      const key = event.key.toLowerCase();
      const command = event.ctrlKey || event.metaKey;
      const blocked = key === "printscreen" || key === "f12" || (command && ["a", "c", "x", "v", "p", "s", "u", "r"].includes(key)) || (command && event.shiftKey && ["i", "j", "c"].includes(key)) || (event.altKey && key === "arrowleft");
      if (!blocked) return;
      event.preventDefault();
      const kind: ExamIntegrityKind = key === "c" ? "copy-attempt" : key === "x" ? "cut-attempt" : key === "v" ? "paste-attempt" : key === "p" || key === "printscreen" ? "print-attempt" : "shortcut-attempt";
      record(kind);
    };
    window.addEventListener("blur", lostFocus); window.addEventListener("focus", regainedFocus); window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", visibilityChanged); document.addEventListener("fullscreenchange", fullscreenChanged);
    document.addEventListener("keydown", blockShortcut, true);
    document.addEventListener("copy", blockCopy, true);
    document.addEventListener("cut", blockCut, true);
    document.addEventListener("paste", blockPaste, true);
    document.addEventListener("contextmenu", blockContextMenu, true);
    const beforePrint = (event: Event) => blockAction(event, "print-attempt");
    window.addEventListener("beforeprint", beforePrint);
    return () => { window.removeEventListener("blur", lostFocus); window.removeEventListener("focus", regainedFocus); window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("visibilitychange", visibilityChanged); document.removeEventListener("fullscreenchange", fullscreenChanged); document.removeEventListener("keydown", blockShortcut, true); document.removeEventListener("copy", blockCopy, true); document.removeEventListener("cut", blockCut, true); document.removeEventListener("paste", blockPaste, true); document.removeEventListener("contextmenu", blockContextMenu, true); window.removeEventListener("beforeprint", beforePrint); };
  }, [activeExam?.id, activeExam?.strictIntegrity, user.id, serverAttemptId, serverAttemptToken]);
  useEffect(() => {
    if (activeExam && activeExam.strictIntegrity !== false && integrityStrikeCount(integrityEvents) >= maxIntegrityStrikes) {
      submitExamRef.current("integrity-threshold");
    }
  }, [activeExam, integrityEvents]);
  useEffect(() => {
    if (!activeExam) return;
    const durationMs = (activeExam.durationMinutes || 30) * 60 * 1000;
    const storageKey = `meotdc:exam-start:${user.id}:${activeExam.id}`;
    let startedAt = Number(window.localStorage.getItem(storageKey));
    if (!startedAt) { startedAt = Date.now(); window.localStorage.setItem(storageKey, String(startedAt)); }
    const deadlineAt = serverDeadlineAt ? Date.parse(serverDeadlineAt) : startedAt + durationMs;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [activeExam, serverDeadlineAt, user.id]);

  useEffect(() => {
    if (!activeExam || !serverAttemptId || !serverAttemptToken) return;
    const heartbeat = () => { void fetch(`/api/v1/exam-attempts/${serverAttemptId}/heartbeat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: serverAttemptToken, isFocused: document.visibilityState === "visible" && document.hasFocus(), isFullscreen: Boolean(document.fullscreenElement) }) }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json();
      if (payload.status !== "in_progress") submitExamRef.current(payload.status === "expired" ? "time-limit" : payload.strikeCount >= maxIntegrityStrikes ? "integrity-threshold" : "student");
    }).catch(() => undefined); };
    heartbeat();
    const timer = window.setInterval(heartbeat, 12_000);
    return () => window.clearInterval(timer);
  }, [activeExam?.id, serverAttemptId, serverAttemptToken]);

  useEffect(() => {
    if (!serverAttemptId || !serverAttemptToken) return;
    let alive = true;
    const syncQueuedAnswers = () => { void flushQueuedExamAnswers(user.id, serverAttemptId, serverAttemptToken); };
    void listQueuedExamAnswers(user.id, serverAttemptId).then((queued) => {
      if (!alive || !queued.length) return;
      setAnswers((current) => ({ ...current, ...Object.fromEntries(queued.map((item) => [item.questionId, item.answer])) }));
      syncQueuedAnswers();
    }).catch(() => setNotice("Không mở được hàng đợi tự lưu ngoại tuyến; bản trả lời trên máy vẫn còn."));
    window.addEventListener("online", syncQueuedAnswers);
    const retryTimer = window.setInterval(syncQueuedAnswers, 5000);
    return () => { alive = false; window.removeEventListener("online", syncQueuedAnswers); window.clearInterval(retryTimer); };
  }, [user.id, serverAttemptId, serverAttemptToken]);

  useEffect(() => {
    if (activeExam && secondsLeft === 0) submitExam("time-limit");
  }, [activeExam, secondsLeft, answers, user.id]);

  async function toggleExamFullscreen() {
    if (document.fullscreenElement) return;
    try { await document.documentElement.requestFullscreen(); fullscreenWasUsed.current = true; if (activeExam) window.localStorage.setItem(`meotdc:fullscreen-used:${user.id}:${activeExam.id}`, "true"); }
    catch { fullscreenWasUsed.current = false; setNotice("Trình duyệt này chưa cho phép chế độ toàn màn hình."); }
  }

  function openCandidateForm(exam: Exam) {
    const priorAttempts = attempts.filter((attempt) => attempt.examId === exam.id && attempt.studentId === user.id);
    const existingAttempt = priorAttempts[priorAttempts.length - 1];
    if (existingAttempt && priorAttempts.length >= (exam.attemptsAllowed || 1)) { setResult(existingAttempt); setActive("Kết quả"); return; }
    if (exam.opensAt && Date.now() < new Date(exam.opensAt).getTime()) { setNotice(`Đề sẽ mở lúc ${formatDate(exam.opensAt)}.`); return; }
    if (new Date(exam.dueAt).getTime() < Date.now()) { setNotice("Đã hết hạn nhận bài thi này."); return; }
    setCandidateIdentity({ fullName: user.fullName, studentCode: user.studentCode || "", major: user.major || majors[0]?.name || "", extra: {} });
    setCandidateError("");
    setCandidatePassword("");
    setCandidateExam(exam);
  }

  function beginExam(exam: Exam, identity: CandidateIdentity, startedFullscreen = false, serverSession?: ServerExamSession) {
    const priorAttempts = attempts.filter((attempt) => attempt.examId === exam.id && attempt.studentId === user.id);
    setResult(null);
    const initialEvents = serverSession?.integrityEvents || [];
    window.localStorage.setItem("meotdc:integrity:" + user.id + ":" + exam.id, JSON.stringify(initialEvents));
    integrityEventsRef.current = initialEvents; setIntegrityEvents(initialEvents); focusLostEpisode.current = false; fullscreenWasUsed.current = startedFullscreen; setExamHasFocus(true); setExamFullscreen(startedFullscreen);
    if (startedFullscreen) window.localStorage.setItem(`meotdc:fullscreen-used:${user.id}:${exam.id}`, "true");
    else window.localStorage.removeItem(`meotdc:fullscreen-used:${user.id}:${exam.id}`);
    setActiveCandidate(identity);
    setAnswers(serverSession?.answers || (priorAttempts.length ? {} : readDemoData(`answers:${user.id}:${exam.id}`, {})));
    submittedCurrentAttempt.current = false;
    setSecondsLeft(serverSession ? Math.max(0, Math.ceil((Date.parse(serverSession.deadlineAt) - Date.now()) / 1000)) : (exam.durationMinutes || 30) * 60);
    setServerAttemptId(serverSession?.attemptId || null);
    setServerAttemptToken(serverSession?.attemptToken || null);
    setServerDeadlineAt(serverSession?.deadlineAt || null);
    answerSequences.current = {};
    if (serverSession) {
      window.localStorage.setItem(`meotdc:server-attempt-id:${user.id}:${exam.id}`, serverSession.attemptId);
      window.localStorage.setItem(`meotdc:server-attempt-token:${user.id}:${exam.id}`, serverSession.attemptToken);
      window.localStorage.setItem(`meotdc:server-deadline:${user.id}:${exam.id}`, serverSession.deadlineAt);
    }
    const questionPool = (exam.questions || []).map((question) => ({ ...question }));
    const randomQuestionCount = exam.randomQuestionCount || 0;
    const attemptQuestions = serverSession ? serverSession.questions : randomQuestionCount > 0 && randomQuestionCount < questionPool.length
      ? sampleQuestionMatrix(questionPool, randomQuestionCount, exam.matrixQuotas)
      : questionPool;
    if (exam.shuffleQuestions) {
      for (let index = attemptQuestions.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [attemptQuestions[index], attemptQuestions[swap]] = [attemptQuestions[swap], attemptQuestions[index]];
      }
    }
    const examForAttempt = { ...exam, strictIntegrity: exam.strictIntegrity !== false, questions: attemptQuestions };
    window.localStorage.setItem(activeExamKey, exam.id);
    window.localStorage.setItem(activeQuestionIdsKey, JSON.stringify(attemptQuestions.map((question) => question.id)));
    writeDemoData(activeCandidateKey, identity);
    setActiveExam(examForAttempt);
    setCandidateExam(null);
  }

  async function confirmCandidateIdentity() {
    if (!candidateExam) return;
    if (candidateExam.opensAt && Date.now() < new Date(candidateExam.opensAt).getTime()) { setCandidateError("Đề chưa đến giờ mở."); return; }
    if (Date.now() >= new Date(candidateExam.dueAt).getTime()) { setCandidateError("Đề đã đóng, không thể bắt đầu lượt thi mới."); return; }
    if (candidateExam.accessPassword && candidatePassword.trim() !== candidateExam.accessPassword) { setCandidateError("Mật khẩu đề chưa đúng."); return; }
    if (candidateIdentity.fullName.trim().length < 2 || !candidateIdentity.studentCode.trim() || !candidateIdentity.major) {
      setCandidateError("Hãy nhập họ tên, MSSV và chọn ngành trước khi bắt đầu.");
      return;
    }
    const missingField = (candidateExam.candidateFields || []).find((field) => !candidateIdentity.extra?.[field]?.trim());
    if (missingField) { setCandidateError(`Vui lòng nhập thông tin “${missingField}”.`); return; }
    let startedFullscreen = Boolean(document.fullscreenElement);
    if (!startedFullscreen) {
      if (!document.documentElement.requestFullscreen) { setCandidateError("Trình duyệt không hỗ trợ toàn màn hình; không thể bắt đầu bài thi."); return; }
      try { await document.documentElement.requestFullscreen(); startedFullscreen = Boolean(document.fullscreenElement); }
      catch { setCandidateError("Hãy cho phép chế độ toàn màn hình để bắt đầu bài thi này."); return; }
    }
    if (!startedFullscreen) { setCandidateError("Hãy bật toàn màn hình trước khi bắt đầu bài thi."); return; }
    let serverSession: ServerExamSession | undefined;
    if (candidateExam.serverBacked) {
      try {
        const response = await fetch("/api/v1/exam-attempts/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examId: candidateExam.id, accessPassword: candidatePassword, candidateDetails: candidateIdentity.extra || {}, fullscreenUsed: startedFullscreen }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "Máy chủ không cho phép bắt đầu lượt thi.");
        serverSession = payload as ServerExamSession;
      } catch (error) {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        setCandidateError(error instanceof Error ? error.message : "Không kết nối được máy chủ thi.");
        return;
      }
    }
    beginExam(candidateExam, { ...candidateIdentity, fullName: candidateIdentity.fullName.trim(), studentCode: candidateIdentity.studentCode.trim(), extra: candidateIdentity.extra || {} }, startedFullscreen, serverSession);
  }

  function updateAnswer(questionId: string, answer: string | string[]) {
    const next = { ...answers, [questionId]: answer };
    writeDemoData(`answers:${user.id}:${activeExam?.id || "pending"}`, next);
    setAnswers(next);
    if (serverAttemptId && serverAttemptToken) {
      answerSequences.current[questionId] = Math.max(answerSequences.current[questionId] || 0, Date.now() * 1000) + 1;
      const sequence = answerSequences.current[questionId];
      window.clearTimeout(answerSaveTimers.current[questionId]);
      answerSaveTimers.current[questionId] = window.setTimeout(() => {
        void queueExamAnswer({ userId: user.id, attemptId: serverAttemptId, token: serverAttemptToken, questionId, sequence, answer })
          .then(() => flushQueuedExamAnswers(user.id, serverAttemptId, serverAttemptToken))
          .catch(async () => {
            try {
              const response = await fetch(`/api/v1/exam-attempts/${serverAttemptId}/answers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: serverAttemptToken, questionId, sequence, answer }) });
              if (!response.ok) throw new Error("Máy chủ chưa xác nhận câu trả lời.");
              setNotice("");
            } catch { setNotice("Chưa ghi được hàng đợi ngoại tuyến; bản trả lời hiện vẫn còn trong trình duyệt."); }
          });
      }, 350);
    }
  }

  async function flushQueuedExamAnswers(userId: string, attemptId: string, token: string) {
    if (!navigator.onLine || submittedCurrentAttempt.current || answerSyncing.current.has(attemptId)) return;
    answerSyncing.current.add(attemptId);
    try {
      const queued = (await listQueuedExamAnswers(userId, attemptId)).sort((a, b) => a.sequence - b.sequence);
      for (const item of queued) {
        const response = await fetch(`/api/v1/exam-attempts/${attemptId}/answers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, questionId: item.questionId, sequence: item.sequence, answer: item.answer }) });
        if (!response.ok) throw new Error("Máy chủ chưa xác nhận bản tự lưu mới nhất.");
        await removeQueuedExamAnswer(item.key, item.sequence);
      }
      if (queued.length) setNotice("");
    } catch {
      setNotice("Đang giữ câu trả lời trong hàng đợi ngoại tuyến; hệ thống sẽ tự đồng bộ khi kết nối trở lại.");
    } finally { answerSyncing.current.delete(attemptId); }
  }

  async function submitExam(reason: DemoAttempt["submissionReason"] = "student") {
    if (!activeExam || submittedCurrentAttempt.current) return;
    submittedCurrentAttempt.current = true;
    Object.values(answerSaveTimers.current).forEach((timer) => window.clearTimeout(timer));
    const questions = activeExam.questions || [];
    const answerSnapshot = { ...answers };
    const identity = activeCandidate || { fullName: user.fullName, studentCode: user.studentCode || "", major: user.major || "" };
    let serverAttempt: Partial<DemoAttempt> & { id?: string; status?: string } = {};
    if (serverAttemptId && serverAttemptToken) {
      try {
        const response = await fetch(`/api/v1/exam-attempts/${serverAttemptId}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: serverAttemptToken, answers: answerSnapshot, reason }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "Máy chủ chưa nhận được bài nộp.");
        serverAttempt = payload.attempt || {};
        await clearQueuedExamAnswers(user.id, serverAttemptId).catch(() => undefined);
      } catch (error) {
        submittedCurrentAttempt.current = false;
        setNotice(error instanceof Error ? error.message : "Không kết nối được máy chủ. Bài vẫn được giữ trong trình duyệt; hãy thử nộp lại.");
        return;
      }
    }
    const totalPoints = questions.reduce((sum, question) => sum + question.points, 0);
    const localEarned = questions.reduce((sum, question) => {
      if (question.type === "essay") return sum;
      const answer = answerSnapshot[question.id];
      const correct = Array.isArray(question.answer) ? question.answer : [question.answer];
      const chosen = Array.isArray(answer) ? answer : [answer || ""];
      const normalize = (value: string) => value.trim().toLocaleLowerCase("vi-VN");
      const isCorrect = question.type === "short" ? normalize(chosen[0] || "") === normalize(correct[0] || "") : chosen.length === correct.length && chosen.every((item) => correct.includes(item));
      return isCorrect ? sum + question.points : sum;
    }, 0);
    const attempt: DemoAttempt = { id: serverAttempt.id || `attempt-${crypto.randomUUID()}`, serverAttemptId: serverAttemptId || undefined, examId: activeExam.id, studentId: user.id, studentName: serverAttempt.studentName || identity.fullName, studentCode: serverAttempt.studentCode || identity.studentCode, major: serverAttempt.major || identity.major, email: user.email, candidateDetails: identity.extra, questionIds: questions.map((question) => question.id), answers: answerSnapshot, integrityEvents: serverAttempt.integrityEvents || integrityEventsRef.current, strictIntegrity: activeExam.strictIntegrity !== false, fullscreenUsed: fullscreenWasUsed.current, integrityAutoSubmitted: serverAttempt.integrityAutoSubmitted ?? (reason === "integrity-threshold" || reason === "fullscreen-exit"), submissionReason: serverAttempt.submissionReason || reason, score: serverAttempt.score ?? localEarned, objectiveScore: serverAttempt.score ?? localEarned, totalPoints: serverAttempt.totalPoints ?? totalPoints, submittedAt: serverAttempt.submittedAt || new Date().toISOString(), manualScores: {}, manualFeedback: {} };
    const nextAttempts = [...readDemoData<DemoAttempt[]>("attempts", []), attempt];
    writeDemoData("attempts", nextAttempts);
    const nextExams = readDemoData<Exam[]>("exams", seedDemoExams()).map((item) => item.id === activeExam.id ? { ...item, submissions: (item.submissions || 0) + 1 } : item);
    writeDemoData("exams", nextExams);
    window.localStorage.removeItem(`meotdc:exam-start:${user.id}:${activeExam.id}`);
    window.localStorage.removeItem("meotdc:integrity:" + user.id + ":" + activeExam.id);
    window.localStorage.removeItem(`meotdc:fullscreen-used:${user.id}:${activeExam.id}`);
    window.localStorage.removeItem(`meotdc:server-attempt-id:${user.id}:${activeExam.id}`);
    window.localStorage.removeItem(`meotdc:server-attempt-token:${user.id}:${activeExam.id}`);
    window.localStorage.removeItem(`meotdc:server-deadline:${user.id}:${activeExam.id}`);
    window.localStorage.removeItem(`meotdc:answers:${user.id}:${activeExam.id}`);
    integrityEventsRef.current = [];
    window.localStorage.removeItem(activeExamKey);
    window.localStorage.removeItem(activeQuestionIdsKey);
    window.localStorage.removeItem(`meotdc:${activeCandidateKey}`);
    setAttempts(nextAttempts);
    setResult(attempt);
    setServerAttemptId(null); setServerAttemptToken(null); setServerDeadlineAt(null);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setActiveExam(null);
    setActive("Kết quả");
  }

  submitExamRef.current = submitExam;

  async function submitAssignment(event: FormEvent<HTMLFormElement>, assignment: DemoAssignment) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const selectedFile = form.get("submissionFile");
    setSubmissionBusy(true);
    try {
      let uploaded: { fileId: string; fileName: string; size: number } | undefined;
      if (selectedFile instanceof File && selectedFile.size > 0) {
        if (selectedFile.size > 10 * 1024 * 1024) throw new Error("Tệp vượt giới hạn 10 MB.");
        const uploadData = new FormData();
        uploadData.set("assignmentId", assignment.id);
        uploadData.set("file", selectedFile);
        const response = await fetch("/api/v1/assignments/submission-files", { method: "POST", body: uploadData });
        let payload: { fileId?: string; fileName?: string; size?: number; message?: string | string[] } = {};
        try { payload = await response.json() as typeof payload; } catch { /* The API can return a plain error page when offline. */ }
        if (!response.ok || !payload.fileId || !payload.fileName) {
          const message = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message;
          throw new Error(message || "Không tải được tệp lên máy chủ.");
        }
        uploaded = { fileId: payload.fileId, fileName: payload.fileName, size: Number(payload.size || selectedFile.size) };
      }
      if (!demoMode) {
        const previous = submissions.find((submission) => submission.assignmentId === assignment.id && submission.studentId === user.id);
        const response = await fetch(`/api/v1/assignments/${encodeURIComponent(assignment.id)}/submissions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response: String(form.get("response") || ""), fileId: uploaded?.fileId || previous?.fileId }) });
        let payload: { submission?: DemoSubmission; message?: string | string[] } = {};
        try { payload = await response.json() as typeof payload; } catch { /* The API can return a plain error page when offline. */ }
        if (!response.ok || !payload.submission) {
          const message = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message;
          throw new Error(message || "Không ghi nhận được bài nộp trên máy chủ.");
        }
        setSubmissions((current) => [...current.filter((item) => !(item.assignmentId === assignment.id && item.studentId === user.id)), payload.submission!]);
        setNotice(uploaded ? `Đã tải ${uploaded.fileName} lên và ghi nhận bài nộp.` : "Đã ghi nhận bài nộp trên máy chủ.");
        formElement.reset();
        return;
      }
      const stored = readDemoData<DemoSubmission[]>("submissions", []);
      const previous = stored.find((submission) => submission.assignmentId === assignment.id && submission.studentId === user.id);
      const prior = stored.filter((submission) => !(submission.assignmentId === assignment.id && submission.studentId === user.id));
      const submission: DemoSubmission = { id: "submission-" + crypto.randomUUID(), assignmentId: assignment.id, studentId: user.id, studentName: user.fullName, response: String(form.get("response") || ""), fileName: uploaded?.fileName || previous?.fileName, fileId: uploaded?.fileId || previous?.fileId, fileSize: uploaded?.size || previous?.fileSize, submittedAt: new Date().toISOString(), status: "submitted" };
      const next = [...prior, submission];
      writeDemoData("submissions", next);
      setSubmissions(next);
      setNotice(uploaded ? "Đã tải " + uploaded.fileName + " lên và ghi nhận bài nộp." : "Đã ghi nhận bài nộp trong bản demo.");
      formElement.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể gửi bài nộp.");
    } finally {
      setSubmissionBusy(false);
    }
  }

  async function markLessonDone(courseId: string, chapterIndex: number, lessonIndex: number) {
    const key = `meotdc:lessons:${user.id}:${courseId}`;
    const lessonId = `${chapterIndex}-${lessonIndex}`;
    const course = courses.find((item) => item.id === courseId);
    if (!course) return;
    const done = course.completedLessons || readDemoData<string[]>(key, []);
    if (done.includes(lessonId)) return;
    if (course.serverBacked) {
      try {
        const response = await fetch(`/api/v1/courses/${encodeURIComponent(courseId)}/progress`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterIndex, lessonIndex }) });
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.completedLessons)) throw new Error(typeof payload.message === "string" ? payload.message : "Không lưu được tiến độ lên máy chủ.");
        setCourses((current) => current.map((item) => item.id === courseId ? { ...item, progress: Number(payload.progress) || 0, completedLessons: payload.completedLessons as string[] } : item));
        setNotice("Đã lưu tiến độ học lên máy chủ.");
        return;
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Không lưu được tiến độ học.");
        return;
      }
    }
    writeDemoData(key, [...done, lessonId]);
    const nextCourses = courses.map((course) => course.id === courseId ? { ...course, progress: Math.min(100, course.progress + 8) } : course);
    setCourses(nextCourses);
    writeDemoData("courses", nextCourses);
    setNotice("Đã cập nhật tiến độ bài học.");
  }

  const displayName = user.fullName.split(" ").slice(-1)[0];
  const assignedExams = exams.filter((exam) => exam.published !== false && (exam.audience === "public" ? user.authProvider === "google" : exam.audience === "student" ? Boolean(user.studentCode && exam.targetStudentCodes?.includes(user.studentCode)) : exam.className === user.className || exam.className === "Toàn trường (mô phỏng)"));
  const examAttemptCounts = new Map<string, number>();
  attempts.filter((attempt) => attempt.studentId === user.id).forEach((attempt) => examAttemptCounts.set(attempt.examId, (examAttemptCounts.get(attempt.examId) || 0) + 1));
  const attemptCountForExam = (exam: Exam) => examAttemptCounts.get(exam.id) || 0;
  const completedExams = assignedExams.filter((exam) => attemptCountForExam(exam) >= (exam.attemptsAllowed || 1));
  const expiredExams = assignedExams.filter((exam) => attemptCountForExam(exam) < (exam.attemptsAllowed || 1) && new Date(exam.dueAt).getTime() < Date.now());
  const unfinishedExams = assignedExams.filter((exam) => attemptCountForExam(exam) < (exam.attemptsAllowed || 1) && new Date(exam.dueAt).getTime() >= Date.now());
  const visibleAssignedExams = assignedExams.filter((exam) => {
    const matchesSearch = `${exam.title} ${exam.course} ${exam.className}`.toLocaleLowerCase("vi-VN").includes(examSearch.toLocaleLowerCase("vi-VN"));
    const count = attemptCountForExam(exam);
    const completed = count >= (exam.attemptsAllowed || 1);
    const expired = !completed && new Date(exam.dueAt).getTime() < Date.now();
    return matchesSearch && (examFilter === "all" || examFilter === "completed" && completed || examFilter === "expired" && expired || examFilter === "unfinished" && !completed && !expired);
  }).sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const assignedTasks = assignments.filter((assignment) => assignment.published && (assignment.className === user.className || assignment.className === "Toàn trường (mô phỏng)"));
  const assignedCourses = courses.filter((course) => course.className === user.className || course.className === "Toàn trường (mô phỏng)");
  const remainingExams = assignedExams.filter((exam) => attemptCountForExam(exam) < (exam.attemptsAllowed || 1));
  const dueTasks = assignedTasks.filter((assignment) => !submissions.some((submission) => submission.assignmentId === assignment.id && submission.studentId === user.id));
  const latestResultExam = result ? exams.find((exam) => exam.id === result.examId) : undefined;

  return <main className="role-shell student-shell">
    <header className="role-topbar"><a className="brand" href="#home" onClick={(event) => { event.preventDefault(); if (activeExam && activeExam.strictIntegrity !== false) return; setActive("Tổng quan"); setActiveExam(null); setCandidateExam(null); }}><span className="brand-mark"><span className="brand-dot"/><span className="brand-ear brand-ear-left"/><span className="brand-ear brand-ear-right"/></span><span className="brand-word">Meo<span>TDC</span></span></a><div className="role-topbar-right"><span className="role-chip">Sinh viên · {user.majorGroup || "TDC"}</span><span className="role-user"><span className="avatar">{initials(user.fullName)}</span><strong>{user.fullName}</strong></span><button className="logout-button" onClick={onLogout} disabled={Boolean(activeExam && activeExam.strictIntegrity !== false)}>Đăng xuất</button></div></header>
    <div className="student-app-layout">
      <nav className="student-nav" aria-label="Không gian sinh viên">{(["Tổng quan", "Đề thi", "Bài tập", "Khóa học", "Kết quả"] as const).map((item, index) => ({ item, index })).filter(({ item }) => demoMode || ["Tổng quan", "Đề thi", "Kết quả"].includes(item)).map(({ item, index }) => <button key={item} className={active === item && !activeExam ? "selected" : ""} disabled={Boolean(activeExam && activeExam.strictIntegrity !== false)} onClick={() => { setActive(item); setActiveExam(null); setCandidateExam(null); window.localStorage.removeItem(activeExamKey); window.localStorage.removeItem(activeQuestionIdsKey); window.localStorage.removeItem(`meotdc:${activeCandidateKey}`); }}><Icon name={(["grid", "clipboard", "file", "book", "chart"] as IconName[])[index]} size={18}/>{item}{item === "Đề thi" && <span>{remainingExams.length}</span>}{item === "Bài tập" && <span>{dueTasks.length}</span>}</button>)}</nav>
      <div className="student-main role-content page-scene" key={active}>
        {!demoMode && !activeExam && <ProductionReadinessNotice/>}
        {activeExam ? <StudentExamView exam={activeExam} watermarkText={`${activeCandidate?.fullName || user.fullName} · ${activeCandidate?.studentCode || user.studentCode || "MSSV—"}`} answers={answers} secondsLeft={secondsLeft} integrityEvents={integrityEvents} strikeCount={integrityStrikeCount(integrityEvents)} isFocused={examHasFocus} isFullscreen={examFullscreen} onToggleFullscreen={toggleExamFullscreen} onAnswer={updateAnswer} onSubmit={submitExam}/> : <>
          {active === "Tổng quan" && <><div className="student-welcome"><div><div className="eyebrow">HỌC KỲ I · NĂM HỌC 2026–2027 · {user.studentCode || "SV-DEMO-2026"}</div><h1>Chào {displayName}, hôm nay mình học gì? 👋</h1><p>{user.major || "Chưa chọn ngành"} <span>·</span> {user.majorGroup || "TDC"} <span>·</span> Lớp demo {user.className || "CĐ23_TH1"}</p></div><div className="student-welcome-art"><span>✦</span><b>Học hôm nay,<br/>vững ngày mai.</b></div></div>
            <div className="role-stats"><article className="role-stat"><span>Bài kiểm tra chưa làm</span><strong>{remainingExams.length}</strong><small>Đề đã giao cho bạn</small></article><article className="role-stat"><span>Bài tập cần nộp</span><strong>{dueTasks.length}</strong><small>Việc cần hoàn thành</small></article><article className="role-stat"><span>Kết quả đã có</span><strong>{attempts.filter((item) => item.studentId === user.id).length}</strong><small>Lượt thi đã nộp</small></article></div>
            <div className="student-columns"><section className="role-panel student-personal-panel"><div className="role-panel-heading"><div><h2>Danh sách cá nhân</h2><p>Đề thi, bài tập và lớp gắn với tài khoản của bạn</p></div><button className="text-link" onClick={() => setActive("Đề thi")}>Xem đề thi <Icon name="arrow" size={15}/></button></div><div className="student-personal-class"><span className="task-icon task-purple"><Icon name="book" size={18}/></span><span><small>LỚP HỌC CỦA BẠN</small><strong>{user.className || "Chưa gắn lớp"}</strong><small>{user.major || "Chưa chọn ngành"} · {user.majorGroup || "TDC"}</small></span><span className="role-chip">Sinh viên</span></div>{assignedExams.slice(0,2).map((exam) => <StudentExamCard key={exam.id} exam={exam} attemptCount={attemptCountForExam(exam)} done={attemptCountForExam(exam) >= (exam.attemptsAllowed || 1)} onStart={() => openCandidateForm(exam)}/>)}{assignedTasks.slice(0,2).map((task) => <div className="student-task" key={task.id}><span className="task-icon task-orange"><Icon name="file"/></span><div><strong>{task.title}</strong><small>{task.course} · {task.className}</small><time>Hạn {formatDate(task.dueAt)}</time></div><button className="button button-secondary" onClick={() => setActive("Bài tập")}>Mở bài</button></div>)}{assignedExams.length === 0 && assignedTasks.length === 0 && <EmptyState title="Danh sách của bạn đang trống" description="Đề thi và bài tập được giao cho lớp sẽ xuất hiện tại đây."/>}</section>
              <section className="role-panel"><div className="role-panel-heading"><div><h2>Khóa học của tôi</h2><p>Tiến độ theo học phần đã ghi danh</p></div><button className="text-link" onClick={() => setActive("Khóa học")}>Tất cả <Icon name="arrow" size={15}/></button></div>{assignedCourses.length ? assignedCourses.slice(0,3).map((course) => <div className="progress-course" key={course.id}><div><strong>{course.title}</strong><span>{course.progress}%</span></div><div className="progress-track"><i style={{width:`${course.progress}%`}}/></div></div>) : <EmptyState title="Chưa có khóa học" description="Các học phần theo lớp sẽ hiển thị ở đây."/>}</section></div></>}
          {active === "Đề thi" && <><PageTitle eyebrow="ĐÁNH GIÁ HỌC TẬP" title="Đề thi được giao" description="Đọc kỹ thời lượng và hạn làm bài trước khi bắt đầu."><span className="small-count">{visibleAssignedExams.length}/{assignedExams.length} đề</span></PageTitle><div className="student-exam-toolbar"><label className="search-field student-exam-search"><Icon name="search" size={16}/><input aria-label="Tìm đề thi" placeholder="Tìm theo tên đề, học phần hoặc lớp…" value={examSearch} onChange={(event) => setExamSearch(event.target.value)}/><button type="button" aria-label="Xóa từ khóa" disabled={!examSearch} onClick={() => setExamSearch("")}>×</button></label><div className="student-exam-filters" role="group" aria-label="Lọc đề thi"><button type="button" className={examFilter === "all" ? "selected" : ""} aria-pressed={examFilter === "all"} onClick={() => setExamFilter("all")}>Tất cả <span>{assignedExams.length}</span></button><button type="button" className={examFilter === "unfinished" ? "selected" : ""} aria-pressed={examFilter === "unfinished"} onClick={() => setExamFilter("unfinished")}>Chưa hoàn thành <span>{unfinishedExams.length}</span></button><button type="button" className={examFilter === "completed" ? "selected" : ""} aria-pressed={examFilter === "completed"} onClick={() => setExamFilter("completed")}>Đã hoàn thành <span>{completedExams.length}</span></button><button type="button" className={examFilter === "expired" ? "selected" : ""} aria-pressed={examFilter === "expired"} onClick={() => setExamFilter("expired")}>Hết hạn <span>{expiredExams.length}</span></button></div></div><div className="student-card-grid">{visibleAssignedExams.map((exam) => <StudentExamCard key={exam.id} exam={exam} attemptCount={attemptCountForExam(exam)} done={attemptCountForExam(exam) >= (exam.attemptsAllowed || 1)} onStart={() => openCandidateForm(exam)}/>)}{visibleAssignedExams.length === 0 && <EmptyState title={assignedExams.length ? "Không tìm thấy đề phù hợp" : "Chưa có đề thi được giao"} description={assignedExams.length ? "Thử đổi từ khóa hoặc bộ lọc để xem các đề khác." : "Đề mới từ giảng viên sẽ hiển thị ở đây."}/>}</div></>}
          {active === "Bài tập" && <><PageTitle eyebrow="NHIỆM VỤ HỌC TẬP" title="Bài tập của tôi" description="Nộp câu trả lời hoặc tệp theo yêu cầu của giảng viên."><span className="small-count">{assignedTasks.length} bài</span></PageTitle><div className="student-task-list">{assignedTasks.map((assignment) => { const submission = submissions.find((item) => item.assignmentId === assignment.id && item.studentId === user.id); return <section className="role-panel student-assignment" key={assignment.id}><div className="role-panel-heading"><div><h2>{assignment.title}</h2><p>{assignment.course} · {assignment.className} · {assignment.points} điểm</p></div><span className={`status-badge ${submission?.status === "graded" ? "status-live" : submission ? "status-done" : "status-soon"}`}><i/>{submission?.status === "graded" ? "Đã chấm" : submission ? "Đã nộp" : "Chưa nộp"}</span></div><p className="assignment-description">{assignment.description}</p>{submission && submission.status !== "revision" ? <div className="submission-feedback"><strong>{submission.score !== undefined ? `Điểm: ${submission.score}/${assignment.points}` : "Đã nhận bài nộp"}</strong>{submission.fileName && <small>{submission.fileId ? <a href={`/api/v1/assignments/submission-files/${submission.fileId}`}>Tệp: {submission.fileName} · Tải</a> : `Tệp: ${submission.fileName}`}</small>}{submission.feedback && <p>{submission.feedback}</p>}</div> : <form className="student-submission-form" onSubmit={(event) => submitAssignment(event, assignment)}><label className="form-field"><span>Câu trả lời / ghi chú</span><textarea name="response" rows={3} placeholder="Nhập nội dung hoặc ghi chú cho bài nộp…"/></label><label className="form-field"><span>Tệp đính kèm (tùy chọn)</span><input type="file" name="submissionFile" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.zip"/></label><div className="modal-note">Tệp được tải lên API local (tối đa 10 MB; PDF, DOC/DOCX, PNG/JPG, ZIP). Bản production cần kho riêng và quét tệp.</div>{submission?.status === "revision" && <div className="revision-note"><strong>Giảng viên yêu cầu bổ sung</strong><p>{submission.feedback || "Hãy cập nhật nội dung bài làm rồi nộp lại."}</p></div>}<button className="button button-primary" disabled={submissionBusy}>{submissionBusy ? "Đang tải và gửi…" : submission ? "Nộp lại bài" : "Nộp bài"} <Icon name="arrow" size={15}/></button></form>}</section>; })}{assignedTasks.length === 0 && <EmptyState title="Chưa có bài tập" description="Bài tập được giao theo lớp sẽ xuất hiện ở đây."/>}</div></>}
          {active === "Khóa học" && <><PageTitle eyebrow="LỘ TRÌNH HỌC TẬP" title="Khóa học của tôi" description="Mở bài học, đánh dấu đã hoàn thành và theo dõi tiến độ."><span className="small-count">{assignedCourses.length} học phần</span></PageTitle><div className="student-course-list">{assignedCourses.map((course) => <StudentCourseCard key={course.id} course={course} userId={user.id} onDone={markLessonDone}/>)}</div></>}
          {active === "Kết quả" && <><PageTitle eyebrow="KẾT QUẢ HỌC TẬP" title="Lịch sử làm bài" description="Điểm trắc nghiệm được chấm tự động trong bản demo."><span className="small-count">{attempts.filter((item) => item.studentId === user.id).length} lượt</span></PageTitle><section className="role-panel"><div className="table-scroll"><table className="grade-table"><thead><tr><th>BÀI KIỂM TRA</th><th>HỌC PHẦN</th><th>ĐIỂM</th><th>THỜI GIAN NỘP</th></tr></thead><tbody>{attempts.filter((attempt) => attempt.studentId === user.id).map((attempt) => { const exam = exams.find((item) => item.id === attempt.examId); return <tr key={attempt.id}><td><strong>{exam?.title || "Đề thi đã lưu trữ"}</strong></td><td>{exam?.course || "—"}</td><td><strong>{canShowExamScore(exams.find((item)=>item.id===attempt.examId),attempt)?`${attempt.score}/${attempt.totalPoints}`:"Chờ công bố"}</strong></td><td>{formatDate(attempt.submittedAt)}</td></tr>; })}</tbody></table>{attempts.filter((attempt) => attempt.studentId === user.id).length === 0 && <EmptyState title="Chưa có kết quả" description="Bài thi đã nộp sẽ xuất hiện trong bảng điểm cá nhân."/>}</div></section></>}
        </>}
        {result && !activeExam && active === "Kết quả" && <section className="role-panel latest-result"><div className="result-score"><span>ĐIỂM BÀI VỪA NỘP</span><strong>{canShowExamScore(latestResultExam,result)?result.score:"—"}<small>{canShowExamScore(latestResultExam,result)?`/${result.totalPoints}`:""}</small></strong><p>{canShowExamScore(latestResultExam,result)?`Đã lưu lúc ${formatDate(result.submittedAt)}`:"Đã nhận bài. Điểm sẽ hiển thị theo cấu hình của giảng viên."}</p></div><div><h2>Đã nhận bài làm</h2><p>Câu tự luận (nếu có) chờ giảng viên chấm. Bản demo chỉ tự chấm câu hỏi khách quan.</p><button className="button button-secondary" onClick={() => setResult(null)}>Đóng kết quả</button></div></section>}
        <p className="role-disclaimer">Không gian trải nghiệm MeoTDC · Lượt thi server-backed được chấm và lưu trên API local; dữ liệu lớp và học tập khác vẫn là mô phỏng.</p>
      </div>
    </div>
        {candidateExam && <CandidateIdentityModal email={user.email} identity={candidateIdentity} majors={majors} fields={candidateExam.candidateFields || []} strictIntegrity={candidateExam.strictIntegrity !== false} passwordRequired={Boolean(candidateExam.accessPasswordRequired || candidateExam.accessPassword)} password={candidatePassword} onPasswordChange={setCandidatePassword} error={candidateError} onChange={setCandidateIdentity} onCancel={() => setCandidateExam(null)} onConfirm={confirmCandidateIdentity}/>}
        {notice && <div role="status" className="toast"><span className="toast-check">✓</span>{notice}</div>}
  </main>;
}

function CandidateIdentityModal({ email, identity, majors, fields, strictIntegrity, passwordRequired, password, onPasswordChange, error, onChange, onCancel, onConfirm }: { email?: string; identity: CandidateIdentity; majors: Major[]; fields: string[]; strictIntegrity: boolean; passwordRequired: boolean; password: string; onPasswordChange: (password: string) => void; error: string; onChange: (identity: CandidateIdentity) => void; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop"><section className="modal-card candidate-identity-modal" role="dialog" aria-modal="true" aria-labelledby="candidate-identity-title"><div className="modal-heading"><div><div className="eyebrow">XÁC NHẬN THÔNG TIN DỰ THI</div><h2 id="candidate-identity-title">Trước khi bắt đầu</h2></div><button className="small-icon-button" onClick={onCancel} aria-label="Đóng"><Icon name="close"/></button></div><p className="modal-intro">Thông tin này sẽ được ghi cùng bài làm và bảng điểm của kỳ thi.</p><div className="google-identity-summary"><span className="google-identity-mark">G</span><span><small>TÀI KHOẢN GOOGLE</small><strong>{email || "Tài khoản demo · chưa liên kết Gmail"}</strong></span><span className={email ? "verified-chip" : "role-chip"}>{email ? "Đã xác minh" : "Demo"}</span></div>{passwordRequired && <label className="form-field"><span>Mật khẩu đề</span><input type="password" autoComplete="current-password" maxLength={48} value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="Nhập mật khẩu do giảng viên cung cấp"/></label>}<label className="form-field"><span>Họ và tên</span><input autoComplete="name" maxLength={120} value={identity.fullName} onChange={(event) => onChange({ ...identity, fullName: event.target.value })} placeholder="Nhập họ tên sinh viên"/></label><label className="form-field"><span>Mã số sinh viên (MSSV)</span><input autoComplete="off" maxLength={80} value={identity.studentCode} onChange={(event) => onChange({ ...identity, studentCode: event.target.value })} placeholder="Ví dụ: 23000001"/></label><label className="form-field"><span>Ngành học</span><select value={identity.major} onChange={(event) => onChange({ ...identity, major: event.target.value })}><option value="">Chọn ngành học</option>{majors.map((major) => <option key={major.id} value={major.name}>{major.name} · {major.level}</option>)}</select></label>{fields.map((field) => <label className="form-field" key={field}><span>{field} <i>*</i></span><input maxLength={160} value={identity.extra?.[field] || ""} onChange={(event) => onChange({ ...identity, extra: { ...identity.extra, [field]: event.target.value } })} placeholder={`Nhập ${field.toLocaleLowerCase("vi-VN")}`}/></label>)}{error && <div role="alert" className="login-alert">{error}</div>}<div className="candidate-demo-note candidate-security-note"><strong>{strictIntegrity ? "Điều kiện dự thi nghiêm ngặt" : "Giám sát cơ bản"}</strong><p>{strictIntegrity ? "Mọi lượt thi đều cần toàn màn hình; thoát sẽ tự nộp ngay. Sao chép, dán, in và một số phím tắt bị chặn; ba cảnh báo khác cũng tự nộp." : "Toàn màn hình bắt buộc; thoát sẽ tự nộp. Rời tab được ghi lại và tên/MSSV được đóng dấu chìm trên bài thi."}</p><small>Email Google được xác minh; họ tên, MSSV và ngành khai báo trong bản demo. In/Xuất PDF sẽ chỉ ra trang đen. Trình duyệt không thể phát hiện hay chặn chắc chắn ảnh chụp màn hình hệ điều hành hoặc điện thoại bên ngoài; watermark giúp truy xuất ảnh bị chia sẻ.</small></div><div className="modal-actions"><button className="button button-secondary" onClick={onCancel}>Hủy</button><button className="button button-primary" onClick={onConfirm}>Xác nhận và bắt đầu thi <Icon name="arrow" size={15}/></button></div></section></div>;
}

function StudentExamCard({ exam, done, attemptCount, onStart }: { exam: Exam; done: boolean; attemptCount: number; onStart: () => void }) {
  const expired = new Date(exam.dueAt).getTime() < Date.now();
  const notOpen = Boolean(exam.opensAt && new Date(exam.opensAt).getTime() > Date.now());
  const status = done ? "Đã hoàn thành" : expired ? "Đã hết hạn" : notOpen ? "Chưa mở" : "Được giao";
  return <article className="role-panel student-exam-card"><div className="student-exam-card-top"><span className="task-icon task-purple"><Icon name="clipboard"/></span><span className={`status-badge ${done || expired ? "status-done" : notOpen ? "status-soon" : "status-live"}`}><i/>{status}</span></div><h2>{exam.title}</h2><p>{exam.course} · {exam.className}</p><div className="student-exam-meta"><span>{exam.randomQuestionCount || exam.questionCount} câu{exam.randomQuestionCount ? " rút ngẫu nhiên" : ""}</span><span>{exam.durationMinutes || 30} phút</span><span>{attemptCount}/{exam.attemptsAllowed || 1} lượt đã dùng</span><span>{exam.opensAt ? `Mở ${formatDate(exam.opensAt)}` : "Được giao"}</span><span>{exam.strictIntegrity === false ? "Toàn màn hình bắt buộc" : "Giám sát nghiêm ngặt · Toàn màn hình"}</span><span>Đóng {formatDate(exam.dueAt)}</span>{exam.accessPassword && <span>Có mật khẩu</span>}</div><button className={`button ${done ? "button-secondary" : "button-primary"}`} onClick={onStart} disabled={!done && (expired || notOpen)}>{done ? "Xem kết quả" : attemptCount ? "Làm lượt tiếp theo" : notOpen ? "Chưa đến giờ mở" : "Bắt đầu làm bài"}<Icon name="arrow" size={15}/></button></article>;
}

function StudentExamView({ exam, answers, secondsLeft, integrityEvents, strikeCount, isFocused, isFullscreen, onToggleFullscreen, onAnswer, onSubmit, watermarkText }: { exam: Exam; answers: Record<string, string | string[]>; secondsLeft: number; integrityEvents: ExamIntegrityEvent[]; strikeCount: number; isFocused: boolean; isFullscreen: boolean; onToggleFullscreen: () => void; onAnswer: (questionId: string, answer: string | string[]) => void; onSubmit: (reason?: DemoAttempt["submissionReason"]) => void; watermarkText: string }) {
  const questions = exam.questions || [];
  const strictMode = exam.strictIntegrity !== false;
  const [optionOrder] = useState<Record<string, number[]>>(() => Object.fromEntries(questions.filter((question) => question.options.length > 1).map((question) => {
    const order = question.options.map((_, index) => index);
    if (exam.shuffleQuestions) for (let index = order.length - 1; index > 0; index -= 1) { const swap = Math.floor(Math.random() * (index + 1)); [order[index], order[swap]] = [order[swap], order[index]]; }
    return [question.id, order];
  })));
  const answered = questions.filter((question) => { const answer = answers[question.id]; return Array.isArray(answer) ? answer.length > 0 : Boolean(answer?.trim()); }).length;
  const timeRemaining = Math.max(0, secondsLeft);
  const time = String(Math.floor(timeRemaining / 60)).padStart(2, "0") + ":" + String(timeRemaining % 60).padStart(2, "0");
  const progress = questions.length ? answered / questions.length * 100 : 0;
  const recentEvents = integrityEvents.slice(-4).reverse();
  return <div className={"exam-taking-shell " + (strictMode ? "strict-mode" : "")}>
    <div className="exam-watermark" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <span key={index}>{watermarkText} · BÀI THI CÁ NHÂN</span>)}</div>
    <div className="exam-taking-header">
      <span className="exam-session-label"><span className="exam-live-dot"/>Đang trong ca thi · Toàn màn hình bắt buộc</span>
      <div className="exam-header-status"><span className={"exam-focus-chip " + (isFocused ? "focused" : "unfocused")}><i/>{isFocused ? "Đang ở màn hình thi" : "Đã rời màn hình thi"}</span><div className={"exam-timer " + (secondsLeft < 300 ? "urgent" : "")}><Icon name="clock" size={17}/><span>{time}</span></div></div>
    </div>
    <section className={"exam-security-banner " + (isFocused && isFullscreen ? "secure" : "attention")} role="status" aria-live="polite">
      <span className="exam-security-emblem"><i/><b>{isFocused && isFullscreen ? "✓" : "!"}</b></span>
      <div className="exam-security-copy"><span className="exam-security-kicker">{strictMode ? "CHẾ ĐỘ GIÁM SÁT NGHIÊM NGẶT" : "CHẾ ĐỘ GIÁM SÁT CƠ BẢN"}</span><strong>{!isFullscreen ? "Đã thoát toàn màn hình — bài đang được nộp" : !isFocused ? "Hãy quay lại bài thi" : "Phiên thi đang được theo dõi"}</strong><small>{strictMode ? "Chặn sao chép, dán, in và phím tắt phổ biến. Thoát toàn màn hình sẽ tự nộp ngay; ba đợt cảnh báo khác cũng tự nộp." : "Toàn màn hình luôn bắt buộc; thoát sẽ tự nộp. Rời tab được ghi nhận để giảng viên xem lại."}</small></div>
      <div className="exam-strike-meter"><strong>{strictMode ? strikeCount + "/" + maxIntegrityStrikes : integrityEvents.length}</strong><small>{strictMode ? "đợt cảnh báo" : "tín hiệu ghi nhận"}</small></div>
      <button className={"exam-fullscreen-button " + (isFullscreen ? "enabled" : "")} onClick={onToggleFullscreen} disabled={isFullscreen}><span>⛶</span>{isFullscreen ? "Toàn màn hình" : "Bật toàn màn hình"}</button>
    </section>
    <div className="exam-taking-title"><div><div className="eyebrow">{exam.course} · {exam.className}</div><h1>{exam.title}</h1><p>{questions.length} câu hỏi <span>·</span> {exam.durationMinutes || 30} phút <span>·</span> {exam.shuffleQuestions ? "Câu hỏi và lựa chọn đã xáo trộn" : "Câu hỏi theo thứ tự đề"}</p><div className="exam-progress-track" role="progressbar" aria-label="Tiến độ bài thi" aria-valuenow={answered} aria-valuemin={0} aria-valuemax={questions.length}><i style={{ width: progress + "%" }}/></div></div><div className="exam-progress-chip">Đã trả lời <strong>{answered}/{questions.length}</strong></div></div>
    <div className="exam-taking-content"><main className="exam-question-list">{questions.map((question, index) => <section id={"question-" + question.id} className="role-panel exam-question-card" key={question.id}><div className="question-number-row"><strong>Câu {String(index + 1).padStart(2, "0")}</strong><span>{question.points} điểm · {question.type === "essay" ? "Tự luận" : question.type === "short" ? "Trả lời ngắn" : "Trắc nghiệm"}</span></div><h2>{question.prompt}</h2>{(question.type === "single" || question.type === "multiple" || question.type === "true_false") && <div className="answer-options">{(optionOrder[question.id] || question.options.map((_, optionIndex) => optionIndex)).map((optionIndex, displayIndex) => { const value = String(optionIndex); const selected = Array.isArray(answers[question.id]) ? (answers[question.id] as string[]).includes(value) : answers[question.id] === value; return <label className={"answer-option " + (selected ? "chosen" : "")} key={question.id + "-" + optionIndex}><input type={question.type === "multiple" ? "checkbox" : "radio"} name={"answer-" + question.id} checked={selected} onChange={(event) => { if (question.type === "multiple") { const current = Array.isArray(answers[question.id]) ? answers[question.id] as string[] : []; onAnswer(question.id, event.target.checked ? [...current, value] : current.filter((item) => item !== value)); } else onAnswer(question.id, value); }}/><span className="option-letter">{String.fromCharCode(65 + displayIndex)}</span><span>{question.options[optionIndex]}</span></label>; })}</div>}{question.type === "short" && <label className="form-field"><span>Câu trả lời</span><input value={typeof answers[question.id] === "string" ? answers[question.id] as string : ""} onChange={(event) => onAnswer(question.id, event.target.value)} placeholder="Nhập câu trả lời ngắn…"/></label>}{question.type === "essay" && <label className="form-field"><span>Bài làm tự luận</span><textarea rows={5} value={typeof answers[question.id] === "string" ? answers[question.id] as string : ""} onChange={(event) => onAnswer(question.id, event.target.value)} placeholder="Nhập bài làm của bạn…"/></label>}</section>)}</main>
      <aside className="role-panel exam-taking-aside"><div className="exam-aside-heading"><span className="task-icon task-purple"><Icon name="clipboard" size={18}/></span><div><h2>Phiếu trả lời</h2><p>Nhảy nhanh đến câu cần xem lại.</p></div></div><div className="question-jump-grid">{questions.map((question, index) => <a key={question.id} href={"#question-" + question.id} className={answers[question.id] ? "answered" : ""} aria-label={"Câu " + (index + 1) + (answers[question.id] ? ", đã trả lời" : ", chưa trả lời")}>{index + 1}</a>)}</div><div className="exam-aside-rule"/><div className="exam-submit-summary"><span>Đã trả lời</span><strong>{answered}/{questions.length}</strong><small>Thời gian còn {time}</small></div><div className={"exam-aside-integrity " + (strikeCount ? "has-events" : "")}><span className="integrity-pulse"/><span><strong>{strictMode ? strikeCount + " / " + maxIntegrityStrikes + " đợt cảnh báo" : integrityEvents.length + " tín hiệu ghi nhận"}</strong><small>{strictMode ? Math.max(0, maxIntegrityStrikes - strikeCount) + " đợt nữa sẽ tự nộp bài" : "Giảng viên có thể rà soát nhật ký"}</small></span></div><div className="exam-integrity-log"><strong>Nhật ký phiên thi</strong>{recentEvents.length ? <ol>{recentEvents.map((event, index) => <li key={event.at + "-" + index}><span>{integrityEventLabels[event.kind]}</span><time>{new Date(event.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></li>)}</ol> : <p>Chưa ghi nhận tín hiệu bất thường.</p>}</div><button className="button button-primary" onClick={() => onSubmit()} disabled={secondsLeft === 0}>Nộp bài thi <Icon name="arrow" size={15}/></button><small className="autosave-note">{exam.serverBacked ? "Câu trả lời tự lưu vào máy chủ trong lúc làm bài." : "Câu trả lời đang lưu trên thiết bị này."}</small></aside></div>
    <div className="exam-mobile-submit"><span>{answered}/{questions.length} câu <small>· {time}</small></span><button className="button button-primary" onClick={() => onSubmit()} disabled={secondsLeft === 0}>Nộp bài</button></div>
    {!isFullscreen && <div className="exam-lock-overlay" role="alertdialog" aria-modal="true" aria-labelledby="exam-lock-title"><section><span className="exam-lock-icon">⛶</span><span className="exam-security-kicker">PHIÊN THI ĐANG TẠM KHÓA</span><h2 id="exam-lock-title">Bài thi đã khóa sau khi thoát toàn màn hình</h2><p>Hệ thống đang tự nộp bài. Nếu mất kết nối, gửi lại bài để hoàn tất.</p><button className="button button-primary" onClick={() => onSubmit("fullscreen-exit")}>Gửi lại bài thi <Icon name="arrow" size={15}/></button><small>Phần trả lời đã lưu trên máy chủ sẽ được giữ lại.</small></section></div>}
  </div>;
}

function StudentCourseCard({ course, userId, onDone }: { course: DemoCourse; userId: string; onDone: (courseId: string, chapterIndex: number, lessonIndex: number) => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const completed = course.completedLessons || readDemoData<string[]>(`lessons:${userId}:${course.id}`, []);
  return <section className="role-panel student-course-card"><button className="student-course-heading" onClick={() => setOpen((value) => !value)}><span className="task-icon task-purple"><Icon name="book"/></span><span><strong>{course.title}</strong><small>{course.code} · {course.className}</small></span><span className="student-course-progress">{course.progress}%</span><Icon name="chevron" size={18}/></button><div className="progress-track"><i style={{width:`${course.progress}%`}}/></div>{open && <div className="course-chapters">{course.chapters.map((chapter, chapterIndex) => <div className="course-chapter" key={chapter.title}><strong>{chapter.title}</strong>{chapter.lessons.map((lesson, lessonIndex) => { const id = `${chapterIndex}-${lessonIndex}`; const done = completed.includes(id); return <div className="course-lesson-wrap" key={lesson.title}><div className="course-lesson"><span className={`lesson-check ${done ? "done" : ""}`}>{done ? "✓" : "○"}</span><span><strong>{lesson.title}</strong><small>{lesson.duration} · Bài học</small></span><button className="button button-secondary" onClick={() => setOpenLesson(openLesson === id ? null : id)}>{openLesson === id ? "Thu gọn" : "Mở bài"}</button></div>{openLesson === id && <div className="lesson-content"><p>{lesson.content || "Giảng viên chưa thêm nội dung cho bài học này."}</p><button className="button button-primary" disabled={done} onClick={() => onDone(course.id, chapterIndex, lessonIndex)}>{done ? "Đã hoàn thành" : "Đánh dấu hoàn thành"}</button></div>}</div>; })}</div>)}</div>}</section>;
}

function InstitutionRosterImportPanel({ majors, rosterAccounts, onImport }: { majors: Major[]; rosterAccounts: RosterStudentAccount[]; onImport: (classCode: string, students: Array<RosterImportStudent & { major: string }>) => Promise<void> }) {
  const [classCode, setClassCode] = useState("");
  const [defaultMajor, setDefaultMajor] = useState(majors.find((major) => major.id === "it")?.name || majors[0]?.name || "");
  const [preview, setPreview] = useState<{ fileName: string; students: Array<RosterImportStudent & { major: string }>; totalRows: number; issues: string[] } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function readRoster(file?: File) {
    setNotice("");
    setPreview(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setNotice("Tệp CSV vượt giới hạn 5 MB."); return; }
    const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) { setNotice("Tệp CSV đang trống."); return; }
    const separator = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
    const rows = lines.map((line) => parseDelimitedRow(line, separator));
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi-VN").trim();
    const headers = rows[0].map(normalize);
    const codeColumn = headers.findIndex((value) => /^(mssv|ma sinh vien|student id|student code)$/.test(value));
    const nameColumn = headers.findIndex((value) => /^(ho ten|ten sinh vien|student name|name)$/.test(value));
    const emailColumn = headers.findIndex((value) => /^(email|gmail|email sinh vien|student email)$/.test(value));
    const majorColumn = headers.findIndex((value) => /^(nganh|chuyen nganh|major)$/.test(value));
    if (codeColumn < 0 || nameColumn < 0) { setNotice("CSV cần có cột MSSV và Họ tên. Email và Ngành là tùy chọn."); return; }
    const data = rows.slice(1);
    if (data.length > 5000) { setNotice("Mỗi lần nhập tối đa 5.000 sinh viên."); return; }
    const seen = new Set<string>();
    const students: Array<RosterImportStudent & { major: string }> = [];
    const issues: string[] = [];
    data.forEach((row, index) => {
      if (row.every((cell) => !cell.trim())) return;
      const studentCode = (row[codeColumn] || "").trim().toLocaleUpperCase("vi-VN");
      const fullName = (row[nameColumn] || "").trim().replace(/\s+/g, " ");
      const email = (emailColumn < 0 ? "" : row[emailColumn] || "").trim().toLowerCase();
      const requestedMajor = (majorColumn < 0 ? "" : row[majorColumn] || "").trim();
      const major = majors.find((item) => item.name.toLocaleLowerCase("vi-VN") === requestedMajor.toLocaleLowerCase("vi-VN") || item.id.toLowerCase() === requestedMajor.toLowerCase())?.name || (requestedMajor ? "" : defaultMajor);
      const problems = [!studentCode && "thiếu MSSV", !fullName && "thiếu họ tên", email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && "email không hợp lệ", !major && "ngành không có trong danh mục", studentCode && seen.has(studentCode) && "MSSV bị trùng"].filter(Boolean);
      if (problems.length) { if (issues.length < 12) issues.push(`Dòng ${index + 2}: ${problems.join(", ")}.`); return; }
      seen.add(studentCode);
      students.push({ studentCode, fullName, email, major, line: index + 2 });
    });
    setPreview({ fileName: file.name, students, totalRows: data.filter((row) => row.some((cell) => cell.trim())).length, issues });
  }

  async function confirmImport() {
    if (!preview || !classCode.trim() || !preview.students.length) return;
    setBusy(true);
    setNotice("");
    try {
      await onImport(classCode.trim().toUpperCase(), preview.students);
      setNotice(`Đã xử lý ${preview.students.length} sinh viên từ ${preview.fileName}.`);
      setPreview(null);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Không nhập được danh sách."); }
    finally { setBusy(false); }
  }

  return <section className="role-panel roster-import-panel"><div className="role-panel-heading"><div><h2>Nhập roster của trường</h2><p>Tải CSV MSSV, họ tên, email Google và ngành để tạo tài khoản sinh viên trên máy chủ.</p></div><span className="role-chip">Tối đa 5.000 dòng</span></div><div className="roster-import-form"><label className="form-field"><span>Mã lớp</span><input value={classCode} onChange={(event) => setClassCode(event.target.value)} maxLength={80} placeholder="Ví dụ: CĐ26_TH1"/></label><label className="form-field"><span>Ngành mặc định</span><select value={defaultMajor} onChange={(event) => setDefaultMajor(event.target.value)}>{majors.map((major) => <option key={major.id} value={major.name}>{major.name}</option>)}</select></label><label className="form-field roster-file-field"><span>Tệp danh sách CSV</span><input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => void readRoster(event.target.files?.[0])}/></label></div><p className="role-disclaimer">Tiêu đề bắt buộc: <code>MSSV</code>, <code>Họ tên</code>. Có thể thêm <code>Email</code> và <code>Ngành</code>. Mật khẩu ngẫu nhiên chỉ hiện một lần sau khi cấp; tải CSV và chuyển qua kênh bảo mật.</p>{preview&&<div className="roster-import-preview"><div className="role-panel-heading"><div><strong>{preview.fileName}</strong><p>{preview.students.length} dòng hợp lệ / {preview.totalRows} dòng</p></div></div>{preview.issues.length>0&&<div className="roster-import-issues" role="status"><ul>{preview.issues.map((issue,index)=><li key={`${issue}-${index}`}>{issue}</li>)}</ul></div>}<div className="table-scroll"><table className="grade-table"><thead><tr><th>MSSV</th><th>HỌ TÊN</th><th>EMAIL</th><th>NGÀNH</th></tr></thead><tbody>{preview.students.slice(0,6).map((student)=><tr key={student.studentCode}><td>{student.studentCode}</td><td>{student.fullName}</td><td>{student.email || "—"}</td><td>{student.major}</td></tr>)}</tbody></table></div><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setPreview(null)}>Hủy</button><button type="button" className="button button-primary" disabled={busy || !classCode.trim() || !preview.students.length} onClick={() => void confirmImport()}>{busy ? "Đang tạo tài khoản…" : `Tạo ${preview.students.length} tài khoản`}</button></div></div>}{notice&&<div role="status" className="credential-notice">{notice}</div>}<div className="roster-account-list"><div className="role-panel-heading"><div><h3>Hồ sơ trong roster</h3><p>{demoMode ? "Tài khoản trong phiên demo." : "Danh sách được tải từ máy chủ theo quyền nhà trường."}</p></div><span className="small-count">{rosterAccounts.length} sinh viên</span></div>{rosterAccounts.slice(0,50).map((account)=><div className="roster-account-row" key={account.id}><span className="avatar">{initials(account.fullName)}</span><span><strong>{account.fullName}</strong><small>{account.studentCode} · {account.className}{account.email?` · ${account.email}`:""}</small></span><span className="role-chip">Sinh viên</span></div>)}{rosterAccounts.length>50&&<p className="role-disclaimer">Hiển thị 50 trên {rosterAccounts.length} hồ sơ. Tải CSV báo cáo để xem đầy đủ.</p>}{rosterAccounts.length===0&&<EmptyState title="Chưa có hồ sơ sinh viên" description="Nhập roster CSV ở trên để tạo tài khoản theo lớp."/>}</div></section>;
}

function InstitutionWorkspace({ user, majors, accounts, onLogout }: { user: MeoUser; majors: Major[]; accounts: DemoAccount[]; onLogout: () => void }) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("Tất cả trình độ");
  const [section, setSection] = useState("Tổng quan");
  useEffect(() => { document.title = `${section} · MeoTDC`; return () => { document.title = "MeoTDC — Cổng học tập số TDC"; }; }, [section]);
  const [classes, setClasses] = useState<DemoClass[]>(demoMode ? seedClasses : []);
  const [exams, setExams] = useState<Exam[]>(demoMode ? seedDemoExams() : []);
  const [attempts, setAttempts] = useState<DemoAttempt[]>([]);
  const [rosterAccounts, setRosterAccounts] = useState<RosterStudentAccount[]>([]);
  const [overview, setOverview] = useState<InstitutionOverview | null>(null);
  const [provisionedCredentials, setProvisionedCredentials] = useState<ProvisionedCredential[]>([]);
  const [credentialClassId, setCredentialClassId] = useState(demoMode ? seedClasses[0].id : "");
  const [resetExistingCredentials, setResetExistingCredentials] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [credentialNotice, setCredentialNotice] = useState("");
  const filteredMajors = useMemo(() => majors.filter((major) => `${major.name} ${major.group}`.toLocaleLowerCase("vi-VN").includes(query.toLocaleLowerCase("vi-VN")) && (level === "Tất cả trình độ" || major.level === level)), [majors, query, level]);
  const isAdmin = user.role === "admin";
  useEffect(()=>{const refresh=()=>{if(demoMode)setClasses(readDemoData("classes",seedClasses));setExams(readDemoData("exams",seedDemoExams()));setAttempts(readDemoData("attempts",[]));};refresh();window.addEventListener(demoStorageEvent,refresh);window.addEventListener("storage",refresh);return()=>{window.removeEventListener(demoStorageEvent,refresh);window.removeEventListener("storage",refresh);};},[]);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const [overviewResponse, rosterResponse, examResponse, attemptResponse, classResponse] = await Promise.all([fetch("/api/v1/overview"), fetch("/api/v1/auth/roster-accounts"), fetch("/api/v1/exams"), fetch("/api/v1/exam-attempts"), fetch("/api/v1/catalog/classes")]);
        if (!alive) return;
        if (overviewResponse.ok) setOverview(await overviewResponse.json() as InstitutionOverview);
        if (rosterResponse.ok) setRosterAccounts(await rosterResponse.json() as RosterStudentAccount[]);
        if (examResponse.ok) setExams(await examResponse.json() as Exam[]);
        if (attemptResponse.ok) setAttempts(await attemptResponse.json() as DemoAttempt[]);
        if (classResponse.ok) {
          const remoteClasses = await classResponse.json() as DemoClass[];
          setClasses(demoMode ? readDemoData("classes", seedClasses) : remoteClasses);
        }
      } catch { /* Keep the last available school summary while the API reconnects. */ }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 15_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [user.role]);
  useEffect(() => { if (!credentialClassId && classes.length) setCredentialClassId(classes[0].id); }, [classes, credentialClassId]);
  const studentCount=classes.reduce((sum,item)=>sum+item.students.length,0);
  const averageScore=attempts.length?attempts.reduce((sum,item)=>sum+(item.totalPoints?item.score/item.totalPoints*10:0),0)/attempts.length:0;
  function exportInstitutionReport(){const rows=[["MSSV","Họ tên","Ngành","Email Google","Bài kiểm tra","Lớp","Điểm","Thang điểm","Nộp lúc","Tín hiệu giám sát","Tự nộp do vi phạm"],...attempts.map((attempt)=>{const exam=exams.find((item)=>item.id===attempt.examId);return[attempt.studentCode||"",attempt.studentName,attempt.major||"",attempt.email||"",exam?.title||"",exam?.className||"",attempt.score,attempt.totalPoints,attempt.submittedAt,integritySummary(attempt.integrityEvents),attempt.integrityAutoSubmitted?"Có":"Không"];})];downloadCsvFile("meotdc-bao-cao-nha-truong.csv",rows);}
  async function provisionClassAccounts(){const selectedClass=classes.find((item)=>item.id===credentialClassId);if(!selectedClass||!selectedClass.students.length)return;setProvisioning(true);setCredentialNotice("");try{const students=selectedClass.students.map((fullName,index)=>({studentCode:demoRosterCode(selectedClass,fullName,index),fullName,major:selectedClass.major,email:selectedClass.studentEmails?.[fullName]||""}));const response=await fetch("/api/v1/auth/roster-accounts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({classCode:selectedClass.code,students,resetExisting:resetExistingCredentials})});const result=await response.json();if(!response.ok)throw new Error(Array.isArray(result.message)?result.message.join(" "):result.message||"Không thể cấp tài khoản demo.");setProvisionedCredentials(result.accounts||[]);const refresh=await fetch("/api/v1/auth/roster-accounts");if(refresh.ok)setRosterAccounts(await refresh.json());setCredentialNotice(`Đã tạo ${result.created} tài khoản mới, cấp lại ${result.reset||0} mật khẩu và giữ nguyên ${result.alreadyExists} tài khoản.`);}catch(error){setCredentialNotice(error instanceof Error?error.message:"Lỗi kết nối dịch vụ cấp tài khoản.");}finally{setProvisioning(false);}}
  async function importRosterAccounts(classCode: string, students: Array<RosterImportStudent & { major: string }>) { const response = await fetch("/api/v1/auth/roster-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classCode, students, resetExisting: false }) }); const result = await response.json(); if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(" ") : result.message || "Không nhập được roster."); setProvisionedCredentials(result.accounts || []); const refresh = await fetch("/api/v1/auth/roster-accounts"); if (refresh.ok) setRosterAccounts(await refresh.json()); setCredentialNotice(`Đã tạo ${result.created} tài khoản mới; ${result.alreadyExists} tài khoản đã tồn tại được giữ nguyên.`); }
  function downloadProvisionedCredentials(){downloadCsvFile("meotdc-tai-khoan-sinh-vien-demo.csv",[["MSSV / tên đăng nhập","Mật khẩu khởi tạo","Họ tên","Email Google","Lớp"],...provisionedCredentials.map((item)=>[item.username,item.initialPassword||"Đã cấp trước đó",item.fullName,item.email||"",item.className])]);}
  return <main className="role-shell institution-shell">
    <header className="role-topbar"><a className="brand" href="#home"><span className="brand-mark"><span className="brand-dot"/><span className="brand-ear brand-ear-left"/><span className="brand-ear brand-ear-right"/></span><span className="brand-word">Meo<span>TDC</span></span></a><div className="role-topbar-right"><span className="role-chip">{roleNames[user.role]}</span><span className="role-user"><span className="avatar">{initials(user.fullName)}</span><strong>{user.fullName}</strong></span><button className="logout-button" onClick={onLogout}>Đăng xuất</button></div></header>
    <div className="role-content page-scene" key={section}>{!demoMode && <ProductionReadinessNotice/>}<div className="page-title-row institution-title"><div><div className="eyebrow">QUẢN TRỊ ĐÀO TẠO · TDC</div><h1>{isAdmin ? "Quản trị hệ thống" : "Cổng nhà trường"}</h1><p>{isAdmin ? (demoMode ? "Theo dõi cấu trúc đào tạo, tài khoản mô phỏng và hoạt động của MeoTDC." : "Quản lý tài khoản đã được cấp; danh mục lớp chính thức cần kết nối với hệ thống nhà trường.") : "Tổng hợp lớp học phần, ngành đào tạo và tình hình học tập."}</p></div><span className="role-chip">{demoMode ? "Bản demo" : "Pilot kỹ thuật"}</span></div>
      <div className="role-stats institution-stats"><article className="role-stat"><span>Ngành đào tạo</span><strong>{majors.length}</strong><small>Cao đẳng và trung cấp</small></article><article className="role-stat"><span>{demoMode ? "Lớp học phần mẫu" : "Lớp có dữ liệu"}</span><strong>{overview?.classes ?? classes.length}</strong><small>{overview ? `${overview.students} sinh viên · ${overview.metricsStatus === "postgres" ? "PostgreSQL" : "dữ liệu phiên"}` : demoMode ? "Học kỳ I · 2026–2027" : "Đang đồng bộ dữ liệu"}</small></article><article className="role-stat"><span>Đề đã xuất bản</span><strong>{overview?.publishedExams ?? exams.filter((item)=>item.published!==false).length}</strong><small>{overview ? `${overview.publishedAssignments} bài tập đã giao` : "Giao theo lớp mẫu"}</small></article><article className="role-stat"><span>Lượt thi đã nộp</span><strong>{attempts.length}</strong><small>{attempts.length?`Điểm TB ${averageScore.toFixed(1)}/10`:"Chưa có lượt thi"}</small></article></div>
      <nav className="institution-tabs" aria-label="Quản trị nhà trường">{["Tổng quan","Ngành đào tạo","Lớp học phần","Tài khoản","Báo cáo"].filter((item)=>demoMode||["Tổng quan","Ngành đào tạo","Tài khoản","Báo cáo"].includes(item)).map((item)=><button key={item} className={section===item?"selected":""} onClick={()=>setSection(item)}>{item}</button>)}</nav>
      {section==="Tổng quan"&&<div className="institution-overview-grid"><section className="role-panel"><div className="role-panel-heading"><div><h2>Hoạt động đào tạo</h2><p>Tổng quan tổ chức học kỳ đang chọn</p></div><span className="role-chip">Học kỳ I · 2026–2027</span></div><div className="institution-activity"><div><span className="activity-dot purple"/><span><strong>{classes.length} lớp học phần</strong><small>{demoMode ? `${studentCount} sinh viên trong roster mô phỏng` : "Roster chưa kết nối"}</small></span></div><div><span className="activity-dot green"/><span><strong>{majors.length} ngành trong danh mục</strong><small>Hệ cao đẳng và trung cấp</small></span></div><div><span className="activity-dot orange"/><span><strong>{accounts.length} tài khoản trải nghiệm</strong><small>{demoMode ? "3 vai trò demo · quản trị qua Google" : "IdP của trường chưa kết nối"}</small></span></div></div></section><section className="role-panel"><div className="role-panel-heading"><div><h2>Thao tác quản trị</h2><p>Mở nhanh danh mục và báo cáo</p></div></div><div className="admin-quick-actions">{["Ngành đào tạo","Lớp học phần","Tài khoản","Báo cáo"].map((item,index)=><button key={item} onClick={()=>setSection(item)}><span className={`task-icon task-${["purple","orange","purple","orange"][index]}`}><Icon name={(["book","users","users","chart"] as IconName[])[index]}/></span><span>{item}</span><Icon name="chevron" size={16}/></button>)}</div></section></div>}
      {section==="Ngành đào tạo"&&<section className="role-panel major-panel"><div className="role-panel-heading"><div><h2>Danh mục ngành đào tạo</h2><p>{filteredMajors.length} ngành phù hợp · tìm theo tên hoặc nhóm</p></div><label className="major-level-filter"><span className="sr-only">Lọc theo trình độ</span><select value={level} onChange={(event) => setLevel(event.target.value)}><option>Tất cả trình độ</option><option>Cao đẳng</option><option>Trung cấp</option></select></label></div><label className="search-field major-search"><Icon name="search" size={16}/><span className="sr-only">Tìm ngành đào tạo</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên ngành hoặc nhóm ngành…"/></label><div className="major-list">{filteredMajors.map((major) => <article className="major-row" key={major.id}><span className="major-level-mark">{major.level === "Cao đẳng" ? "CĐ" : "TC"}</span><div className="major-info"><strong>{major.name}</strong><small>{major.group}</small><details className="major-source-links"><summary>Tài liệu TDC ({major.resources?.length || 0})</summary><div>{major.resources?.map((resource) => <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer"><strong>{resource.title} · {resource.year}</strong><small>{resource.description}</small></a>)}</div></details></div><span className="major-level-label">{major.level}</span>{major.recruitment2026 && <span className="recruitment-badge">Tuyển sinh 2026*</span>}</article>)}{filteredMajors.length === 0 && <div className="empty-state"><strong>Không tìm thấy ngành phù hợp</strong><p>Thử từ khóa khác hoặc chọn trình độ khác.</p></div>}</div></section>}
      {section==="Lớp học phần"&&<section className="role-panel"><div className="role-panel-heading"><div><h2>Lớp học phần trong kỳ</h2><p>Phân bổ theo ngành, học phần và giảng viên.</p></div></div><div className="roster-table-wrap"><table className="roster-table"><thead><tr><th>MÃ LỚP</th><th>NGÀNH</th><th>HỌC PHẦN</th><th>GIẢNG VIÊN</th><th>SĨ SỐ</th></tr></thead><tbody>{classes.map((item)=><tr key={item.id}><td><strong>{item.code}</strong></td><td>{item.major}</td><td>{item.course}</td><td>{item.teacher}</td><td>{item.students.length}</td></tr>)}</tbody></table></div></section>}
      {section==="Tài khoản"&&<><InstitutionRosterImportPanel majors={majors} rosterAccounts={rosterAccounts} onImport={importRosterAccounts}/><section className="role-panel account-panel"><div className="role-panel-heading"><div><h2>Tài khoản trải nghiệm</h2><p>Ba vai trò trải nghiệm và các tài khoản sinh viên được cấp từ roster demo; quản trị viên đăng nhập bằng Google.</p></div><span className="small-count">{accounts.length+rosterAccounts.length} tài khoản</span></div><div className="demo-account-list">{accounts.map((account) => <div className="demo-account-row" key={account.id}><span className="demo-account-avatar">{initials(account.fullName)}</span><span><strong>{account.fullName}</strong><small>{account.username}</small></span><span className="role-chip">{roleNames[account.role]}</span><span className="sample-data-label">Dữ liệu mô phỏng</span></div>)}</div><p className="role-disclaimer">Tài khoản demo sinh viên dùng MSSV làm tên đăng nhập và mật khẩu khởi tạo riêng; tài khoản chính thức phải qua SSO TDC.</p></section><section className="role-panel credential-panel"><div className="role-panel-heading"><div><h2>Cấp đăng nhập demo cho sinh viên</h2><p>Chọn lớp đã nhập roster. Mỗi sinh viên nhận một username theo MSSV và mật khẩu ngẫu nhiên.</p></div><span className="small-count">{rosterAccounts.length} đã cấp trong phiên API này</span></div><div className="credential-provision-row"><label className="form-field"><span>Lớp sinh viên</span><select value={credentialClassId} onChange={(event)=>setCredentialClassId(event.target.value)}>{classes.map((item)=><option key={item.id} value={item.id}>{item.code} · {item.major} · {item.students.length} SV</option>)}</select></label><label className="credential-reset-toggle"><input type="checkbox" checked={resetExistingCredentials} onChange={(event)=>setResetExistingCredentials(event.target.checked)}/><span><strong>Cấp lại mật khẩu đã có</strong><small>Mật khẩu cũ sẽ ngừng hoạt động.</small></span></label><button className="button button-primary" onClick={()=>void provisionClassAccounts()} disabled={provisioning||!classes.find((item)=>item.id===credentialClassId)?.students.length}>{provisioning?"Đang tạo tài khoản…":resetExistingCredentials?"Cấp / đổi mật khẩu cho lớp":"Cấp tài khoản cho lớp"}</button></div>{credentialNotice&&<div className="credential-notice" role="status">{credentialNotice}</div>}{provisionedCredentials.length>0&&<div className="credential-results"><div className="role-panel-heading"><div><h3>Mật khẩu khởi tạo · chỉ hiển thị ở lần cấp này</h3><p>Tải CSV và chuyển bảo mật cho sinh viên; mật khẩu cũ không thể xem lại.</p></div><button className="button button-secondary" onClick={downloadProvisionedCredentials}><Icon name="file" size={15}/> Tải CSV</button></div><div className="table-scroll"><table className="grade-table"><thead><tr><th>MSSV / TÊN ĐĂNG NHẬP</th><th>MẬT KHẨU</th><th>HỌ TÊN</th><th>EMAIL GOOGLE</th><th>TRẠNG THÁI</th></tr></thead><tbody>{provisionedCredentials.map((item)=><tr key={item.username}><td><strong>{item.username}</strong></td><td><code>{item.initialPassword||"Đã cấp trước đó"}</code></td><td>{item.fullName}</td><td>{item.email||"—"}</td><td>{item.status==="created"?"Vừa tạo":item.status==="reset"?"Đã đổi mật khẩu":"Đã có, không đổi mật khẩu"}</td></tr>)}</tbody></table></div></div>}<div className="roster-account-list"><div className="role-panel-heading"><div><h3>Tài khoản hiện có</h3><p>Chỉ giữ trong bộ nhớ API demo và sẽ mất khi khởi động lại dịch vụ.</p></div><span className="small-count">{rosterAccounts.length} sinh viên</span></div>{rosterAccounts.length?rosterAccounts.map((account)=><div className="roster-account-row" key={account.id}><span className="avatar">{initials(account.fullName)}</span><span><strong>{account.fullName}</strong><small>{account.studentCode} · {account.className}{account.email?` · ${account.email}`:""}</small></span><span className="role-chip">Sinh viên</span></div>):<p className="role-disclaimer">Chưa có tài khoản cá nhân. Hãy nhập roster CSV ở trang Lớp học, rồi cấp tài khoản cho lớp này.</p>}</div><p className="role-disclaimer">Đây là luồng trải nghiệm tại máy local; không dùng thông tin này cho cổng thật. Khi kết nối TDC cần đồng bộ MSSV và đăng nhập SSO.</p></section></>}
      {section==="Báo cáo"&&<><PageTitle eyebrow="BÁO CÁO TOÀN TRƯỜNG · HỌC KỲ I" title="Báo cáo đào tạo" description="Tổng hợp đề đã giao và kết quả lượt thi trong dữ liệu demo."><button className="button button-secondary" onClick={exportInstitutionReport}><Icon name="file" size={16}/> Xuất CSV</button></PageTitle><div className="role-stats institution-report-stats"><article className="role-stat"><span>Ngành trong danh mục</span><strong>{majors.length}</strong><small>Cao đẳng và trung cấp</small></article><article className="role-stat"><span>Lớp có dữ liệu</span><strong>{overview?.classes ?? classes.length}</strong><small>{overview ? `${overview.students} sinh viên trong roster/kết quả` : `${studentCount} sinh viên mẫu`}</small></article><article className="role-stat"><span>Đề đã xuất bản</span><strong>{overview?.publishedExams ?? exams.filter((item)=>item.published!==false).length}</strong><small>{overview ? `${overview.publishedAssignments} bài tập đã giao` : "Được giao theo lớp"}</small></article><article className="role-stat"><span>Điểm trung bình</span><strong>{attempts.length?averageScore.toFixed(1):"—"}</strong><small>{attempts.length} lượt thi · thang 10</small></article></div><section className="role-panel institution-report-panel"><div className="role-panel-heading"><div><h2>Lượt thi gần đây</h2><p>Dữ liệu cập nhật theo các lần nộp trong bản demo.</p></div><span className="small-count">{attempts.length} lượt</span></div><div className="table-scroll"><table className="grade-table"><thead><tr><th>SINH VIÊN / MSSV</th><th>BÀI KIỂM TRA</th><th>LỚP</th><th>ĐIỂM</th><th>NỘP LÚC</th><th>GIÁM SÁT</th></tr></thead><tbody>{[...attempts].sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)).map((attempt)=><tr key={attempt.id}><td><strong>{attempt.studentName}</strong><small>{attempt.studentCode||attempt.email||attempt.studentId}{attempt.major?` · ${attempt.major}`:""}</small>{formatCandidateDetails(attempt.candidateDetails) && <small>{formatCandidateDetails(attempt.candidateDetails)}</small>}</td><td>{exams.find((item)=>item.id===attempt.examId)?.title||"Đề đã lưu trữ"}</td><td>{exams.find((item)=>item.id===attempt.examId)?.className||"—"}</td><td>{attempt.score}/{attempt.totalPoints}</td><td>{formatDate(attempt.submittedAt)}</td><td><span className={"integrity-table-badge " + (attempt.integrityEvents?.length ? "flagged" : attempt.integrityEvents ? "clean" : "unknown")}>{attempt.integrityEvents?.length ? attempt.integrityEvents.length + " tín hiệu" : attempt.integrityEvents ? "Không ghi nhận" : "Chưa có log"}</span></td></tr>)}</tbody></table>{attempts.length===0&&<EmptyState title="Chưa có lượt thi" description="Kết quả sẽ xuất hiện sau khi sinh viên hoàn thành bài thi demo."/>}</div></section></>}
      <p className="role-disclaimer">* Danh mục ngành tổng hợp từ tài liệu TDC năm 2025–2026; ba ngành tuyển sinh 2026 được gắn dấu theo thông tin FIT-TDC. Đây chưa phải dữ liệu quản trị chính thức.</p>
    </div>
  </main>;
}

function PageTitle({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-title-row"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="page-actions">{children}</div></div>;
}

function Dashboard({ user, exams, classes, onCreate, onImport, onSeeAll, query, setQuery, assignments, submissions, attempts }: { user: MeoUser; exams: Exam[]; classes: DemoClass[]; onCreate: () => void; onImport: () => void; onSeeAll: () => void; query: string; setQuery: (value: string) => void; assignments: DemoAssignment[]; submissions: DemoSubmission[]; attempts: DemoAttempt[] }) {
  return <>
    <PageTitle eyebrow={new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())} title={`Chào buổi sáng, ${user.fullName.split(" ").slice(-1)[0]} 👋`} description="Một ngày mới để cùng sinh viên tiến bộ hơn." >
      <button className="button button-secondary" onClick={onImport}><Icon name="file" size={17}/> Nhập đề</button>
      <button className="button button-primary" onClick={onCreate}><Icon name="plus" size={18}/> Tạo bài kiểm tra</button>
    </PageTitle>

    <section className="welcome-banner teacher-hero">
      <div className="banner-copy"><div className="banner-kicker"><span className="banner-star">✦</span> MEOTDC · KHÔNG GIAN GIẢNG DẠY</div><h2>Hành trình học tập,<br/><em>liền mạch hơn.</em></h2><p>Tạo đề, giao đúng lớp và theo dõi tiến độ trong cùng một không gian.</p><button onClick={onCreate}>Soạn đề mới <Icon name="arrow" size={16}/></button></div>
      <div className="teacher-hero-art" aria-hidden="true"><span className="teacher-orbit orbit-one"/><span className="teacher-orbit orbit-two"/><div className="hero-learning-core"><div className="hero-core-top"><span>MEOTDC</span><i>TDC</i></div><strong>LEARNING<br/>SPACE</strong><div className="hero-core-grid">{Array.from({length:9},(_,index)=><i key={index}/>)}</div></div><div className="hero-float-card hero-card-top"><span className="hero-check">✓</span><span><b>Đề kiểm tra</b><small>Cơ sở dữ liệu · 30 phút</small></span></div><div className="hero-float-card hero-card-bottom"><span className="hero-avatar">T</span><span><b>Tiến độ lớp</b><small>24/32 sinh viên</small></span><strong>75%</strong></div><span className="hero-metric-chip">HỌC KỲ I · 2026–2027</span></div>
    </section>

    <section className="stats-grid" aria-label="Tổng quan số liệu">
      <StatCard label="Lớp học phần" value={String(classes.length)} change="Trong học kỳ I · 2026–2027" icon="users" tone="lavender"/><StatCard label="Sinh viên trong lớp" value={String(classes.reduce((sum, item) => sum + item.students.length, 0))} change="Roster mẫu đang quản lý" icon="book" tone="mint"/><StatCard label="Bài tập đang mở" value={String(assignments.filter((assignment) => assignment.published).length)} change="Giao theo lớp học phần" icon="clipboard" tone="peach"/><StatCard label="Chờ chấm / đã thi" value={`${submissions.filter((item) => item.status === "submitted").length} / ${attempts.length}`} change="Bài tập chưa chấm · lượt thi" icon="chart" tone="blue"/>
    </section>

    <div className="dashboard-grid">
      <section className="panel exam-panel">
        <div className="panel-heading"><div><h2>Bài kiểm tra gần đây</h2><p>Theo dõi tiến độ các bài được giao</p></div><button className="text-link" onClick={onSeeAll}>Xem tất cả <Icon name="arrow" size={15}/></button></div>
        <ExamTable exams={exams.slice(0, 4)} compact query={query} setQuery={setQuery}/>
        {exams.length === 0 && <EmptyState title="Chưa tìm thấy bài kiểm tra" description="Thử tìm bằng tên môn học hoặc tên lớp khác."/>}
      </section>
      <section className="panel calendar-panel">
        <div className="panel-heading"><div><h2>Lịch sắp tới</h2><p>Những mốc cần lưu ý</p></div><button className="small-icon-button" aria-label="Tùy chọn lịch"><Icon name="dots"/></button></div>
        <div className="calendar-month"><button aria-label="Tháng trước">‹</button><strong>Tháng 11, 2026</strong><button aria-label="Tháng sau">›</button></div>
        <div className="calendar-grid"><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span>{[26,27,28,29,30,31,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29].map((day, index) => <span key={`${day}-${index}`} className={`${index < 6 ? "muted-day" : ""} ${day === 17 && index === 22 ? "today" : ""} ${[19, 20, 22, 24].includes(day) && index > 6 ? "has-event" : ""}`}>{day}</span>)}</div>
        <div className="upcoming-list"><div className="upcoming-label">SẮP ĐẾN</div><UpcomingItem day="20" month="THG 11" color="purple" title="Kiểm tra giữa kỳ" subtitle="Cơ sở dữ liệu · CĐ23_TH1"/><UpcomingItem day="22" month="THG 11" color="orange" title="Ôn tập chương 4" subtitle="Mạng máy tính · CĐ24_MMT2"/></div>
      </section>
    </div>

    <section className="tip-strip"><span className="tip-icon"><Icon name="spark" size={18}/></span><p><strong>Mẹo nhỏ:</strong> Bạn có thể nhập đề từ Word hoặc PDF để tạo ngân hàng câu hỏi nhanh hơn.</p><button onClick={onImport}>Tìm hiểu thêm <Icon name="arrow" size={14}/></button></section>
    <div className="footer-note">MeoTDC <span>·</span> Không gian học tập dành cho cộng đồng TDC</div>
  </>;
}

function StatCard({ label, value, change, icon, tone }: { label: string; value: string; change: string; icon: IconName; tone: string }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon name={icon} size={18}/></span></div><div className="stat-value">{value}</div><div className="stat-change"><span className="change-mark">↗</span>{change}</div></article>;
}

function ExamPage({ exams, query, setQuery, onCreate, onImport, onPublish, onUnpublish }: { exams: Exam[]; query: string; setQuery: (value: string) => void; onCreate: () => void; onImport: () => void; onPublish: (examId: string) => void; onUnpublish: (examId: string) => void }) {
  const [filter, setFilter] = useState("Tất cả");
  const shown = filter === "Tất cả" ? exams : filter === "Bản nháp" ? exams.filter((exam) => exam.published === false) : exams.filter((exam) => exam.published !== false && liveExamStatus(exam) === filter);
  return <>
    <PageTitle eyebrow="QUẢN LÝ ĐÁNH GIÁ" title="Bài kiểm tra" description="Tạo, giao bài và theo dõi kết quả của các lớp học phần."><button className="button button-secondary" onClick={onImport}><Icon name="file" size={17}/> Nhập từ tệp</button><button className="button button-primary" onClick={onCreate}><Icon name="plus" size={18}/> Tạo bài kiểm tra</button></PageTitle>
    <div className="filter-bar"><div className="filter-tabs">{["Tất cả", "Đang diễn ra", "Sắp diễn ra", "Đã kết thúc", "Bản nháp"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><label className="search-field"><Icon name="search" size={17}/><input id="exam-search" placeholder="Tìm đề theo tên, môn, lớp…" value={query} onChange={(e) => setQuery(e.target.value)}/></label></div>
    <section className="panel full-exam-panel"><div className="panel-heading"><div><h2>{shown.length} bài kiểm tra</h2><p>Nháp, đã xuất bản và trạng thái tham gia của lớp.</p></div></div><ExamTable exams={shown} query={query} setQuery={setQuery} onTogglePublish={(exam) => exam.published === false ? onPublish(exam.id) : onUnpublish(exam.id)}/>{shown.length === 0 && <EmptyState title="Không có bài nào trong mục này" description="Bạn có thể tạo bài mới hoặc đổi bộ lọc."/>}</section>
  </>;
}

function AssignmentPage({ assignments, submissions, onCreate, onGrade }: { assignments: DemoAssignment[]; submissions: DemoSubmission[]; onCreate: () => void; onGrade: (submissionId: string, score: number, feedback: string, status: DemoSubmission["status"]) => void }) {
  const [filter, setFilter] = useState("Tất cả");
  const shown = assignments.filter((assignment) => filter === "Tất cả" || (filter === "Bản nháp" ? !assignment.published : assignment.published));
  const pending = submissions.filter((submission) => submission.status === "submitted").length;
  return <><PageTitle eyebrow="GIAO NHIỆM VỤ VÀ PHẢN HỒI" title="Bài tập" description="Giao nhiệm vụ nộp tệp hoặc nội dung; xem bài nộp và trả nhận xét."><button className="button button-primary" onClick={onCreate}><Icon name="plus" size={18}/> Tạo bài tập</button></PageTitle><div className="role-stats assignment-stats"><article className="role-stat"><span>Đang giao</span><strong>{assignments.filter((item) => item.published).length}</strong><small>Hiển thị với sinh viên theo lớp</small></article><article className="role-stat"><span>Chờ chấm</span><strong>{pending}</strong><small>Có câu trả lời hoặc tệp đính kèm</small></article><article className="role-stat"><span>Đã nộp</span><strong>{submissions.length}</strong><small>Tất cả lớp mẫu</small></article></div><div className="filter-bar"><div className="filter-tabs">{["Tất cả", "Đang giao", "Bản nháp"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><span className="small-count">{shown.length} bài tập</span></div><div className="assignment-list">{shown.map((assignment) => { const taskSubmissions = submissions.filter((submission) => submission.assignmentId === assignment.id); return <section className="role-panel assignment-card" key={assignment.id}><div className="assignment-card-heading"><span className="task-icon task-orange"><Icon name="file"/></span><div><div className="eyebrow">{assignment.course} · {assignment.className}</div><h2>{assignment.title}</h2><p>{assignment.description}</p></div><span className={`status-badge ${assignment.published ? "status-live" : "status-done"}`}><i/>{assignment.published ? "Đang giao" : "Bản nháp"}</span></div><div className="assignment-card-meta"><span>Hạn nộp <strong>{formatDate(assignment.dueAt)}</strong></span><span>Thang điểm <strong>{assignment.points}</strong></span><span>Đã nộp <strong>{taskSubmissions.length}</strong></span></div><div className="submission-review-list">{taskSubmissions.length === 0 ? <div className="empty-submission">Chưa có sinh viên nộp bài cho nhiệm vụ này.</div> : taskSubmissions.map((submission) => <SubmissionReview key={submission.id} submission={submission} assignment={assignment} onGrade={onGrade}/>)}</div></section>; })}{shown.length === 0 && <EmptyState title="Chưa có bài tập" description="Tạo một nhiệm vụ để giao cho lớp."/>}</div></>;
}

function SubmissionReview({ submission, assignment, onGrade }: { submission: DemoSubmission; assignment: DemoAssignment; onGrade: (submissionId: string, score: number, feedback: string, status: DemoSubmission["status"]) => void }) {
  const [score, setScore] = useState(String(submission.score ?? ""));
  const [feedback, setFeedback] = useState(submission.feedback || "");
  return <article className="submission-review"><div className="submission-student"><span className="avatar">{initials(submission.studentName)}</span><span><strong>{submission.studentName}</strong><small>Nộp {formatDate(submission.submittedAt)}</small></span><span className={`status-badge ${submission.status === "graded" ? "status-live" : submission.status === "revision" ? "status-soon" : "status-done"}`}><i/>{submission.status === "graded" ? "Đã chấm" : submission.status === "revision" ? "Cần nộp lại" : "Chờ chấm"}</span></div><p className="submission-response">{submission.response || "Sinh viên đã nộp tệp đính kèm."}{submission.fileName && (submission.fileId ? <a className="submission-file submission-file-link" href={`/api/v1/assignments/submission-files/${submission.fileId}`}><Icon name="file" size={14}/>{submission.fileName} · Tải tệp</a> : <span className="submission-file"><Icon name="file" size={14}/>{submission.fileName}</span>)}</p><div className="submission-grade-controls"><label className="form-field"><span>Điểm / {assignment.points}</span><input type="number" min="0" max={assignment.points} step="0.25" value={score} onChange={(event) => setScore(event.target.value)} placeholder="0"/></label><label className="form-field"><span>Nhận xét</span><input value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Nhận xét cho sinh viên…"/></label><button className="button button-primary" onClick={() => onGrade(submission.id, Number(score || 0), feedback, "graded")}>Lưu điểm</button><button className="button button-secondary" onClick={() => onGrade(submission.id, Number(score || 0), feedback || "Vui lòng bổ sung nội dung theo yêu cầu.", "revision")}>Nộp lại</button></div></article>;
}

function ExamTable({ exams, compact = false, query, setQuery, onTogglePublish }: { exams: Exam[]; compact?: boolean; query: string; setQuery: (value: string) => void; onTogglePublish?: (exam: Exam) => void }) {
  return <div className={`table-scroll ${compact ? "compact" : ""}`}><table className="exam-table"><thead><tr><th><label className="sr-only" htmlFor="select-all">Chọn tất cả</label><input id="select-all" type="checkbox" aria-label="Chọn tất cả bài kiểm tra"/></th><th>TÊN BÀI KIỂM TRA</th><th>HỌC PHẦN / LỚP</th><th>MỞ / ĐÓNG ĐỀ</th><th>BÀI ĐÃ NỘP</th><th>TRẠNG THÁI</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{exams.map((exam, index) => <tr key={exam.id}><td><input type="checkbox" aria-label={`Chọn ${exam.title}`}/></td><td><div className="exam-name-cell"><span className={`subject-icon subject-${index % 4}`}><Icon name={index % 2 === 0 ? "clipboard" : "file"} size={16}/></span><span><strong>{exam.title}</strong><small>{exam.randomQuestionCount ? `Rút ${exam.randomQuestionCount}/${exam.questions?.length || exam.questionCount} câu` : `${exam.questionCount} câu hỏi`} · {exam.durationMinutes || 30} phút</small></span></div></td><td><span className="course-name">{exam.course}</span><small className="class-name">{exam.className}</small></td><td><span className="due-date"><Icon name="clock" size={14}/>{exam.opensAt ? `Mở ${formatDate(exam.opensAt)} · ` : ""}Đóng {formatDate(exam.dueAt)}</span></td><td><span className="submission-count">{exam.submissions} <small>bài</small></span></td><td><span className={`status-badge ${exam.published === false ? "status-done" : statusClass(liveExamStatus(exam))}`}><i/>{exam.published === false ? "Bản nháp" : liveExamStatus(exam)}</span></td><td>{onTogglePublish && <button className={`table-action ${exam.published === false ? "publish-action" : ""}`} onClick={() => onTogglePublish(exam)}>{exam.published === false ? "Xuất bản" : "Thu hồi"}</button>}</td></tr>)}</tbody></table>
    {!compact && <div className="table-foot"><span>Hiển thị {exams.length} bài kiểm tra</span><div><button disabled>‹ Trước</button><button disabled>Sau ›</button></div></div>}</div>;
}

function ClassesPage({ majors, initialClasses }: { majors: Major[]; initialClasses: DemoClass[] }) {
  const majorsForClass = majors.map((item) => item.name);
  const [classes, setClasses] = useState<DemoClass[]>(initialClasses);
  const [selectedClass, setSelectedClass] = useState(seedClasses[0].id);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState("");
  const [rosterPreview, setRosterPreview] = useState<RosterImportPreview | null>(null);
  useEffect(() => { setClasses(demoMode ? readDemoData<DemoClass[]>("classes", initialClasses) : initialClasses); }, [initialClasses]);
  const selected = classes.find((item) => item.id === selectedClass) || classes[0];
  const filtered = classes.filter((item) => `${item.code} ${item.name} ${item.major} ${item.course}`.toLocaleLowerCase("vi-VN").includes(query.toLocaleLowerCase("vi-VN")));
  function saveClasses(next: DemoClass[]) { setClasses(next); writeDemoData("classes", next); }
  function createClass(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const item: DemoClass = { id: `class-${crypto.randomUUID()}`, code: String(form.get("code") || "").trim().toUpperCase(), name: String(form.get("name") || "").trim(), major: String(form.get("major") || "Công nghệ thông tin"), course: String(form.get("course") || "Chưa gán học phần"), teacher: "Trần Minh Giang", students: [] }; const next = [...classes,item]; saveClasses(next); setSelectedClass(item.id); setShowCreate(false); setNotice(`Đã tạo lớp ${item.code}.`); }
  async function importRoster(file?: File) {
    if (!file || !selected) return;
    const source = (await file.text()).replace(/^\uFEFF/, "");
    const lines = source.split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) { setNotice("Tệp CSV đang trống."); return; }
    const separator = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
    const rows = lines.map((line) => parseDelimitedRow(line, separator));
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi-VN").trim();
    const headers = rows[0].map(normalize);
    const nameColumn = headers.findIndex((value) => /^(ho ten|ten sinh vien|student name|name)$/.test(value));
    const codeColumn = headers.findIndex((value) => /^(mssv|ma sinh vien|student id|student code)$/.test(value));
    const emailColumn = headers.findIndex((value) => /^(email|gmail|email sinh vien|student email)$/.test(value));
    if (nameColumn < 0 || codeColumn < 0) {
      setNotice("CSV cần có tiêu đề cột MSSV và Họ tên. Hãy tải danh sách mẫu để đối chiếu.");
      return;
    }
    const data = rows.slice(1);
    const existingCodes = new Set(selected.students.map((name, index) => (selected.studentCodes?.[name] || demoRosterCode(selected, name, index)).trim().toLocaleUpperCase("vi-VN")));
    const existingNames = new Set(selected.students.map((name) => normalize(name)));
    const seenCodes = new Set<string>();
    const seenNames = new Set<string>();
    const students: RosterImportStudent[] = [];
    const issues: string[] = [];
    let skipped = 0;
    let issueCount = 0;
    data.forEach((row, index) => {
      if (row.every((cell) => !cell.trim())) return;
      const line = index + 2;
      const studentCode = (row[codeColumn] || "").trim().toLocaleUpperCase("vi-VN");
      const fullName = (row[nameColumn] || "").trim().replace(/\s+/g, " ");
      const email = (emailColumn >= 0 ? row[emailColumn] : "").trim().toLowerCase();
      const problems: string[] = [];
      if (!studentCode) problems.push("thiếu MSSV");
      if (!fullName) problems.push("thiếu họ tên");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push("email không hợp lệ");
      const normalizedName = normalize(fullName);
      if (studentCode && (existingCodes.has(studentCode) || seenCodes.has(studentCode))) problems.push("MSSV bị trùng");
      if (fullName && (existingNames.has(normalizedName) || seenNames.has(normalizedName))) problems.push("họ tên bị trùng trong lớp");
      if (problems.length) {
        issueCount += 1;
        if (/MSSV bị trùng|họ tên bị trùng/.test(problems.join(" "))) skipped += 1;
        if (issues.length < 12) issues.push("Dòng " + line + ": " + problems.join(", ") + ".");
        return;
      }
      seenCodes.add(studentCode);
      seenNames.add(normalizedName);
      students.push({ studentCode, fullName, email, line });
    });
    setRosterPreview({ fileName: file.name, students, totalRows: data.filter((row) => row.some((cell) => cell.trim())).length, skipped, issueCount, issues });
  }
  function confirmRosterImport() {
    if (!rosterPreview || !selected) return;
    const studentCodes = { ...(selected.studentCodes || {}) };
    const studentEmails = { ...(selected.studentEmails || {}) };
    for (const student of rosterPreview.students) {
      studentCodes[student.fullName] = student.studentCode;
      if (student.email) studentEmails[student.fullName] = student.email;
    }
    const names = rosterPreview.students.map((student) => student.fullName);
    const next = classes.map((item) => item.id === selected.id ? { ...item, students: [...item.students, ...names], studentCodes, studentEmails } : item);
    saveClasses(next);
    setNotice("Đã nhập " + names.length + " sinh viên" + (rosterPreview.issueCount ? "; bỏ qua " + rosterPreview.issueCount + " dòng cần sửa" : "") + ".");
    setRosterPreview(null);
  }
  function downloadRoster() { if (!selected) return; downloadCsvFile(`${selected.code}-danh-sach.csv`,[["MSSV","Họ tên","Email","Lớp","Ngành"],...selected.students.map((name,index)=>[demoRosterCode(selected,name,index),name,selected.studentEmails?.[name]||"",selected.code,selected.major])]); }
  if (!demoMode) return <>
    <PageTitle eyebrow="LỚP ĐƯỢC PHÂN CÔNG" title="Lớp học" description="Danh sách lớp và roster đồng bộ từ máy chủ trong phạm vi quyền của bạn."><button className="button button-secondary" onClick={downloadRoster} disabled={!selected}><Icon name="file" size={16}/> Xuất danh sách</button></PageTitle>
    <div className="class-management"><section className="panel class-list-panel"><div className="class-list-heading"><h2>Lớp của tôi <span>{classes.length}</span></h2><label className="search-field"><Icon name="search" size={15}/><input placeholder="Tìm mã lớp, ngành…" value={query} onChange={(event) => setQuery(event.target.value)}/></label></div>
      <div className="class-list">{filtered.map((item, index) => <button key={item.id} className={`class-list-item ${selected?.id === item.id ? "selected" : ""}`} onClick={() => setSelectedClass(item.id)}><span className={`class-card-icon subject-${index % 4}`}><Icon name="users" size={17}/></span><span><strong>{item.code}</strong><small>{item.major || "Ngành chưa đồng bộ"} · {item.course}</small></span><span className="class-list-count">{item.students.length}</span></button>)}{filtered.length === 0 && <p className="role-disclaimer">Máy chủ chưa có lớp được gán. Hãy cấu hình mã lớp cho giảng viên hoặc đồng bộ roster với trường.</p>}</div>
    </section>{selected && <section className="panel class-detail-panel"><div className="role-panel-heading"><div><div className="eyebrow">ROSTER MÁY CHỦ</div><h2>{selected.name}</h2><p>{selected.code} · {selected.major || "Ngành chưa đồng bộ"} · {selected.course}</p></div><span className="small-count">{selected.students.length} sinh viên</span></div><div className="roster-table-wrap"><table className="roster-table"><thead><tr><th>MSSV</th><th>HỌ TÊN</th><th>EMAIL</th></tr></thead><tbody>{selected.students.map((name, index) => <tr key={`${name}-${index}`}><td>{selected.studentCodes?.[name] || "—"}</td><td><strong>{name}</strong></td><td>{selected.studentEmails?.[name] || "—"}</td></tr>)}</tbody></table>{selected.students.length === 0 && <EmptyState title="Chưa có roster" description="Nhà trường cần nhập danh sách và cấp quyền lớp trước."/>}</div></section>}</div>
  </>;  return <><PageTitle eyebrow="TỔ CHỨC LỚP HỌC PHẦN" title="Lớp học" description="Quản lý lớp, ngành, học phần và danh sách sinh viên theo học kỳ."><button className="button button-secondary" onClick={downloadRoster} disabled={!selected}><Icon name="file" size={16}/> Xuất danh sách</button><button className="button button-primary" onClick={() => setShowCreate(true)}><Icon name="plus" size={18}/> Tạo lớp</button></PageTitle><div className="class-management"><section className="panel class-list-panel"><div className="class-list-heading"><h2>Lớp của tôi <span>{classes.length}</span></h2><label className="search-field"><Icon name="search" size={15}/><input placeholder="Tìm mã lớp, ngành…" value={query} onChange={(event)=>setQuery(event.target.value)}/></label></div><div className="class-list">{filtered.map((item,index)=><button key={item.id} className={`class-list-item ${selected?.id===item.id?"selected":""}`} onClick={()=>setSelectedClass(item.id)}><span className={`class-card-icon subject-${index%4}`}><Icon name="users" size={17}/></span><span><strong>{item.code}</strong><small>{item.major} · {item.course}</small></span><span className="class-list-count">{item.students.length}</span></button>)}</div></section>{selected && <section className="panel class-detail-panel"><div className="role-panel-heading"><div><div className="eyebrow">HỌC KỲ I · 2026–2027</div><h2>{selected.name}</h2><p>{selected.code} · {selected.major} · {selected.course}</p></div><span className="small-count">{selected.students.length} sinh viên</span></div><div className="class-owner-strip"><span className="avatar">{initials(selected.teacher)}</span><span><small>Giảng viên phụ trách</small><strong>{selected.teacher}</strong></span><span className="role-chip">Đang hoạt động</span></div><div className="roster-toolbar"><strong>Danh sách sinh viên</strong><label className="button button-secondary roster-upload-button"><Icon name="file" size={15}/> Nhập CSV<input type="file" accept=".csv,.txt" onChange={(event)=>{ void importRoster(event.target.files?.[0]); event.currentTarget.value = ""; }}/></label></div><div className="roster-table-wrap"><table className="roster-table"><thead><tr><th>MSSV</th><th>HỌ TÊN</th><th>GMAIL</th><th>TRẠNG THÁI</th></tr></thead><tbody>{selected.students.map((name,index)=><tr key={`${name}-${index}`}><td>{demoRosterCode(selected,name,index)}</td><td><span className="roster-student"><span className="avatar">{initials(name)}</span><strong>{name}</strong></span></td><td>{selected.studentEmails?.[name]||"—"}</td><td><span className="status-badge status-live"><i/>Đã ghi danh</span></td></tr>)}</tbody></table>{selected.students.length===0&&<EmptyState title="Lớp chưa có sinh viên" description="Nhập danh sách CSV để thêm người học vào lớp demo."/>}</div><p className="role-disclaimer">CSV hỗ trợ MSSV, Họ tên và Email/Gmail. Nếu Google email khớp roster, MeoTDC sẽ gắn tài khoản với đúng lớp.</p></section>}</div>{notice&&<div role="status" className="toast"><span className="toast-check">✓</span>{notice}</div>}{rosterPreview&&<div className="modal-backdrop"><section className="modal-card roster-import-modal" role="dialog" aria-modal="true" aria-labelledby="roster-import-title"><div className="modal-heading"><div><div className="eyebrow">KIỂM TRA DANH SÁCH · {selected?.code}</div><h2 id="roster-import-title">Xem trước roster CSV</h2></div><button className="small-icon-button" onClick={()=>setRosterPreview(null)} aria-label="Đóng"><Icon name="close"/></button></div><p className="modal-intro">{rosterPreview.fileName} · chỉ thêm sinh viên sau khi bạn xác nhận.</p><div className="roster-import-summary"><span><strong>{rosterPreview.students.length}</strong><small>Dòng hợp lệ</small></span><span><strong>{rosterPreview.issueCount}</strong><small>Dòng cần sửa/bỏ qua</small></span><span><strong>{rosterPreview.totalRows}</strong><small>Tổng dòng dữ liệu</small></span></div>{rosterPreview.students.length>0&&<div className="table-scroll roster-import-table"><table className="roster-table"><thead><tr><th>MSSV</th><th>HỌ TÊN</th><th>EMAIL</th></tr></thead><tbody>{rosterPreview.students.slice(0,6).map((student)=><tr key={student.studentCode}><td>{student.studentCode}</td><td>{student.fullName}</td><td>{student.email||"—"}</td></tr>)}</tbody></table>{rosterPreview.students.length>6&&<small>Hiển thị 6 trên {rosterPreview.students.length} dòng hợp lệ.</small>}</div>}{rosterPreview.issues.length>0&&<div className="roster-import-issues" role="alert"><strong>Các dòng cần rà soát</strong><ul>{rosterPreview.issues.map((issue,index)=><li key={`${issue}-${index}`}>{issue}</li>)}</ul>{rosterPreview.issueCount>rosterPreview.issues.length&&<small>Còn {rosterPreview.issueCount-rosterPreview.issues.length} dòng khác có vấn đề.</small>}</div>}<div className="modal-note"><Icon name="spark" size={17}/><span>Kiểm tra MSSV trùng và email sai trước khi thêm. Dữ liệu vẫn chỉ nằm trong bản demo ở trình duyệt.</span></div><div className="modal-actions"><button className="button button-secondary" onClick={()=>setRosterPreview(null)}>Hủy</button><button className="button button-primary" onClick={confirmRosterImport} disabled={rosterPreview.students.length===0}>Thêm {rosterPreview.students.length} sinh viên</button></div></section></div>}{showCreate&&<div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true"><div className="modal-heading"><div><div className="eyebrow">HỌC KỲ I · 2026–2027</div><h2>Tạo lớp học phần</h2></div><button className="small-icon-button" onClick={()=>setShowCreate(false)} aria-label="Đóng"><Icon name="close"/></button></div><form onSubmit={createClass}><div className="form-row"><label className="form-field"><span>Mã lớp</span><input name="code" required placeholder="CĐ26_TH1"/></label><label className="form-field"><span>Tên lớp</span><input name="name" required placeholder="Công nghệ thông tin 26 — Nhóm 1"/></label></div><label className="form-field"><span>Ngành</span><select name="major">{majorsForClass.map((major)=><option key={major}>{major}</option>)}</select></label><label className="form-field"><span>Học phần</span><input name="course" placeholder="Ví dụ: Cơ sở dữ liệu"/></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={()=>setShowCreate(false)}>Hủy</button><button className="button button-primary">Tạo lớp</button></div></form></section></div>}</>;
}

function CoursesPage({ courses: initialCourses, onSave }: { courses: DemoCourse[]; onSave: (course: DemoCourse) => Promise<void> }) {
  const [courses, setCourses] = useState<DemoCourse[]>(initialCourses);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCourse, setShowCourse] = useState(false);
  const [lessonCourseId, setLessonCourseId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => { setCourses(initialCourses); }, [initialCourses]);
  const selected = courses.find((course) => course.id === selectedId);
  function save(next: DemoCourse[]) {
    const changed = next.find((course) => JSON.stringify(course) !== JSON.stringify(courses.find((item) => item.id === course.id)));
    setCourses(next);
    if (demoMode) writeDemoData("courses", next);
    if (changed) void onSave(changed).then(() => setNotice("Đã lưu khóa học trên máy chủ.")).catch((error) => setNotice(error instanceof Error ? error.message : "Không lưu được khóa học."));
  }
  function createCourse(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const course: DemoCourse = { id: `course-${crypto.randomUUID()}`, title: String(form.get("title") || "").trim(), code: String(form.get("code") || "").trim(), className: String(form.get("className") || "").trim(), progress: 0, chapters: [{ title: "Chương 1 · Nội dung mới", lessons: [] }] }; const next = [...courses,course]; save(next); setSelectedId(course.id); setShowCourse(false); setNotice("Đang lưu khóa học lên máy chủ…"); }
  function addLesson(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!lessonCourseId) return; const form = new FormData(event.currentTarget); const next = courses.map((course) => course.id === lessonCourseId ? { ...course, chapters: course.chapters.map((chapter,index)=>index===0?{...chapter,lessons:[...chapter.lessons,{title:String(form.get("title")||"").trim(),duration:String(form.get("duration")||"15 phút"),content:String(form.get("content")||"").trim()}]}:chapter) } : course); save(next); setLessonCourseId(null); setNotice("Đang lưu bài học lên máy chủ…"); }
  return <>
    <PageTitle eyebrow="LMS · NỘI DUNG THEO HỌC PHẦN" title="Khóa học" description="Tổ chức chương và bài học theo lớp; nội dung được lưu trên máy chủ.">
      <button className="button button-primary" onClick={() => setShowCourse(true)}><Icon name="plus" size={18}/> Tạo khóa học</button>
    </PageTitle>
    {courses.length ? <div className="course-grid">{courses.map((course, index) => {
      const lessonCount = course.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0);
      return <article className="panel course-card" key={course.id}>
        <button className={`course-cover ${["purple", "blue", "orange", "green"][index % 4]}`} onClick={() => setSelectedId(selectedId === course.id ? null : course.id)}>
          <span className="course-cover-mark"><Icon name="book" size={26}/></span><span className="course-cover-code">{course.code.split(" ·")[0]}</span><span className="course-cover-context">{course.className}</span>
        </button>
        <div className="course-body"><div className="course-subtitle">HỌC PHẦN · {course.className}</div><h2>{course.title}</h2><p>{lessonCount} bài học</p>
          <div className="progress-copy"><span>Tiến độ của lớp</span><strong>{course.progress}%</strong></div><div className="progress-track"><i style={{ width: `${course.progress}%` }}/></div>
          <button className="course-link" onClick={() => setSelectedId(selectedId === course.id ? null : course.id)}>{selectedId === course.id ? "Thu gọn" : "Mở khóa học"}<Icon name="arrow" size={15}/></button>
        </div>
      </article>;
    })}</div> : <EmptyState title="Chưa có khóa học" description="Tạo khóa học và gắn với lớp đã được phân công để sinh viên truy cập nội dung."/>}
    {selected && <section className="panel course-detail-panel"><div className="role-panel-heading"><div><div className="eyebrow">{selected.code} · {selected.className}</div><h2>{selected.title}</h2><p>{selected.chapters.length} chương · {selected.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0)} bài học</p></div><button className="button button-secondary" onClick={() => setLessonCourseId(selected.id)}><Icon name="plus" size={15}/> Thêm bài học</button></div>
      <div className="course-chapters">{selected.chapters.map((chapter, index) => <div className="course-chapter" key={`${chapter.title}-${index}`}><strong>{chapter.title}</strong>{chapter.lessons.map((lesson, lessonIndex) => <div className="course-lesson" key={`${lesson.title}-${lessonIndex}`}><span className="lesson-check">{lessonIndex + 1}</span><span><strong>{lesson.title}</strong><small>{lesson.duration} · Bài học</small></span></div>)}</div>)}</div>
    </section>}
    {notice && <div role="status" className="toast"><span className="toast-check">✓</span>{notice}</div>}
    {showCourse && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true"><div className="modal-heading"><div><div className="eyebrow">LMS · HỌC PHẦN</div><h2>Tạo khóa học</h2></div><button className="small-icon-button" onClick={() => setShowCourse(false)} aria-label="Đóng"><Icon name="close"/></button></div>
      <form onSubmit={createCourse}><label className="form-field"><span>Tên khóa học</span><input name="title" required maxLength={180} placeholder="Ví dụ: Cơ sở dữ liệu nâng cao"/></label><div className="form-row"><label className="form-field"><span>Mã học phần</span><input name="code" required maxLength={80} placeholder="CSDL-NC · 3 tín chỉ"/></label><label className="form-field"><span>Mã lớp được gán</span><input name="className" required maxLength={80} list="course-class-codes" placeholder="Nhập mã lớp được phân công"/><datalist id="course-class-codes">{(demoMode ? readDemoData<DemoClass[]>("classes", seedClasses) : []).map((item) => <option key={item.id} value={item.code}/>)}{demoMode && <option value="Toàn trường (mô phỏng)"/>}</datalist></label></div><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setShowCourse(false)}>Hủy</button><button className="button button-primary">Tạo khóa</button></div></form>
    </section></div>}
    {lessonCourseId && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true"><div className="modal-heading"><div><div className="eyebrow">NỘI DUNG KHÓA HỌC</div><h2>Thêm bài học</h2></div><button className="small-icon-button" onClick={() => setLessonCourseId(null)} aria-label="Đóng"><Icon name="close"/></button></div>
      <form onSubmit={addLesson}><label className="form-field"><span>Tên bài học</span><input name="title" required maxLength={180} placeholder="Ví dụ: JOIN và truy vấn nhiều bảng"/></label><label className="form-field"><span>Thời lượng dự kiến</span><input name="duration" maxLength={60} defaultValue="20 phút"/></label><label className="form-field"><span>Nội dung bài học</span><textarea name="content" rows={5} maxLength={20000} placeholder="Ghi bài đọc, hướng dẫn thực hành hoặc liên kết tài liệu…"/></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setLessonCourseId(null)}>Hủy</button><button className="button button-primary">Lưu bài học</button></div></form>
    </section></div>}
  </>;
}

function QuestionBankPage({ onImport }: { onImport: () => void }) {
  const [questions, setQuestions] = useState<ExamQuestion[]>(demoMode ? sampleQuestions : []);
  const [course, setCourse] = useState("Tất cả học phần");
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<ExamQuestion | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => { const stored = readDemoData<ExamQuestion[] | null>("bank-questions", null); if (stored) setQuestions(stored); else writeDemoData("bank-questions", sampleQuestions); }, []);
  const filtered = questions.filter((question) => `${question.prompt} ${question.type} ${question.topic || ""} ${question.outcome || ""} ${question.difficulty || ""}`.toLocaleLowerCase("vi-VN").includes(query.toLocaleLowerCase("vi-VN")) && (course === "Tất cả học phần" || course === "Cơ sở dữ liệu"));
  function addQuestion(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const type = String(form.get("type")) as ExamQuestion["type"]; const options = type === "single" ? String(form.get("options")||"").split("\n").map((item)=>item.trim()).filter(Boolean) : type === "true_false" ? ["Đúng","Sai"] : []; const answerInput=String(form.get("answer")||"").trim(); const answer=type==="single"?String(Math.max(0,"ABCD".indexOf(answerInput.toUpperCase()))):type==="true_false"?String(answerInput==="Sai"?1:0):answerInput; const question: ExamQuestion={id:`bank-${crypto.randomUUID()}`,prompt:String(form.get("prompt")||"").trim(),type,options,answer,points:Number(form.get("points")||1),topic:String(form.get("topic")||"").trim(),outcome:String(form.get("outcome")||"").trim(),difficulty:String(form.get("difficulty")||"Nhận biết") as QuestionDifficulty}; const next=[question,...questions]; setQuestions(next); writeDemoData("bank-questions",next); setShowCreate(false); setNotice("Câu hỏi đã thêm vào ngân hàng demo."); }
  function removeQuestion(id:string) { const next=questions.filter((question)=>question.id!==id); setQuestions(next); writeDemoData("bank-questions",next); setSelected(null); }
  return <><PageTitle eyebrow="NGÂN HÀNG HỌC PHẦN · YCCĐ · MỨC ĐỘ" title="Ngân hàng câu hỏi" description="Tái sử dụng, phân loại và kiểm tra đáp án trước khi đưa vào đề."><button className="button button-secondary" onClick={onImport}><Icon name="file" size={17}/> Nhập Word/PDF</button><button className="button button-primary" onClick={()=>setShowCreate(true)}><Icon name="plus" size={18}/> Tạo câu hỏi</button></PageTitle><section className="panel bank-summary"><span className="stat-icon lavender"><Icon name="layers"/></span><div><strong>{questions.length}</strong><span>câu hỏi đã lưu trong demo</span></div><p>Dùng nhãn học phần, dạng câu và chủ đề để tìm câu hỏi khi soạn đề.</p></section><div className="filter-bar bank-filter-bar"><div className="filter-tabs"><button className={course==="Tất cả học phần"?"selected":""} onClick={()=>setCourse("Tất cả học phần")}>Tất cả</button><button className={course==="Cơ sở dữ liệu"?"selected":""} onClick={()=>setCourse("Cơ sở dữ liệu")}>Cơ sở dữ liệu</button></div><label className="search-field"><Icon name="search" size={16}/><input placeholder="Tìm nội dung câu hỏi…" value={query} onChange={(event)=>setQuery(event.target.value)}/></label></div><section className="panel bank-question-panel"><div className="role-panel-heading"><div><h2>{filtered.length} câu hỏi</h2><p>Đáp án và điểm được lưu cùng câu hỏi.</p></div></div><div className="bank-question-list">{filtered.map((question,index)=><button className="bank-question-row" key={question.id} onClick={()=>setSelected(question)}><span className="bank-question-index">{String(index+1).padStart(2,"0")}</span><span className="bank-question-copy"><strong>{question.prompt}</strong><small>{question.type==="single"?"Trắc nghiệm 1 đáp án":question.type==="true_false"?"Đúng / Sai":question.type==="short"?"Trả lời ngắn":"Tự luận"} · {question.points} điểm · Cơ sở dữ liệu · {question.difficulty || "Chưa phân loại"}{question.topic ? ` · ${question.topic}` : ""}</small></span><span className="question-bank-answer">{question.type==="essay"?"Chấm tay":question.answer?"Có đáp án":"Thiếu đáp án"}</span><Icon name="chevron" size={16}/></button>)}{filtered.length===0&&<EmptyState title="Không tìm thấy câu hỏi" description="Thử đổi từ khóa hoặc tạo câu hỏi mới."/>}</div></section>{notice&&<div role="status" className="toast"><span className="toast-check">✓</span>{notice}</div>}{showCreate&&<div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true"><div className="modal-heading"><div><div className="eyebrow">CƠ SỞ DỮ LIỆU · NGÂN HÀNG CÁ NHÂN</div><h2>Tạo câu hỏi</h2></div><button className="small-icon-button" onClick={()=>setShowCreate(false)} aria-label="Đóng"><Icon name="close"/></button></div><form onSubmit={addQuestion}><label className="form-field"><span>Nội dung câu hỏi</span><textarea name="prompt" rows={3} required placeholder="Nhập câu hỏi…"/></label><div className="form-row"><label className="form-field"><span>Dạng câu hỏi</span><select name="type"><option value="single">Trắc nghiệm một đáp án</option><option value="true_false">Đúng / Sai</option><option value="short">Trả lời ngắn</option><option value="essay">Tự luận</option></select></label><label className="form-field"><span>Điểm</span><input name="points" type="number" min="0" step="0.25" defaultValue="1"/></label></div><label className="form-field"><span>Các phương án (mỗi phương án một dòng)</span><textarea name="options" rows={4} placeholder={"Đáp án thứ nhất\nĐáp án thứ hai\nĐáp án thứ ba\nĐáp án thứ tư"}/></label><div className="question-classification-grid bank-question-classification"><label className="form-field"><span>Chủ đề</span><input name="topic" maxLength={100} placeholder="Ví dụ: Khóa chính"/></label><label className="form-field"><span>Chuẩn đầu ra</span><input name="outcome" maxLength={120} placeholder="Nhận diện khóa trong CSDL"/></label><label className="form-field"><span>Mức độ</span><select name="difficulty" defaultValue="Nhận biết">{questionDifficultyLabels.map((level) => <option key={level}>{level}</option>)}</select></label></div><label className="form-field"><span>Đáp án đúng (A/B/C/D, Đúng/Sai hoặc nội dung)</span><input name="answer" required placeholder="A"/></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={()=>setShowCreate(false)}>Hủy</button><button className="button button-primary">Lưu vào ngân hàng</button></div></form></section></div>}{selected&&<div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true"><div className="modal-heading"><div><div className="eyebrow">CHI TIẾT CÂU HỎI · CSDL</div><h2>{selected.prompt}</h2></div><button className="small-icon-button" onClick={()=>setSelected(null)} aria-label="Đóng"><Icon name="close"/></button></div><div className="bank-detail-options">{selected.options.map((option,index)=><div key={index} className={selected.answer===String(index)?"correct-answer":""}><span>{String.fromCharCode(65+index)}</span>{option}{selected.answer===String(index)&&<strong>Đáp án</strong>}</div>)}</div><div className="modal-actions"><button className="button button-secondary" onClick={()=>removeQuestion(selected.id)}>Xóa câu hỏi</button><button className="button button-primary" onClick={()=>setSelected(null)}>Đóng</button></div></section></div>}</>;
}

function ReportsPage({ exams, attempts, submissions, assignments, onGradeAttempt }: { exams: Exam[]; attempts: DemoAttempt[]; submissions: DemoSubmission[]; assignments: DemoAssignment[]; onGradeAttempt: (attemptId: string, scores: Record<string, number>, feedback: Record<string, string>) => void }) {
  const [classFilter, setClassFilter] = useState("Tất cả lớp");
  const [integrityFilter, setIntegrityFilter] = useState<"all" | "flagged">("all");
  const [selectedAttempt, setSelectedAttempt] = useState<DemoAttempt | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [liveSessions, setLiveSessions] = useState<LiveExamAttempt[]>([]);
  useEffect(() => {
    let alive = true;
    const refreshLiveSessions = async () => {
      try { const response = await fetch("/api/v1/exam-attempts/live"); if (response.ok && alive) setLiveSessions(await response.json()); }
      catch { if (alive) setLiveSessions([]); }
    };
    void refreshLiveSessions();
    const timer = window.setInterval(() => { void refreshLiveSessions(); }, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  const filteredAttempts=attempts.filter((attempt)=>classFilter==="Tất cả lớp"||exams.some((exam)=>exam.id===attempt.examId&&exam.className===classFilter));const flaggedAttempts=filteredAttempts.filter((attempt)=>(attempt.integrityEvents||[]).length>0||(attempt.strictIntegrity===true&&!attempt.integrityEvents));const visibleAttempts=integrityFilter==="flagged"?flaggedAttempts:filteredAttempts;
  const visibleLiveSessions = liveSessions.filter((session) => classFilter === "Tất cả lớp" || session.className === classFilter);
  const average=filteredAttempts.length?filteredAttempts.reduce((sum,item)=>sum+(item.totalPoints?item.score/item.totalPoints*10:0),0)/filteredAttempts.length:0;

  const gradeBins=[0,0,0,0,0];filteredAttempts.forEach((item)=>{const score=item.totalPoints?item.score/item.totalPoints*10:0;const bin=Math.min(4,Math.floor(score/2));gradeBins[bin]++;});
  const bars=gradeBins.map((count)=>filteredAttempts.length?Math.max(8,count/filteredAttempts.length*100):0);
  const difficultQuestions=exams.flatMap((exam)=>(exam.questions||[]).filter((question)=>question.type!=="essay").map((question)=>({exam,question}))).map(({exam,question})=>{const related=filteredAttempts.filter((attempt)=>attempt.examId===exam.id&&(!attempt.questionIds||attempt.questionIds.includes(question.id)));const normalize=(value: string|string[])=>Array.isArray(value)?value.map((item)=>item.trim().toLocaleLowerCase("vi-VN")).sort().join("|"):value.trim().toLocaleLowerCase("vi-VN");const wrong=related.filter((attempt)=>normalize(attempt.answers[question.id]??"")!==normalize(question.answer)).length;return {question,wrong,total:related.length};}).filter((item)=>item.total>0).sort((a,b)=>b.wrong-a.wrong).slice(0,5);
  const outcomeStats = new Map<string, { correct: number; total: number; questions: Set<string> }>();
  for (const exam of exams) {
    if (classFilter !== "Tất cả lớp" && exam.className !== classFilter) continue;
    for (const question of exam.questions || []) {
      const outcome = question.outcome?.trim();
      if (!outcome || question.type === "essay") continue;
      const row = outcomeStats.get(outcome) || { correct: 0, total: 0, questions: new Set<string>() };
      row.questions.add(question.id);
      for (const attempt of filteredAttempts.filter((item) => item.examId === exam.id && (!item.questionIds || item.questionIds.includes(question.id)))) {
        const normalize = (value: string | string[]) => Array.isArray(value) ? [...value].map((part) => part.trim().toLocaleLowerCase("vi-VN")).sort().join("|") : value.trim().toLocaleLowerCase("vi-VN");
        row.total += 1;
        if (normalize(attempt.answers?.[question.id] ?? "") === normalize(question.answer)) row.correct += 1;
      }
      outcomeStats.set(outcome, row);
    }
  }
  const outcomeRows = [...outcomeStats.entries()].map(([outcome, value]) => ({ outcome, ...value, rate: value.total ? value.correct / value.total * 100 : 0 })).filter((item) => item.total > 0).sort((a, b) => a.rate - b.rate);
  function exportReport(){const rows=[["Họ tên","MSSV","Ngành","Email Google","Bài kiểm tra","Học phần","Điểm","Thang điểm","Thời gian nộp","Thông tin bổ sung","Tín hiệu giám sát","Tự nộp do vi phạm"],...filteredAttempts.map((attempt)=>{const exam=exams.find((item)=>item.id===attempt.examId);return[attempt.studentName,attempt.studentCode||"",attempt.major||"",attempt.email||"",exam?.title||"",exam?.course||"",attempt.score,attempt.totalPoints,attempt.submittedAt,formatCandidateDetails(attempt.candidateDetails),integritySummary(attempt.integrityEvents),attempt.integrityAutoSubmitted?"Có":"Không"];})];downloadCsvFile("meotdc-bang-diem-demo.csv",rows);}
  return <><PageTitle eyebrow="BÁO CÁO ĐÁNH GIÁ · HỌC KỲ I" title="Báo cáo kết quả" description="Theo dõi tham gia, phổ điểm, bài cần chấm và câu hỏi sinh viên thường sai."><button className="button button-secondary" onClick={exportReport}><Icon name="file" size={17}/> Xuất bảng điểm CSV</button></PageTitle><div className="report-filter-row"><label className="form-field"><span>Phạm vi lớp</span><select value={classFilter} onChange={(event)=>setClassFilter(event.target.value)}><option>Tất cả lớp</option>{Array.from(new Set(exams.map((exam)=>exam.className))).map((item)=><option key={item}>{item}</option>)}</select></label><span className="report-demo-label">{filteredAttempts.length} lượt làm · dữ liệu demo</span></div><section className="stats-grid report-stats"><StatCard label="Lượt đã nộp" value={String(filteredAttempts.length)} change="Theo phạm vi đang chọn" icon="clipboard" tone="lavender"/><StatCard label="Điểm trung bình" value={filteredAttempts.length?average.toFixed(1):"—"} change="Trên thang điểm 10" icon="chart" tone="mint"/><StatCard label="Bài tập chờ chấm" value={String(submissions.filter((item)=>item.status==="submitted").length)} change="Giảng viên cần phản hồi" icon="file" tone="peach"/><StatCard label="Tín hiệu cần rà soát" value={String(flaggedAttempts.length)} change="Có tín hiệu hoặc thiếu nhật ký" icon="spark" tone="blue"/></section><section className="panel live-watch-panel"><div className="role-panel-heading"><div><h2>Phiên thi đang diễn ra</h2><p>Tín hiệu do API nhận từ các lượt thi còn hoạt động.</p></div><span className="live-watch-count">{visibleLiveSessions.length} phiên</span></div><div className="live-watch-list">{visibleLiveSessions.map((session)=><article className="live-watch-row" key={session.id}><div className="live-watch-main"><i className={"live-watch-dot " + (!session.isFocused || !session.isFullscreen ? "attention" : "")}/><span><strong>{session.studentName}</strong><small>{session.studentCode||"Chưa gắn MSSV"} · {session.className} · {session.examTitle}</small></span><span className={"live-watch-state " + (session.strikeCount ? "attention" : "")}>{session.strikeCount ? session.strikeCount + " tín hiệu" : "Đang làm"}</span></div><div className="live-watch-signals"><span>{session.isFocused ? "Đang ở tab thi" : "Đã rời tab"}</span><span>{session.isFullscreen ? "Toàn màn hình" : "Đã thoát toàn màn hình"}</span><span>Cập nhật {new Date(session.lastSeenAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></div></article>)}{visibleLiveSessions.length===0&&<p className="live-watch-empty">{liveSessions.length ? "Không có phiên thi trong lớp đang chọn." : "Chưa có phiên thi API đang hoạt động."}</p>}</div><p className="live-watch-note">Làm mới mỗi 5 giây · Chỉ dùng demo trên cùng máy chủ; tín hiệu trình duyệt cần giảng viên rà soát.</p></section><section className="panel outcome-analysis-panel"><div className="outcome-analysis-heading"><div><h2>Phân tích theo chuẩn đầu ra</h2><p>Tỷ lệ trả lời đúng trên các lượt đã nộp có câu hỏi gắn chuẩn.</p></div><span>{outcomeRows.length} chuẩn</span></div><div className="outcome-analysis-list">{outcomeRows.map((row)=><article className="outcome-analysis-row" key={row.outcome}><div><strong>{row.outcome}</strong><b>{row.rate.toFixed(0)}%</b></div><div className="outcome-track"><i style={{width:`${row.rate}%`}}/></div><small>{row.correct}/{row.total} câu trả lời đúng · {row.questions.size} câu hỏi</small></article>)}{outcomeRows.length===0&&<p className="report-empty-note">Chưa có lượt làm gắn câu hỏi với chuẩn đầu ra trong phạm vi này.</p>}</div></section><div className="report-grid"><section className="panel chart-panel"><div className="panel-heading"><div><h2>Phổ điểm bài thi</h2><p>{filteredAttempts.length?"Phân bố điểm theo các khoảng 0–2 đến 8–10":"Biểu đồ sẽ có dữ liệu sau khi sinh viên nộp bài"}</p></div><span className="small-count">{filteredAttempts.length} lượt</span></div><div className="score-distribution">{bars.map((height,index)=><div className="score-bin" key={index}><span className="score-bar-value">{gradeBins[index]}</span><div><i style={{height:`${height}%`}}/></div><small>{index*2}–{index===4?10:index*2+2}</small></div>)}</div><div className="chart-legend"><i/>Lượt nộp theo khoảng điểm</div></section><section className="panel insight-panel"><span className="insight-icon"><Icon name="spark"/></span><h2>Theo dõi chất lượng câu hỏi</h2>{difficultQuestions.length?difficultQuestions.map((item)=><div className="insight-row" key={item.question.id}><strong>{item.wrong}/{item.total}</strong><p>{item.question.prompt}</p></div>):<p className="report-empty-note">Sau khi có lượt thi, câu trả lời sai nhiều sẽ xuất hiện tại đây.</p>}<div className="insight-row"><strong>{assignments.filter((item)=>item.published).length}</strong><p>Bài tập đang giao trong không gian mẫu.</p></div></section></div><section className="panel report-gradebook"><div className="role-panel-heading"><div><h2>Bảng điểm lượt thi</h2><p>Điểm khách quan đã chấm; chấm bổ sung câu tự luận nếu đề có.</p></div><span className="small-count">{visibleAttempts.length} lượt</span></div><div className="report-attempt-filters" role="group" aria-label="Lọc lượt thi"><button type="button" className={integrityFilter==="all"?"selected":""} aria-pressed={integrityFilter==="all"} onClick={()=>setIntegrityFilter("all")}>Tất cả <span>{filteredAttempts.length}</span></button><button type="button" className={integrityFilter==="flagged"?"selected":""} aria-pressed={integrityFilter==="flagged"} onClick={()=>setIntegrityFilter("flagged")}>Cần rà soát <span>{flaggedAttempts.length}</span></button></div><div className="table-scroll"><table className="grade-table"><thead><tr><th>SINH VIÊN</th><th>BÀI KIỂM TRA</th><th>LỚP</th><th>ĐIỂM</th><th>THỜI GIAN</th><th>GIÁM SÁT</th><th></th></tr></thead><tbody>{visibleAttempts.map((attempt)=><tr key={attempt.id}><td><strong>{attempt.studentName}</strong><small>{attempt.studentCode||attempt.email||attempt.studentId}{attempt.major?` · ${attempt.major}`:""}</small></td><td>{exams.find((exam)=>exam.id===attempt.examId)?.title||"Đề đã lưu trữ"}</td><td>{exams.find((exam)=>exam.id===attempt.examId)?.className||"—"}</td><td><strong>{canShowExamScore(exams.find((item)=>item.id===attempt.examId),attempt)?`${attempt.score}/${attempt.totalPoints}`:"Chờ công bố"}</strong></td><td>{formatDate(attempt.submittedAt)}</td><td><span className={"integrity-table-badge " + (attempt.integrityEvents?.length ? "flagged" : attempt.integrityEvents ? "clean" : "unknown")}>{attempt.integrityEvents?.length ? attempt.integrityEvents.length + " tín hiệu" : attempt.integrityEvents ? "Không ghi nhận" : "Chưa có log"}</span></td><td><button className="table-action" onClick={()=>setSelectedAttempt(attempt)}>Rà soát</button></td></tr>)}</tbody></table>{visibleAttempts.length===0&&<EmptyState title={integrityFilter==="flagged"?"Không có lượt thi cần rà soát":"Chưa có lượt thi"} description={integrityFilter==="flagged"?"Chưa có tín hiệu hoặc lượt thi thiếu nhật ký giám sát trong phạm vi này.":"Khi sinh viên nộp bài, bảng điểm và thống kê sẽ được cập nhật tự động."}/>}</div></section>{selectedAttempt&&<ExamAttemptReview attempt={selectedAttempt} exam={exams.find((item)=>item.id===selectedAttempt.examId)} error={reviewError} onClose={()=>{setReviewError("");setSelectedAttempt(null);}} onSave={async(scores,feedback)=>{setReviewError("");if(selectedAttempt.serverAttemptId){try{const exam=exams.find((item)=>item.id===selectedAttempt.examId);const response=await fetch(`/api/v1/exam-attempts/${selectedAttempt.serverAttemptId}/grade`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scores,feedback,releaseScore:exam?.showScore==="teacher-release"})});const payload=await response.json();if(!response.ok)throw new Error(typeof payload.message==="string"?payload.message:"Không lưu được điểm lên máy chủ.");}catch(error){setReviewError(error instanceof Error?error.message:"Không lưu được điểm lên máy chủ.");return;}}onGradeAttempt(selectedAttempt.id,scores,feedback);setSelectedAttempt(null);}}/>}</>;
}

function ExamAttemptReview({ attempt, exam, error, onClose, onSave }: { attempt: DemoAttempt; exam?: Exam; error?: string; onClose: () => void; onSave: (scores: Record<string, number>, feedback: Record<string, string>) => void | Promise<void> }) {
  const essayQuestions = (exam?.questions || []).filter((question) => question.type === "essay" && (!attempt.questionIds || attempt.questionIds.includes(question.id)));
  const [scores, setScores] = useState<Record<string, number>>(attempt.manualScores || {});
  const [feedback, setFeedback] = useState<Record<string, string>>(attempt.manualFeedback || {});
  const events = attempt.integrityEvents || [];
  const reviewStatus = attempt.integrityAutoSubmitted ? "Bài tự nộp sau khi chạm ngưỡng" : attempt.integrityEvents ? events.length ? events.length + " tín hiệu đã ghi nhận" : "Không ghi nhận tín hiệu" : "Lượt thi chưa có nhật ký";
  return <div className="modal-backdrop"><section className="modal-card exam-review-modal" role="dialog" aria-modal="true" aria-labelledby="exam-attempt-review-title">
    <div className="modal-heading"><div><div className="eyebrow">BÀI LÀM CỦA SINH VIÊN</div><h2 id="exam-attempt-review-title">{attempt.studentName}</h2><p className="role-disclaimer">{[attempt.studentCode, attempt.major, attempt.email].filter(Boolean).join(" · ")}</p><p className="modal-intro">{exam?.title || "Đề thi"} · điểm khách quan {attempt.objectiveScore ?? attempt.score}/{attempt.totalPoints}</p>{formatCandidateDetails(attempt.candidateDetails) && <p className="role-disclaimer">{formatCandidateDetails(attempt.candidateDetails)}</p>}</div><button className="small-icon-button" onClick={onClose} aria-label="Đóng"><Icon name="close"/></button></div>
    <section className={"integrity-review-panel " + (events.length ? "flagged" : attempt.integrityEvents ? "clean" : "unknown")}><div className="integrity-review-heading"><span className="integrity-review-icon">{events.length ? "!" : attempt.integrityEvents ? "✓" : "?"}</span><div><span className="exam-security-kicker">{!attempt.integrityEvents ? "CHƯA CÓ NHẬT KÝ" : attempt.strictIntegrity === false ? "GIÁM SÁT CƠ BẢN" : "GIÁM SÁT NGHIÊM NGẶT"}</span><strong>{reviewStatus}</strong><small>{attempt.integrityAutoSubmitted ? "Bài được nộp tự động; cần giảng viên xem lại nhật ký trước khi kết luận." : "Các tín hiệu ghi lại không tự kết luận gian lận."}</small></div></div>{events.length ? <ol className="integrity-review-log">{events.map((event, index) => <li key={event.at + "-" + index}><span>{integrityEventLabels[event.kind]}</span><time>{new Date(event.at).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "medium" })}</time></li>)}</ol> : <p className="integrity-review-empty">{attempt.integrityEvents ? "Không có sự kiện cần rà soát trong nhật ký này." : "Lượt thi cũ chưa lưu nhật ký giám sát."}</p>}</section>
    {essayQuestions.length === 0 ? <div className="empty-submission">Đề này không có câu tự luận. Có thể đối chiếu câu trả lời trắc nghiệm trong bảng điểm.</div> : essayQuestions.map((question, index) => <section className="essay-review-item" key={question.id}><div className="question-number-row"><strong>Câu tự luận {index + 1}</strong><span>Tối đa {question.points} điểm</span></div><p>{question.prompt}</p><div className="student-essay-answer">{String(attempt.answers[question.id] || "Chưa có câu trả lời")}</div><div className="form-row"><label className="form-field"><span>Điểm</span><input type="number" min="0" max={question.points} step="0.25" value={scores[question.id] ?? ""} onChange={(event) => setScores((current) => ({ ...current, [question.id]: Number(event.target.value) }))}/></label><label className="form-field"><span>Nhận xét</span><input value={feedback[question.id] || ""} onChange={(event) => setFeedback((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Nhận xét theo rubric…"/></label></div></section>)}
    {error&&<div role="alert" className="login-alert">{error}</div>}<div className="modal-actions"><button className="button button-secondary" onClick={onClose}>Đóng</button><button className="button button-primary" onClick={() => { void onSave(scores, feedback); }}>{exam?.showScore==="teacher-release"?"Lưu điểm & công bố":essayQuestions.length ? "Lưu điểm tự luận" : "Công bố điểm"}</button></div>
  </section></div>;
}

function UpcomingItem({ day, month, color, title, subtitle }: { day: string; month: string; color: string; title: string; subtitle: string }) {
  return <div className="upcoming-item"><div className={`date-tile ${color}`}><strong>{day}</strong><small>{month}</small></div><div><strong>{title}</strong><span>{subtitle}</span></div><Icon name="chevron" size={16}/></div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><span><Icon name="clipboard" size={22}/></span><strong>{title}</strong><p>{description}</p></div>;
}

function decodePdfLiteral(value: string) {
  return value.replace(/\\([nrtbf()\\])/g, (_match, char: string) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" })[char] || char).replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

function questionsFromImportText(source: string): ExamQuestion[] {
  const lines = source.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  const parsed: { prompt: string; options: string[]; answer: string | string[] }[] = [];
  let current: { prompt: string; options: string[]; answer: string | string[] } | null = null;
  for (const line of lines) {
    const questionMatch = line.match(/^(?:câu|cau|question|q)\s*\d*\s*[.):\-]?\s*(.+)$/i);
    const optionMatch = line.match(/^([A-D])\s*[).:\-]\s*(.+)$/i);
    const answerMatch = line.match(/^(?:đáp án|dap an|answer)\s*[:\-]?\s*([A-D](?:\s*[,;]\s*[A-D])*)\b/i);
    if (questionMatch) {
      if (current) parsed.push(current);
      current = { prompt: questionMatch[1], options: [], answer: "" };
    } else if (current && optionMatch) {
      current.options.push(optionMatch[2]);
    } else if (current && answerMatch) {
      const letters = answerMatch[1].toUpperCase().split(/\s*[,;]\s*/);
      const indexes = letters.map((letter) => String("ABCD".indexOf(letter)));
      current.answer = indexes.length > 1 ? indexes : indexes[0];
    } else if (current && !current.options.length) {
      current.prompt = `${current.prompt} ${line}`.trim();
    }
  }
  if (current) parsed.push(current);
  return parsed.map((question, index) => ({ id: `import-q-${index + 1}-${crypto.randomUUID()}`, prompt: question.prompt, type: question.options.length >= 2 ? (Array.isArray(question.answer) ? "multiple" : "single") : "short", options: question.options.length >= 2 ? question.options : [], answer: question.answer, points: Math.round((10 / Math.max(1, parsed.length)) * 100) / 100 }));
}

async function readDocxText(file: File) {
  const maxArchiveBytes = 20 * 1024 * 1024;
  const maxDocumentBytes = 24 * 1024 * 1024;
  if (!file.size) throw new Error("Tệp Word đang trống.");
  if (file.size > maxArchiveBytes) throw new Error("Tệp Word vượt giới hạn 20 MB. Hãy nén hoặc chia nhỏ đề rồi nhập lại.");
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength < 22) throw new Error("Tệp Word chưa đọc được. Hãy lưu dưới định dạng .docx chuẩn.");
  const view = new DataView(buffer);
  let eocd = -1;
  const searchStart = Math.max(0, buffer.byteLength - 22 - 0xffff);
  for (let offset = buffer.byteLength - 22; offset >= searchStart; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === buffer.byteLength) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("Tệp Word chưa đọc được. Hãy lưu dưới định dạng .docx chuẩn.");
  const diskNumber = view.getUint16(eocd + 4, true);
  const directoryDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true);
  const entries = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  let directoryOffset = view.getUint32(eocd + 16, true);
  if (diskNumber !== 0 || directoryDisk !== 0 || diskEntries !== entries) throw new Error("Tệp Word nhiều phần không được hỗ trợ.");
  if (entries === 0xffff || directoryOffset === 0xffffffff || directorySize === 0xffffffff) throw new Error("Tệp Word ZIP64 chưa được hỗ trợ. Hãy lưu lại thành DOCX thông thường.");
  const directoryEnd = directoryOffset + directorySize;
  if (directoryEnd > eocd || directoryOffset > buffer.byteLength) throw new Error("Cấu trúc tệp Word bị lỗi.");
  for (let index = 0; index < entries; index++) {
    if (directoryOffset + 46 > directoryEnd || view.getUint32(directoryOffset, true) !== 0x02014b50) throw new Error("Danh mục tệp Word bị lỗi.");
    const flags = view.getUint16(directoryOffset + 8, true);
    const method = view.getUint16(directoryOffset + 10, true);
    const compressedSize = view.getUint32(directoryOffset + 20, true);
    const uncompressedSize = view.getUint32(directoryOffset + 24, true);
    const nameLength = view.getUint16(directoryOffset + 28, true);
    const extraLength = view.getUint16(directoryOffset + 30, true);
    const commentLength = view.getUint16(directoryOffset + 32, true);
    const localOffset = view.getUint32(directoryOffset + 42, true);
    const nextEntry = directoryOffset + 46 + nameLength + extraLength + commentLength;
    if (nextEntry > directoryEnd) throw new Error("Danh mục tệp Word bị cắt cụt.");
    const name = new TextDecoder().decode(new Uint8Array(buffer, directoryOffset + 46, nameLength));
    if (name === "word/document.xml") {
      if (flags & 1) throw new Error("Tệp Word được mã hóa bằng mật khẩu nên không thể đọc.");
      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error("Tệp Word ZIP64 chưa được hỗ trợ. Hãy lưu lại thành DOCX thông thường.");
      if (uncompressedSize > maxDocumentBytes || compressedSize > buffer.byteLength || (compressedSize > 0 && uncompressedSize / compressedSize > 1000)) {
        throw new Error("Nội dung Word vượt giới hạn an toàn để trích xuất.");
      }
      if (localOffset + 30 > buffer.byteLength || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("Nội dung chính của tệp Word bị lỗi.");
      const localFlags = view.getUint16(localOffset + 6, true);
      const localMethod = view.getUint16(localOffset + 8, true);
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      if ((localFlags & 1) || localMethod !== method || dataStart + compressedSize > directoryOffset) throw new Error("Phần nội dung Word không khớp với danh mục ZIP.");
      const compressed = new Uint8Array(buffer.slice(dataStart, dataStart + compressedSize));
      let xmlBytes: Uint8Array;
      if (method === 0) xmlBytes = compressed;
      else if (method === 8) {
        const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > maxDocumentBytes || totalBytes > uncompressedSize) {
              await reader.cancel();
              throw new Error("Nội dung Word vượt giới hạn an toàn hoặc khai báo kích thước không đúng.");
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        xmlBytes = new Uint8Array(totalBytes);
        let cursor = 0;
        for (const chunk of chunks) { xmlBytes.set(chunk, cursor); cursor += chunk.byteLength; }
      } else throw new Error("Định dạng nén trong tệp Word này chưa được hỗ trợ.");
      if (xmlBytes.byteLength !== uncompressedSize) throw new Error("Nội dung Word bị thiếu hoặc hỏng khi giải nén.");
      const xml = new TextDecoder().decode(xmlBytes);
      const document = new DOMParser().parseFromString(xml, "application/xml");
      if (document.getElementsByTagName("parsererror").length) throw new Error("Nội dung XML trong tệp Word không hợp lệ.");
      const paragraphs = Array.from(document.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "p"));
      if (!paragraphs.length) throw new Error("Tệp Word không có đoạn văn bản để nhập.");
      const paragraphText = (paragraph: Element): string => {
        const readNode = (node: Node): string => {
          if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
          if (node.nodeType !== Node.ELEMENT_NODE) return "";
          const element = node as Element;
          if (element.namespaceURI !== "http://schemas.openxmlformats.org/wordprocessingml/2006/main") return "";
          if (element.localName === "tab") return "\t";
          if (element.localName === "br" || element.localName === "cr") return "\n";
          if (element.localName === "t" || element.localName === "delText") return element.textContent || "";
          return Array.from(element.childNodes).map(readNode).join("");
        };
        return Array.from(paragraph.childNodes).map(readNode).join("");
      };
      return paragraphs.map(paragraphText).filter((paragraph) => paragraph.trim()).join("\n");
    }
    directoryOffset = nextEntry;
  }
  throw new Error("Không tìm thấy nội dung văn bản trong tệp Word.");
}

async function readPdfText(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const binary = new TextDecoder("latin1").decode(bytes);
  const streams: string[] = [];
  let cursor = 0;
  while (true) {
    const streamAt = binary.indexOf("stream", cursor);
    if (streamAt < 0) break;
    const dictionaryStart = binary.lastIndexOf("<<", streamAt);
    const dictionary = binary.slice(dictionaryStart, streamAt);
    let dataStart = streamAt + 6;
    if (binary.slice(dataStart, dataStart + 2) === "\r\n") dataStart += 2;
    else if (binary[dataStart] === "\n" || binary[dataStart] === "\r") dataStart += 1;
    const endAt = binary.indexOf("endstream", dataStart);
    if (endAt < 0) break;
    let dataEnd = endAt;
    while (dataEnd > dataStart && (binary[dataEnd - 1] === "\n" || binary[dataEnd - 1] === "\r")) dataEnd--;
    const slice = bytes.slice(dataStart, dataEnd);
    if (/\/FlateDecode/.test(dictionary)) {
      try {
        const decompressed = await new Response(new Blob([slice]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer();
        streams.push(new TextDecoder("latin1").decode(decompressed));
      } catch { /* Keep searching readable, uncompressed PDF text streams. */ }
    } else streams.push(binary.slice(dataStart, dataEnd));
    cursor = endAt + 9;
  }
  const content = streams.length ? streams.join("\n") : binary;
  const extracted: string[] = [];
  for (const textBlock of content.match(/\bBT[\s\S]*?\bET/g) || [content]) {
    for (const match of textBlock.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) extracted.push(decodePdfLiteral(match[1]));
    for (const match of textBlock.matchAll(/\[((?:\\.|[^\]])*)\]\s*TJ/g)) {
      for (const part of match[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)) extracted.push(decodePdfLiteral(part[1]));
    }
  }
  return extracted.join("\n");
}

function ExamModal({ onClose, onSubmit, saving }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean }) {
  const [step, setStep] = useState(0);
  const defaultDue = new Date(Date.now() + 7 * 86400000);
  defaultDue.setMinutes(defaultDue.getMinutes() - defaultDue.getTimezoneOffset());
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("Cơ sở dữ liệu");
  const [className, setClassName] = useState(demoMode ? "CĐ23_TH1" : "");
  const [audience, setAudience] = useState<"class" | "student" | "public">("class");
  const [selectedStudentCodes, setSelectedStudentCodes] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState(defaultDue.toISOString().slice(0,16));
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [attemptsAllowed, setAttemptsAllowed] = useState(1);
  const [shuffle, setShuffle] = useState(true);
  const [showScore, setShowScore] = useState("after-submit");
  const defaultOpenAt = new Date();
  defaultOpenAt.setMinutes(defaultOpenAt.getMinutes() - defaultOpenAt.getTimezoneOffset());
  const [opensAt, setOpensAt] = useState(defaultOpenAt.toISOString().slice(0,16));
  const [randomQuestionCount, setRandomQuestionCount] = useState(0);
  const [matrixOverrides, setMatrixOverrides] = useState<Record<string, number>>({});
  const [accessPassword, setAccessPassword] = useState("");
  const [candidateFieldsText, setCandidateFieldsText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [stepError, setStepError] = useState("");
  const [showBank, setShowBank] = useState(false);
  const bankQuestions = readDemoData<ExamQuestion[]>("bank-questions", sampleQuestions);
  const targetClass = readDemoData<DemoClass[]>("classes", seedClasses).find((item) => item.code === className);
  const targetStudents = targetClass ? targetClass.students.map((fullName, index) => ({ fullName, studentCode: demoRosterCode(targetClass, fullName, index) })) : [];
  const [questions, setQuestions] = useState<ExamQuestion[]>(demoMode ? sampleQuestions.slice(0,2).map((question) => ({ ...question })) : []);
  const totalPoints = questions.reduce((sum, question) => sum + Number(question.points || 0), 0);
  const suggestedQuotas = allocateMatrixQuotas(questions, randomQuestionCount);
  const suggestedByKey = new Map(suggestedQuotas.map((quota) => [quota.key, quota.count]));
  const questionMatrixRows = matrixBuckets(questions).map((bucket) => ({ ...bucket, count: matrixOverrides[bucket.key] ?? suggestedByKey.get(bucket.key) ?? 0 }));
  const matrixQuotas: ExamMatrixQuota[] = questionMatrixRows.map(({ key, topic, outcome, difficulty, count }) => ({ key, topic, outcome, difficulty, count }));
  const matrixQuotaSum = matrixQuotas.reduce((sum, quota) => sum + quota.count, 0);
  const matrixQuotaValid = randomQuestionCount === 0 || (matrixQuotaSum === randomQuestionCount && questionMatrixRows.every((row) => Number.isInteger(row.count) && row.count >= 0 && row.count <= row.availableCount));
  const missingKeys = questions.filter((question) => question.type !== "essay" && (Array.isArray(question.answer) ? question.answer.length === 0 : !String(question.answer).trim())).length;

  useEffect(() => {
    const loadImport = (event: Event) => {
      const detail = (event as CustomEvent<{ questions: ExamQuestion[]; fileName: string }>).detail;
      if (detail?.questions?.length) { setQuestions(detail.questions); setSourceName(detail.fileName); setStep(1); }
    };
    window.addEventListener("meotdc-import-questions", loadImport);
    return () => window.removeEventListener("meotdc-import-questions", loadImport);
  }, []);

  function updateQuestion(index: number, patch: Partial<ExamQuestion>) {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question));
  }

  function setQuestionType(index: number, type: ExamQuestion["type"]) {
    const options = type === "true_false" ? ["Đúng", "Sai"] : type === "single" || type === "multiple" ? ["", "", "", ""] : [];
    updateQuestion(index, { type, options, answer: type === "true_false" ? "0" : type === "multiple" ? [] : "" });
  }

  function continueStep(event: FormEvent<HTMLFormElement>) {
    if (step < 2) { event.preventDefault(); goNext(); return; }
    onSubmit(event);
  }

  function goNext() {
    if (step === 0 && !title.trim()) { setStepError("Vui lòng nhập tên bài kiểm tra."); return; }
    if (step === 1) {
      if (questions.some((question) => !question.prompt.trim())) { setStepError("Hãy nhập nội dung cho tất cả câu hỏi."); return; }
      if (questions.some((question) => question.type === "single" && question.options.filter((option) => option.trim()).length < 2)) { setStepError("Mỗi câu trắc nghiệm cần ít nhất hai phương án."); return; }
      if (missingKeys > 0) { setStepError("Hãy nhập đáp án cho tất cả câu hỏi khách quan."); return; }
    }
    setStepError("");
    setStep((value) => Math.min(2, value + 1));
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card exam-builder-modal" role="dialog" aria-modal="true" aria-labelledby="exam-modal-title"><div className="modal-heading"><div><div className="eyebrow">SOẠN ĐỀ · {step + 1}/3</div><h2 id="exam-modal-title">Tạo bài kiểm tra</h2></div><button className="small-icon-button" onClick={onClose} aria-label="Đóng"><Icon name="close"/></button></div><div className="builder-steps">{["Thông tin", "Câu hỏi", "Cài đặt & giao"].map((label, index) => <button type="button" key={label} className={step === index ? "current" : index < step ? "complete" : ""} onClick={() => index <= step && setStep(index)}><b>{index + 1}</b>{label}</button>)}</div><form onSubmit={continueStep}><input type="hidden" name="title" value={title}/><input type="hidden" name="course" value={course}/><input type="hidden" name="className" value={className}/><input type="hidden" name="audience" value={audience}/><input type="hidden" name="dueAt" value={dueAt}/><input type="hidden" name="durationMinutes" value={durationMinutes}/><input type="hidden" name="attemptsAllowed" value={attemptsAllowed}/><input type="hidden" name="shuffleQuestions" value={String(shuffle)}/><input type="hidden" name="showScore" value={showScore}/><input type="hidden" name="questionsJson" value={JSON.stringify(questions)}/><input type="hidden" name="matrixQuotasJson" value={JSON.stringify(randomQuestionCount > 0 ? matrixQuotas : [])}/>
    {step === 0 && <div className="builder-step-content"><p className="modal-intro">Bắt đầu từ đề tự soạn hoặc rà lại câu hỏi vừa nhập. MeoTDC lưu bản nháp trong trình duyệt này.</p>{sourceName && <div className="import-source-note"><Icon name="file" size={16}/>Đã nhập từ {sourceName} · hãy rà soát câu hỏi và đáp án trước khi giao.</div>}<label className="form-field"><span>Tên bài kiểm tra <i>*</i></span><input required maxLength={140} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Kiểm tra giữa kỳ — Cơ sở dữ liệu" autoFocus/></label><div className="form-row"><label className="form-field"><span>Học phần</span><select value={course} onChange={(event) => setCourse(event.target.value)}><option>Cơ sở dữ liệu</option><option>Mạng máy tính</option><option>Lập trình Web</option><option>Mạng máy tính</option><option>Đồ họa ứng dụng</option><option>Toán rời rạc</option></select></label><label className="form-field"><span>Lớp nhận đề</span><select required value={className} onChange={(event) => { setClassName(event.target.value); setSelectedStudentCodes([]); }}>{!demoMode && <option value="">Chọn lớp nhận đề</option>}{readDemoData<DemoClass[]>("classes",seedClasses).map((item)=><option key={item.id} value={item.code}>{item.code} · {item.major}</option>)}{demoMode && <option>Toàn trường (mô phỏng)</option>}</select></label></div><div className="modal-note"><Icon name="spark" size={17}/><span>Đề xuất xây lớp/học phần trước, sau đó giao đề theo đúng danh sách lớp TDC.</span></div></div>}
    {step === 1 && <div className="builder-step-content question-builder-content"><div className="question-builder-summary"><div><strong>{questions.length} câu hỏi</strong><span>{totalPoints} điểm · có thể sửa đáp án ngay tại đây</span></div><div className="question-builder-actions"><button type="button" className="button button-secondary" onClick={() => setShowBank((value) => !value)}><Icon name="layers" size={15}/> Ngân hàng câu hỏi</button><button type="button" className="button button-secondary" onClick={() => setQuestions((current) => [...current, { id: `q-${crypto.randomUUID()}`, prompt: "", type: "single", options: ["", "", "", ""], answer: "", points: 1 }])}><Icon name="plus" size={15}/> Thêm câu</button></div></div><div className="question-matrix-summary"><strong>Ma trận theo mức độ</strong><div>{[...questionDifficultyLabels, "Chưa phân loại"].map((level) => { const count = questions.filter((question) => (question.difficulty || "Chưa phân loại") === level).length; return count ? <span key={level}>{level}<b>{count}</b></span> : null; })}</div><small>Rút câu ngẫu nhiên sẽ giữ tỷ lệ giữa các mức độ.</small></div>{showBank && <div className="bank-picker"><div className="bank-picker-heading"><strong>Chọn câu từ ngân hàng</strong><span>{bankQuestions.length} câu</span></div>{bankQuestions.map((question) => <button type="button" key={question.id} onClick={() => { setQuestions((current) => [...current, { ...question, id: `q-${crypto.randomUUID()}` }]); setShowBank(false); }}><span>{question.prompt}</span><small>{question.points} điểm · {question.type === "essay" ? "Tự luận" : "Câu khách quan"}</small><Icon name="plus" size={15}/></button>)}{bankQuestions.length === 0 && <p>Ngân hàng đang trống. Hãy thêm câu hỏi ở mục Ngân hàng câu hỏi.</p>}</div>}{questions.map((question, index) => <section className="builder-question" key={question.id}><div className="builder-question-top"><strong>Câu {index + 1}</strong><label className="question-type-select"><span className="sr-only">Dạng câu {index + 1}</span><select value={question.type} onChange={(event) => setQuestionType(index, event.target.value as ExamQuestion["type"])}><option value="single">Trắc nghiệm 1 đáp án</option><option value="multiple">Trắc nghiệm nhiều đáp án</option><option value="true_false">Đúng / Sai</option><option value="short">Trả lời ngắn</option><option value="essay">Tự luận</option></select></label><label className="question-points"><span className="sr-only">Điểm câu {index + 1}</span><input type="number" min="0" step="0.25" value={question.points} onChange={(event) => updateQuestion(index,{points:Number(event.target.value)})}/><small>điểm</small></label><button type="button" className="small-icon-button" aria-label={`Xóa câu ${index + 1}`} disabled={questions.length === 1} onClick={() => setQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index))}><Icon name="close" size={16}/></button></div><textarea className="question-prompt-input" rows={2} required value={question.prompt} onChange={(event) => updateQuestion(index,{prompt:event.target.value})} placeholder="Nhập nội dung câu hỏi…"/><div className="question-classification-grid"><label className="form-field"><span>Chủ đề</span><input maxLength={100} value={question.topic || ""} onChange={(event) => updateQuestion(index,{topic:event.target.value})} placeholder="Ví dụ: Khóa chính"/></label><label className="form-field"><span>Chuẩn đầu ra</span><input maxLength={120} value={question.outcome || ""} onChange={(event) => updateQuestion(index,{outcome:event.target.value})} placeholder="Ví dụ: Nhận diện khóa trong CSDL"/></label><label className="form-field"><span>Mức độ</span><select value={question.difficulty || ""} onChange={(event) => updateQuestion(index,{difficulty:(event.target.value || undefined) as QuestionDifficulty | undefined})}><option value="">Chưa phân loại</option>{questionDifficultyLabels.map((level) => <option key={level}>{level}</option>)}</select></label></div>{(question.type === "single" || question.type === "multiple") && <div className="builder-options">{question.options.map((option, optionIndex) => { const checked = Array.isArray(question.answer) ? question.answer.includes(String(optionIndex)) : question.answer === String(optionIndex); return <label key={optionIndex}><input type={question.type === "multiple" ? "checkbox" : "radio"} name={`correct-${question.id}`} aria-label={`Đáp án đúng ${String.fromCharCode(65 + optionIndex)} cho câu ${index + 1}`} checked={checked} onChange={(event) => { if (question.type === "multiple") { const current = Array.isArray(question.answer) ? question.answer : []; updateQuestion(index,{answer:event.target.checked?[...current,String(optionIndex)]:current.filter((item)=>item!==String(optionIndex))}); } else updateQuestion(index,{answer:String(optionIndex)}); }}/><span>{String.fromCharCode(65 + optionIndex)}</span><input required={optionIndex < 2} value={option} onChange={(event) => updateQuestion(index,{options:question.options.map((item,itemIndex)=>itemIndex===optionIndex?event.target.value:item)})} placeholder={`Phương án ${String.fromCharCode(65+optionIndex)}`}/></label>; })}</div>}{question.type === "true_false" && <div className="builder-options true-false-options">{question.options.map((option, optionIndex) => <label key={option}><input type="radio" name={`correct-${question.id}`} checked={question.answer === String(optionIndex)} onChange={() => updateQuestion(index,{answer:String(optionIndex)})}/><span>{option}</span></label>)}</div>}{question.type === "short" && <label className="form-field"><span>Đáp án chấp nhận</span><input value={typeof question.answer === "string" ? question.answer : ""} onChange={(event) => updateQuestion(index,{answer:event.target.value})} placeholder="Nhập đáp án ngắn đúng…"/></label>}{question.type === "essay" && <div className="modal-note">Câu tự luận sẽ chờ giảng viên chấm sau khi sinh viên nộp bài.</div>}</section>)}{missingKeys > 0 && <div className="login-alert">{missingKeys} câu khách quan chưa có đáp án. Hãy nhập đáp án trước khi xuất bản.</div>}</div>}
    {step === 2 && <div className="builder-step-content"><p className="modal-intro">Cấu hình kỳ kiểm tra và quyết định khi nào sinh viên được xem kết quả.</p><div className="exam-config-grid"><label className="form-field"><span>Giờ mở đề</span><input type="datetime-local" name="opensAt" required value={opensAt} onChange={(event) => setOpensAt(event.target.value)}/></label><label className="form-field"><span>Thời lượng (phút)</span><input type="number" min="1" max="300" value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}/></label><label className="form-field"><span>Giờ đóng đề</span><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)}/></label><label className="form-field"><span>Số lượt làm tối đa</span><select value={attemptsAllowed} onChange={(event) => setAttemptsAllowed(Number(event.target.value))}><option value={1}>1 lượt</option><option value={2}>2 lượt</option><option value={3}>3 lượt</option></select></label><label className="form-field"><span>Thời điểm mở điểm</span><select value={showScore} onChange={(event) => setShowScore(event.target.value)}><option value="after-submit">Sau khi nộp bài</option><option value="after-window">Sau khi kỳ thi kết thúc</option><option value="teacher-release">Giảng viên công bố</option></select></label><label className="form-field audience-field"><span>Ai được phép dự thi</span><select value={audience} onChange={(event) => { const nextAudience = event.target.value as "class" | "student" | "public"; setAudience(nextAudience); setSelectedStudentCodes([]); setClassName(nextAudience === "public" ? "Toàn trường (mô phỏng)" : className === "Toàn trường (mô phỏng)" ? "CĐ23_TH1" : className); }}><option value="class">Toàn bộ sinh viên trong lớp</option><option value="student">Chọn từng sinh viên trong roster</option>{demoMode && <option value="public">Mọi tài khoản Google · khai họ tên, MSSV, ngành</option>}</select><small>{audience === "public" ? "Phù hợp bài luyện tập mở. Email Google được xác minh; thông tin sinh viên tự khai." : "Giới hạn theo lớp của tài khoản sinh viên đã được liên kết roster."}</small></label>{audience === "student" && <div className="audience-student-picker"><div><strong>Chọn thí sinh trong lớp</strong><small>Chỉ MSSV đã chọn mới thấy đề này.</small></div>{targetStudents.length ? <div className="audience-student-list">{targetStudents.map((student) => <label key={student.studentCode} className="audience-student-option"><input type="checkbox" name="targetStudentCodes" value={student.studentCode} checked={selectedStudentCodes.includes(student.studentCode)} onChange={(event) => setSelectedStudentCodes((current) => event.target.checked ? [...current, student.studentCode] : current.filter((code) => code !== student.studentCode))}/><span><strong>{student.fullName}</strong><small>{student.studentCode}</small></span></label>)}</div> : <p>Lớp chưa có roster. Hãy thêm sinh viên trước khi giao đề.</p>}</div>}</div><div className="exam-access-grid"><label className="form-field"><span>Số câu rút ngẫu nhiên (0 = tất cả)</span><input name="randomQuestionCount" type="number" min="0" max={questions.length} value={randomQuestionCount} onChange={(event) => { setRandomQuestionCount(Number(event.target.value)); setMatrixOverrides({}); }}/><small>Chọn số lượng rồi phân bổ theo chủ đề, chuẩn đầu ra và mức độ.</small></label><label className="form-field"><span>Mật khẩu đề (tùy chọn)</span><input name="accessPassword" type="password" autoComplete="new-password" maxLength={48} value={accessPassword} onChange={(event) => setAccessPassword(event.target.value)} placeholder="Để trống nếu không cần mật khẩu"/></label><label className="form-field audience-field"><span>Trường thông tin thí sinh bắt buộc thêm</span><input name="candidateFields" maxLength={180} value={candidateFieldsText} onChange={(event) => setCandidateFieldsText(event.target.value)} placeholder="Số báo danh, số điện thoại"/><small>Nhập tên trường, phân tách bằng dấu phẩy hoặc chấm phẩy; tối đa 8 trường.</small></label></div>{randomQuestionCount>0&&<section className="matrix-quota-panel"><div className="matrix-quota-heading"><strong>Ma trận phân bổ câu</strong><span>{matrixQuotaSum}/{randomQuestionCount} câu đã phân bổ</span></div><p>Mỗi dòng là một tổ hợp chủ đề, chuẩn đầu ra và mức độ. Tổng quota phải khớp số câu rút.</p><div className="matrix-quota-list">{questionMatrixRows.map((row)=><label className="matrix-quota-row" key={row.key}><span><strong>{row.topic}</strong><small>{row.outcome} · {row.difficulty} · có {row.availableCount} câu</small></span><input type="number" min="0" max={row.availableCount} value={row.count} aria-label={`Quota ${row.topic}, ${row.outcome}, ${row.difficulty}`} onChange={(event)=>setMatrixOverrides((current)=>({...current,[row.key]:Number(event.target.value)}))}/></label>)}</div>{!matrixQuotaValid&&<div className="login-alert" role="alert">Quota phải là số nguyên, không vượt số câu có sẵn và tổng bằng {randomQuestionCount}.</div>}</section>}<div className="exam-demo-note">Lịch mở, số lượt, mật khẩu, bộ câu hỏi, đồng hồ và chấm điểm của đề mới được API xác minh. Nhật ký tab/toàn màn hình vẫn phụ thuộc tín hiệu trình duyệt nên cần giảng viên rà soát.</div><label className="setting-toggle exam-integrity-toggle"><input type="checkbox" name="strictIntegrity" defaultChecked/><span><strong>Giám sát thi nghiêm ngặt</strong><small>Yêu cầu toàn màn hình, chặn thao tác sao chép và tự nộp sau 3 đợt vi phạm.</small></span></label><label className="setting-toggle"><input type="checkbox" checked={shuffle} onChange={(event) => setShuffle(event.target.checked)}/><span><strong>Trộn thứ tự câu hỏi</strong><small>Tạo thứ tự câu khác nhau cho mỗi lượt làm (demo).</small></span></label><label className="setting-toggle"><input type="checkbox" defaultChecked/><span><strong>Lưu câu trả lời tự động</strong><small>Giữ tiến độ làm bài trong trình duyệt này.</small></span></label><div className="release-summary"><span>ĐỀ SẼ GIAO CHO</span><strong>{audience === "public" ? "Tài khoản Google đã xác minh" : audience === "student" ? `${selectedStudentCodes.length} sinh viên · ${className}` : className}</strong><span>{randomQuestionCount > 0 ? "Rút " + randomQuestionCount + "/" + questions.length + " câu/lượt" : questions.length + " câu"} · {durationMinutes} phút · tối đa {attemptsAllowed} lượt</span><small>Điểm sẽ mở: {showScore === "after-submit" ? "sau khi nộp" : showScore === "after-window" ? "sau khi kỳ thi kết thúc" : "khi giảng viên công bố"}</small></div></div>}
    <div className="modal-actions builder-actions">{stepError && <div className="login-alert builder-error" role="alert">{stepError}</div>}{step > 0 ? <button type="button" className="button button-secondary" onClick={() => setStep((value) => value - 1)}>Quay lại</button> : <button type="button" className="button button-secondary" onClick={onClose}>Hủy</button>}{step < 2 ? <button type="button" className="button button-primary" onClick={goNext}>Tiếp theo <Icon name="arrow" size={15}/></button> : <><button className="button button-secondary" name="publish" value="false" disabled={saving}>{saving ? "Đang lưu…" : "Lưu bản nháp"}</button><button className="button button-primary" name="publish" value="true" disabled={saving || missingKeys > 0 || !matrixQuotaValid || (audience === "student" && selectedStudentCodes.length === 0)}>{saving ? "Đang xuất bản…" : audience === "student" ? "Xuất bản cho sinh viên đã chọn" : audience === "public" ? "Xuất bản đề mở" : "Xuất bản cho lớp"}<Icon name="arrow" size={15}/></button></>}</div></form></section></div>;
}

function AssignmentModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const defaultDue = new Date(Date.now() + 7 * 86400000);
  defaultDue.setMinutes(defaultDue.getMinutes() - defaultDue.getTimezoneOffset());
  const classes = readDemoData<DemoClass[]>("classes", seedClasses);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="assignment-modal-title">
    <div className="modal-heading"><div><div className="eyebrow">GIAO NHIỆM VỤ</div><h2 id="assignment-modal-title">Tạo bài tập</h2></div><button className="small-icon-button" onClick={onClose} aria-label="Đóng"><Icon name="close"/></button></div>
    <p className="modal-intro">Bài tập phù hợp cho báo cáo, bài viết, tệp thực hành hoặc sản phẩm nhóm cần giảng viên nhận xét.</p>
    <form onSubmit={onSubmit}>
      <label className="form-field"><span>Tên bài tập <i>*</i></span><input name="title" required maxLength={180} placeholder="Ví dụ: Báo cáo thực hành tuần 8" autoFocus/></label>
      <div className="form-row">
        <label className="form-field"><span>Học phần <i>*</i></span><input name="course" required maxLength={100} defaultValue={demoMode ? "Cơ sở dữ liệu" : ""} list="assignment-course-options" placeholder="Nhập tên học phần"/><datalist id="assignment-course-options"><option value="Cơ sở dữ liệu"/><option value="Lập trình Web"/><option value="Mạng máy tính"/><option value="Đồ họa ứng dụng"/></datalist></label>
        <label className="form-field"><span>Lớp nhận bài <i>*</i></span><input name="className" required maxLength={80} defaultValue={demoMode ? "CĐ23_TH1" : ""} list="assignment-class-options" placeholder="Nhập mã lớp trong roster"/><datalist id="assignment-class-options">{classes.map((item) => <option key={item.id} value={item.code}>{item.major}</option>)}</datalist></label>
      </div>
      <label className="form-field"><span>Yêu cầu bài tập</span><textarea name="description" rows={4} maxLength={10000} placeholder="Mô tả yêu cầu, định dạng và tiêu chí đánh giá…"/></label>
      <div className="form-row"><label className="form-field"><span>Hạn nộp</span><input name="dueAt" type="datetime-local" required defaultValue={defaultDue.toISOString().slice(0,16)}/></label><label className="form-field"><span>Thang điểm</span><input name="points" type="number" min="1" max="1000" step="0.25" defaultValue="10"/></label></div>
      <div className="modal-note"><Icon name="spark" size={17}/><span>Bản production lưu bài tập và bài nộp trên máy chủ; tệp được quét theo cấu hình. Bản local giữ dữ liệu demo trên trình duyệt.</span></div>
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Hủy</button><button className="button button-secondary" name="publish" value="false">Lưu nháp</button><button className="button button-primary" name="publish" value="true">Giao cho lớp <Icon name="arrow" size={15}/></button></div>
    </form>
  </section></div>;
}

function ImportModal({ onClose, onCreateExam }: { onClose: () => void; onCreateExam: (questions: ExamQuestion[], fileName: string) => void }) {
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);

  async function readFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setError("");
    setReading(true);
    try {
      const extension = file.name.toLowerCase().split(".").pop();
      const content = extension === "docx" ? await readDocxText(file) : extension === "pdf" ? await readPdfText(file) : extension === "txt" ? await file.text() : "";
      if (!content.trim()) throw new Error("Chưa trích được văn bản từ tệp này. Hãy dán nội dung đề vào ô bên dưới để tiếp tục rà soát.");
      setText(content);
      const parsed = questionsFromImportText(content);
      if (!parsed.length) setError("Đã đọc được văn bản nhưng chưa nhận diện câu. Dùng mẫu “Câu 1. … / A. … / B. … / Đáp án: A” hoặc tự nhập câu ở bước tiếp theo.");
      setQuestions(parsed);
    } catch (readError) {
      setQuestions([]);
      setError(readError instanceof Error ? readError.message : "Không đọc được tệp.");
    } finally {
      setReading(false);
    }
  }

  function analyzeText() {
    const parsed = questionsFromImportText(text);
    setQuestions(parsed);
    setError(parsed.length ? "" : "Chưa nhận diện được câu hỏi. Mỗi câu bắt đầu bằng “Câu 1.”; đáp án có thể ghi “Đáp án: A”.");
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card import-modal" role="dialog" aria-modal="true" aria-labelledby="import-modal-title"><div className="modal-heading"><div><div className="eyebrow">SỐ HÓA ĐỀ VÀO BẢN NHÁP</div><h2 id="import-modal-title">Nhập đề từ Word/PDF</h2></div><button className="small-icon-button" onClick={onClose} aria-label="Đóng"><Icon name="close"/></button></div><p className="modal-intro">Tệp được đọc ngay trên trình duyệt trong phiên demo. Hệ thống tìm câu hỏi theo số thứ tự, phương án A–D và đáp án để tạo bản nháp cần rà soát.</p><label className="import-dropzone"><span><Icon name="file" size={24}/></span><strong>{fileName || "Chọn tệp đề thi"}</strong><small>{reading ? "Đang trích xuất văn bản…" : "Word .docx · PDF có lớp văn bản · TXT"}</small><input type="file" accept=".docx,.pdf,.txt" onChange={(event) => { const input = event.currentTarget; void readFile(input.files?.[0]).finally(() => { input.value = ""; }); }}/></label><label className="form-field import-text-field"><span>Nội dung đã trích xuất / dán thủ công</span><textarea rows={7} value={text} onChange={(event) => { setText(event.target.value); setQuestions([]); setError(""); }} placeholder={"Câu 1. Khóa chính dùng để làm gì?\nA. Định danh bản ghi\nB. Lưu tệp\nC. Mã hóa bảng\nĐáp án: A"}/></label><div className="import-actions"><span>{questions.length ? `${questions.length} câu được nhận diện` : "Chưa có câu hỏi được nhận diện"}</span><button className="button button-secondary" onClick={analyzeText} disabled={reading || !text.trim()}>Phân tích nội dung</button></div>{error && <div role="alert" className="login-alert">{error}</div>}{questions.length > 0 && <div className="import-preview"><strong>Xem trước — phải rà soát trước khi xuất bản</strong>{questions.slice(0,4).map((question,index)=><div className="import-preview-row" key={question.id}><span>{index+1}</span><div><b>{question.prompt}</b><small>{question.options.length ? `${question.options.length} phương án` : "Trả lời ngắn"} · {question.answer ? "đã tìm thấy đáp án" : "chưa tìm thấy đáp án"}</small></div></div>)}{questions.length > 4 && <small>Còn {questions.length - 4} câu khác.</small>}</div>}<div className="modal-note"><Icon name="spark" size={17}/><span>Giới hạn demo: Word .docx và PDF văn bản đơn giản; PDF scan/ảnh cần OCR, công thức hoặc bố cục phức tạp cần rà lại bằng mắt.</span></div><div className="modal-actions"><button className="button button-secondary" onClick={onClose}>Hủy</button><button className="button button-primary" onClick={() => onCreateExam(questions,fileName || "nội dung dán thủ công")} disabled={reading || questions.length === 0}>Chỉnh sửa bản nháp <Icon name="arrow" size={15}/></button></div></section></div>;
}



