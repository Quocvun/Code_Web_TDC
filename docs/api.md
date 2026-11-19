# API MeoTDC

Đường dẫn gốc `/api/v1`. Khi có `DATABASE_URL`, migrations chạy lúc khởi động; trạng thái đề/lượt thi, bài tập/bài nộp, roster, phiên, rate limit và metadata tệp được lưu trong PostgreSQL. Khi không cấu hình DB, API giữ chế độ demo trong bộ nhớ. Lớp/học phần và khóa học vẫn chưa đồng bộ với danh mục chính thức TDC.

## Endpoint hiện có

| Method | Đường dẫn | Vai trò và chức năng |
|---|---|---|
| GET | `/health` | Trạng thái API, PostgreSQL/local JSON và kho tệp |
| GET | `/catalog/majors` | Danh mục demo 37 ngành |
| GET | `/auth/demo-accounts` | Tên tài khoản demo, không trả mật khẩu |
| POST | `/auth/login` | Đăng nhập demo, trả cookie phiên HttpOnly |
| POST | `/auth/google-login` | Xác minh ID token, nonce, audience, issuer, thời hạn và email đã xác minh |
| GET | `/auth/me` | Phiên hiện tại hoặc `user: null` |
| POST | `/auth/logout` | Thu hồi phiên phía máy chủ và xóa cookie |
| GET/POST | `/auth/roster-accounts` | Nhà trường/quản trị xem và cấp tài khoản roster; PostgreSQL khi bật DB |
| GET | `/overview` | Tổng quan theo dữ liệu người dùng được phép xem |
| GET | `/assignments` | Sinh viên xem bài của lớp và bài nộp của mình; giảng viên xem bài của mình cùng bài nộp |
| POST | `/assignments` | Giảng viên/nhà trường/quản trị tạo bài tập nháp hoặc giao cho lớp |
| POST | `/assignments/:assignmentId/submissions` | Sinh viên nộp nội dung/tệp trước hạn; mỗi bài có một bài nộp hiện hành |
| POST | `/assignments/:assignmentId/submissions/:submissionId/grade` | Chủ bài/nhà trường/quản trị chấm điểm, nhận xét hoặc yêu cầu sửa |
| GET | `/exams` | Giảng viên xem đề của mình kèm đáp án; sinh viên chỉ thấy đề đã xuất bản và được giao, không có đáp án hay danh sách MSSV mục tiêu |
| POST | `/exams` | Giảng viên/nhà trường/quản trị tạo đề nháp hoặc đề đã xuất bản trên máy chủ |
| POST | `/exams/:examId/publish` | Chủ sở hữu đề/nhà trường/quản trị xuất bản đề sau khi máy chủ kiểm tra |
| POST | `/exams/:examId/unpublish` | Chủ sở hữu đề/nhà trường/quản trị thu hồi đề |
| GET | `/exam-attempts/live` | Giảng viên/nhà trường/quản trị xem phiên gần đây và tín hiệu giám sát, không có câu trả lời của sinh viên |
| GET | `/exam-attempts` | Sinh viên xem lượt đã nộp của mình; giảng viên xem lượt của đề mình sở hữu |
| POST | `/exam-attempts/start` | Sinh viên đủ điều kiện bắt đầu/tiếp tục; máy chủ chọn câu, cấp token và hạn nộp |
| GET | `/exam-attempts/:attemptId` | Sinh viên sở hữu hoặc giảng viên được quyền xem lượt; sinh viên gửi token qua `x-meotdc-attempt-token` |
| POST | `/exam-attempts/:attemptId/answers` | Lưu câu trả lời theo thứ tự phiên bản tăng dần |
| POST | `/exam-attempts/:attemptId/heartbeat` | Cập nhật lần hoạt động, trạng thái tab/toàn màn hình; máy chủ kiểm tra hạn |
| POST | `/exam-attempts/:attemptId/integrity-events` | Nhận tín hiệu trình duyệt được phép và đóng dấu thời gian phía máy chủ |
| POST | `/exam-attempts/:attemptId/submit` | Nộp bài; máy chủ chấm câu khách quan và áp dụng hạn làm bài |
| POST | `/exam-attempts/:attemptId/grade` | Giảng viên sở hữu đề/nhà trường/quản trị chấm tự luận, ghi nhận xét và có thể công bố điểm |
| POST | `/assignments/submission-files` | Sinh viên tải tệp bài tập (tối đa 10 MB, kiểm chữ ký nội dung; S3-compatible nếu cấu hình) |
| GET | `/assignments/submission-files/:fileId` | Chủ tệp hoặc giảng viên tải tệp (phân quyền phạm vi lớp hiện ở mức demo) |

Migration `003_learning_assignments.sql` tạo bảng quan hệ bài tập và bài nộp. Quyền giảng viên hiện giới hạn theo chủ sở hữu bài tập; phân quyền theo lớp chính thức cần roster/ghi danh TDC.

Next.js proxy chuyển `/api/*` tới `NEXT_PUBLIC_API_BASE_URL` (mặc định `http://localhost:4000`).

## Cách API bảo vệ lượt thi

- Khi bắt đầu, máy chủ kiểm tra vai trò, lớp/MSSV hoặc đối tượng đề mở, lịch xuất bản, mật khẩu, số lượt và lượt đang hoạt động. Mật khẩu đề được băm bằng scrypt; nhập sai quá năm lần sẽ bị khóa tạm cho từng sinh viên/đề.
- Đáp án chuẩn nằm trong kho API; bản trả về cho sinh viên để trống trường đáp án. Đáp án, MSSV mục tiêu và mật khẩu đề cũng được loại khỏi dữ liệu đề lưu ở trình duyệt. API của giảng viên vẫn trả đáp án cho đúng chủ sở hữu đề.
- Câu trả lời tự lưu vào API; IndexedDB giữ hàng đợi khi mất mạng và tự gửi lại khi kết nối trở lại. Máy chủ quản lý đồng hồ/hạn nộp, câu hỏi đã rút, điểm khách quan và chính sách công bố điểm. Nếu nộp quá giờ, API chốt bài mà không nhận câu trả lời mới. Tự luận chờ giảng viên chấm.
- Token lượt thi ngẫu nhiên được trả cho thí sinh một lần; máy chủ chỉ lưu SHA-256 của token. Trình duyệt lưu token để hỗ trợ tiếp tục lượt thi local, vì vậy vẫn có rủi ro nếu trình duyệt bị cài mã độc/XSS.
- Bảng giám sát hiển thị heartbeat gần nhất, sự kiện trình duyệt gửi lên và số đợt cảnh báo. Chế độ nghiêm ngặt tự nộp sau ba đợt tính được; đây là tín hiệu để giảng viên xem xét, không phải kết luận gian lận.

## Giới hạn trước khi triển khai thật

PostgreSQL hiện giữ một snapshot JSONB của đề/lượt thi và khóa toàn bộ các thao tác runtime bằng advisory lock để tránh ghi đè khi có nhiều API instance. Đây là bước bền vững và nhất quán cho demo/pilot nhỏ; nó tuần tự hóa heartbeat, lưu đáp án và dashboard, nên chưa phù hợp tải thi đồng thời lớn. Các bảng quan hệ trong `001_init.sql` là mô hình dữ liệu chuẩn bị, chưa phải kho dùng trực tiếp cho luồng runtime. Cần chuyển kho lượt thi sang repository quan hệ theo attempt/answer và đo tải trước kỳ thi đông người.

Tín hiệu rời tab/toàn màn hình/sao chép do trình duyệt báo lên nên có thể bị giả, bị chặn hoặc không ghi nhận; API không phát hiện thiết bị thứ hai, không xác minh người ngồi trước máy, không ngăn hỗ trợ ở cấp hệ điều hành. Không dùng riêng tín hiệu này để kỷ luật sinh viên. Dữ liệu cần chính sách lưu/xóa, sao lưu mã hóa và diễn tập phục hồi do TDC phê duyệt. Phân quyền xem tệp hiện còn ở vai trò, chưa đối chiếu chính thức với lớp học phần.

## Quy ước an toàn khác

- Google login xác minh ID token và nonce. Trong production, admin/giảng viên/nhà trường phải nằm trong allowlist email; sinh viên phải khớp email trong roster. Giảng viên còn phải được gán mã lớp trong `MEOTDC_TEACHER_CLASS_ASSIGNMENTS`; nếu không có mapping, API từ chối đọc/chỉnh sửa dữ liệu lớp. Google không thay thế IdP/SSO hoặc roster chính thức của TDC.
- Khi bật PostgreSQL, phiên lưu hash cookie, roster lưu hash scrypt, rate limit và nonce dùng chung giữa API instances. Chế độ JSON local vẫn là demo một tiến trình.
- Tệp dùng S3-compatible private bucket khi cấu hình `S3_BUCKET`; demo không có S3 dùng volume local. API kiểm tra loại/kích thước/chữ ký và quét ClamAV nếu `CLAMAV_HOST` được cấu hình. Production bắt buộc `FILE_SCAN_REQUIRED=true`; Compose nối ClamAV. Chưa chạy xác minh luồng scanner trong Docker ở môi trường hiện tại.
- `001_init.sql` tạo mô hình tổ chức/học vụ; `002_runtime_persistence.sql` tạo kho snapshot runtime, roster, phiên, rate limit, nonce và metadata tệp; `003_learning_assignments.sql` tạo bảng bài tập và bài nộp.
