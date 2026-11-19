# MeoTDC: trạng thái triển khai

## Đã có trong mã nguồn

- Giao diện theo vai trò sinh viên, giảng viên, nhà trường và quản trị; quản lý demo lớp, khóa học, bài tập, ngân hàng câu hỏi, thi, chấm và báo cáo.
- API NestJS cho đề/lượt thi server-backed: phân quyền theo owner/lớp/MSSV, giờ mở/đóng, mật khẩu, số lượt, rút câu, autosave, chấm khách quan/tự luận, công bố điểm và nhật ký giám sát.
- IndexedDB outbox cho câu trả lời, đồng bộ lại khi online/định kỳ; localStorage vẫn hỗ trợ giao diện và khôi phục cùng thiết bị.
- PostgreSQL tùy chọn qua `DATABASE_URL`, migration versioned lúc API khởi động; lưu snapshot lượt thi có transaction, session/hash cookie, roster/password hash, login rate limit, Google nonce và metadata tệp.
- S3-compatible storage tùy chọn; Compose dùng MinIO, PostgreSQL, API, Next.js, Redis và ClamAV. Production bắt buộc quét tệp; Caddy profile cung cấp HTTPS khi trỏ domain đúng.
- Google role allowlist cho email quản trị/giảng viên/nhà trường; sinh viên production phải liên kết roster.
- Tài liệu API, cấu trúc dữ liệu, kiến trúc, phân tích Azota và hồ sơ bàn giao TDC.

## Trạng thái xác minh

- TypeScript build cho API chạy thành công sau các thay đổi.
- Chưa chạy unit/E2E, thử giao diện, security review hoặc tải.
- Docker CLI không có trong môi trường hiện tại, nên chưa chạy `docker compose up`, migration trên PostgreSQL thật hoặc luồng MinIO.
- Chưa đo tải đồng thời 5.000 người và chưa được TDC nghiệm thu.

## Giới hạn còn lại trước pilot có dữ liệu thật

1. Kho đề/lượt thi trong PostgreSQL hiện là một JSONB snapshot được khóa toàn cục. Thay bằng repository quan hệ theo attempt/answer, khóa theo lượt để các heartbeat/autosave không bị tuần tự hóa.
2. Thay allowlist Google và roster nhập tay bằng IdP/SSO, lớp học phần và roster/ghi danh chính thức của TDC.
3. Hoàn thiện authorization theo lớp cho xem tệp/attempt, audit các thao tác nhạy cảm, import/export và dashboard.
4. Xác minh luồng ClamAV trên Docker, dữ liệu signature, false positives/timeout; đặt retention cho tệp nộp.
5. Tạo backup mã hóa/offsite tự động, diễn tập restore, retention/deletion, metrics, cảnh báo, pipeline migration/rollback và runbook.
6. Kiểm thử bảo mật, tải, accessibility, mất mạng, submit lặp, thiết bị/trình duyệt và nghiệm thu quy chế thi cùng TDC.

## Đầu vào tổ chức cần cấp

- Domain/máy chủ, IdP/SSO và OAuth Web Client ID.
- Danh sách email/role tạm thời cho pilot, roster MSSV, lớp học phần và quy tắc cập nhật/thu hồi tài khoản.
- Quy chế giám sát, retention, xử lý sự cố mất mạng, khiếu nại và hỗ trợ tiếp cận.
- Mục tiêu đồng thời, giờ cao điểm và tiêu chí nghiệm thu.
