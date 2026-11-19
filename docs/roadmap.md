# Lộ trình đề xuất

Ước lượng định hướng cho nhóm 2–4 người; cần cập nhật sau khi thống nhất nhân sự, SSO, quy chế thi và dữ liệu mẫu với TDC.

| Giai đoạn | Kết quả | Điều kiện hoàn tất |
|---|---|---|
| 0 — Khung (đang hoàn tất) | Tài liệu, giao diện, NestJS API, PostgreSQL snapshot, persistent auth/roster, MinIO, offline answer outbox và Compose | Luồng demo bền qua restart; ghi rõ giới hạn concurrency và tích hợp trường |
| 1 — Nền tảng | Auth/SSO, trường/học kỳ, lớp/môn/ghi danh, import danh sách | Quyền theo trường/lớp được kiểm chứng; seed/import dữ liệu mẫu |
| 2 — Soạn đề | Ngân hàng câu hỏi, editor, versioning, xem trước, công thức/ảnh | Giáo viên tạo và phát hành đề có audit trail |
| 3 — Tổ chức thi production | Chuyển snapshot sang bảng attempt/answer với transaction theo lượt; autosave/offline retry, nộp idempotent, auto-grade | Phục hồi sau refresh/mạng đứt, tải đa instance; đối soát điểm đúng và quota lượt |
| 4 — Import/tự luận | DOCX/PDF async parser, review UI, upload bài tự luận, rubric | Parser đánh dấu lỗi; không tự publish; có giới hạn upload |
| 5 — Báo cáo/vận hành | Bảng điểm, xuất file, dashboard, quan sát hệ thống, backup | Kiểm tra quyền export, khôi phục backup, tài liệu vận hành |
| 6 — Pilot và mở rộng | Pilot một số lớp, benchmark, xử lý phản hồi, tăng replica/cache theo số liệu | Ngưỡng concurrency/SLO được TDC xác nhận và đo đạt |

## Việc cần xác nhận trước pilot

- Cơ chế tài khoản/SSO và nguồn dữ liệu lớp, học phần, sinh viên.
- Quy chế thi, ngoại lệ gia hạn, xem điểm/đáp án và lưu trữ bài thi.
- Mẫu DOCX/PDF thực tế, quy tắc đáp án, hình ảnh/công thức.
- Số đỉnh đồng thời theo lịch, hạ tầng, ngân sách backup và hỗ trợ sự cố.
