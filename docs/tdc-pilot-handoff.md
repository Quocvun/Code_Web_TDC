# MeoTDC — Hồ sơ trình diễn và đề xuất pilot tại TDC

**Bản bàn giao:** 19/11/2026  
**Đối tượng:** Phòng Đào tạo, đơn vị CNTT, khoa/bộ môn và giảng viên tham gia đánh giá  
**Trạng thái:** Có demo local và stack triển khai Docker với PostgreSQL/MinIO; chưa phải hệ thống TDC chính thức hoặc hệ thống thi thật.

## 1. Mục đích

MeoTDC là nguyên mẫu cổng học tập số để TDC đánh giá quy trình giao đề, tổ chức lớp, theo dõi tiến độ và rà soát các tín hiệu bất thường trong bài thi. Buổi trình diễn nhằm thu thập yêu cầu và thống nhất phạm vi pilot; không dùng dữ liệu thật hoặc thay thế hệ thống hiện có.

## 2. Nội dung có thể trình diễn

- **Sinh viên:** xem lớp và đề được giao; tìm/lọc theo học phần, lớp, trạng thái hoàn thành và hạn; xác nhận thông tin trước khi thi; làm bài có đồng hồ, tiến độ trả lời và tự nộp khi hết giờ.
- **Giám sát bài thi:** đề nghiêm ngặt có thể yêu cầu toàn màn hình, chặn một số thao tác sao chép/cắt/dán/in/phím tắt, ghi nhận sự kiện trình duyệt và tự nộp sau ba đợt tín hiệu để giảng viên rà soát. API giữ đáp án, kiểm tra quyền/lịch/số lượt, quản lý thời hạn, autosave và chấm câu khách quan. Khi mất mạng, câu trả lời được giữ trong IndexedDB và tự gửi lại khi kết nối hồi phục.
- **Giảng viên:** nhập câu hỏi DOCX/PDF có văn bản/TXT vào bản nháp để rà soát; soạn/giao đề, bài tập và nội dung khóa học theo lớp; theo dõi lượt thi; nhận bài, chấm, phản hồi/yêu cầu sửa và xuất CSV. Khóa học/tiến độ đã có API và bảng PostgreSQL; danh mục lớp/học phần, ngân hàng câu hỏi và ghi danh chưa kết nối hệ thống chính thức.
- **Nhà trường:** xem tổng quan API, roster, lượt thi/điểm, nhập roster CSV và cấp mật khẩu khởi tạo thử nghiệm.
- **Đăng nhập:** tài khoản demo cho ba vai trò sinh viên, giảng viên và nhà trường; Google OAuth có thể cấu hình để trình diễn xác thực Google. Google OAuth không tự chứng minh một người thuộc TDC.

## 3. Cách mở demo

Yêu cầu Node.js 20.9 trở lên và pnpm. Từ thư mục mã nguồn:

```powershell
pnpm install
pnpm dev
```

Mở `http://localhost:3000`. Hoặc chạy `Run-MeoTDC.bat` trên Windows. API local mặc định dùng `http://localhost:4000/api/v1/health`; nếu máy cấu hình `API_PORT` thì dùng cổng đó.

Các alias `meotdc.localhost`, `student.meotdc.localhost`, `teacher.meotdc.localhost`, `school.meotdc.localhost` và `admin.meotdc.localhost` cùng mở ứng dụng ở cổng 3000 và trỏ về `127.0.0.1`; đây không phải tên miền công khai. Chỉ dùng script `.\scripts\install-local-hosts.ps1` nếu bộ phân giải tên Windows không nhận alias `.localhost`.

### Stack PostgreSQL/S3-compatible bằng Docker

1. Cài Docker Desktop, sao chép `.env.example` thành `.env`, đặt mật khẩu mạnh cho PostgreSQL/MinIO và cấu hình Google OAuth Web Client ID.
2. Đăng ký origin đầy đủ trong Google Cloud Console → **Authorized JavaScript origins**: `http://localhost:3000` khi chạy local; thêm riêng từng alias `.localhost` đang dùng; với production, thêm origin HTTPS chính xác của từng domain. Google từ chối origin chưa khai báo cho Client ID. Thêm email quản trị vào `MEOTDC_ADMIN_EMAIL`, email giảng viên vào `MEOTDC_TEACHER_EMAILS` và email nhà trường vào `MEOTDC_SCHOOL_EMAILS` (cách nhau bằng dấu phẩy). `GOOGLE_CLIENT_ID` và `NEXT_PUBLIC_GOOGLE_CLIENT_ID` phải dùng cùng Web Client ID.
3. Chạy `docker compose up --build -d`, mở `http://localhost:3000`; migrations được API tự chạy khi khởi động. API health ở `http://localhost:4000/api/v1/health`.
4. Có thể tạo dump PostgreSQL bằng `.\scripts\backup.ps1`.

Để bật HTTPS công khai, trỏ mọi DNS về máy chủ rồi đặt `MEOTDC_DOMAINS=portal.example.com,exam.example.com` và `MEOTDC_WEB_ORIGINS=https://portal.example.com,https://exam.example.com`; với một domain vẫn hỗ trợ `MEOTDC_DOMAIN` cũ. Đăng ký từng HTTPS origin trong Google Web Client ID rồi chạy `docker compose --profile public up --build -d`. API production tự buộc cookie `Secure` và từ chối khởi động khi OAuth, email admin, secret database/object storage, HTTPS origins hoặc scanner chưa đạt yêu cầu cấu hình. Container web/API chạy bằng user không phải root.

Compose dùng hai ảnh `vuongdeptraii2k8/meotdc-api` và `vuongdeptraii2k8/duantuonglai`. Script `scripts/publish-duantuonglai.ps1` build/push cả hai ảnh và kiểm tra tài khoản Docker Hub; `scripts/publish-docker.ps1` bổ sung kiểm tra `.env` production trước khi publish. Máy bàn giao chưa có Docker CLI/Engine nên chưa chạy build/push.

| Vai trò thử nghiệm (chỉ `pnpm dev`) | Tài khoản | Mật khẩu demo |
|---|---|---|
| Sinh viên | `sv.demo` | `MeoTDC@2026` |
| Giảng viên | `gv.demo` | `MeoTDC@2026` |
| Nhà trường | `school.demo` | `MeoTDC@2026` |

Chỉ dùng các tài khoản và dữ liệu giả lập trong buổi demo. Đăng nhập quản trị cần cấu hình Google OAuth phía máy chủ; không đưa thông tin bí mật OAuth vào gói gửi trường.

## 4. Kịch bản trình diễn 15 phút

1. **Giới thiệu (2 phút):** nêu bài toán, đối tượng dùng và phạm vi nguyên mẫu.
2. **Lớp và đề (4 phút):** vào `gv.demo`; xem lớp, nhập thử roster CSV giả lập; mở ngân hàng câu hỏi; tạo đề, bật giám sát nghiêm ngặt, đặt thời gian/lượt, trộn câu và xuất bản.
3. **Luồng sinh viên (4 phút):** vào `sv.demo`; tìm đề, đọc điều kiện dự thi, xác nhận danh tính mẫu; trả lời vài câu và xem đồng hồ/tiến độ.
4. **Rà soát (3 phút):** trở lại `gv.demo`; mở báo cáo, chuyển bộ lọc **Cần rà soát**, xem nhật ký và lý do tự nộp; xuất CSV.
5. **Trao đổi với TDC (2 phút):** chốt nhóm pilot, dữ liệu cần tích hợp, chính sách thi và tiêu chí chấp nhận.

Nếu cần minh họa cảnh báo, hãy dùng một đề thử và tài khoản giả lập riêng. Không dùng thông tin sinh viên thật; cảnh báo là tín hiệu cần con người rà soát, không phải kết luận gian lận.

## 5. Giới hạn và cách diễn giải giám sát thi

Quy tắc về đề, mật khẩu, quyền dự thi, số lượt, câu được rút, hạn nộp, autosave và điểm của đề server-backed được API kiểm tra. Khi bật PostgreSQL, roster, phiên, rate limit và lượt thi tồn tại qua restart; token chỉ lưu dạng hash ở API, còn token thí sinh nằm trong trình duyệt để tiếp tục cùng lượt. `docker compose` lưu file nộp bài ở MinIO private bucket.

Tín hiệu focus/fullscreen/copy/paste/in được phát sinh tại trình duyệt. Người dự thi có thể dùng thiết bị thứ hai, sửa trình duyệt hoặc làm sự kiện không gửi được; API không xác minh người ngồi trước máy và không khóa hệ điều hành. Việc tự nộp là hành động theo quy tắc demo, không phải kết luận gian lận. Mất mạng giữ bản trả lời trong IndexedDB và tự gửi lại; người thi vẫn cần kết nối để bắt đầu lượt, gửi bài và xác nhận máy chủ đã nhận bài.

Vì vậy, nhật ký được dùng để **hỗ trợ giảng viên xem xét**, không tự động buộc tội, trừ điểm hay kỷ luật. Trước kỳ thi thật cần công bố quy chế, thông báo phạm vi dữ liệu ghi nhận, có quy trình giải trình/khiếu nại và cho phép phương án phù hợp với sinh viên cần hỗ trợ tiếp cận.

Dữ liệu khóa học và tiến độ người học hiện dùng API; PostgreSQL lưu nội dung khóa học và trạng thái hoàn thành theo tài khoản. Roster CSV có API nhập/cấp tài khoản nhưng chưa đồng bộ SSO, hồ sơ hoặc ghi danh chính thức TDC. Lớp hiện được suy ra từ roster và nội dung đã giao; màn hình giáo viên production chỉ đọc danh sách theo quyền, chưa có quản lý học kỳ/lớp học phần/ghi danh chính thức. Ngân hàng câu hỏi vẫn dùng dữ liệu demo trong trình duyệt và chưa là nguồn dữ liệu dùng chung. Bài tập, bài nộp và điểm có bảng PostgreSQL riêng. Tệp bài nộp production chỉ cho sinh viên sở hữu, chủ bài tập, nhà trường hoặc admin tải xuống; quyền giáo viên vẫn cần xác thực với ghi danh/lớp TDC. PostgreSQL đề/lượt thi dùng một JSONB snapshot được khóa giao dịch toàn cục để tránh ghi đè giữa API instance; cách này tuần tự hóa heartbeat/autosave nên chưa phù hợp kỳ thi có nhiều nghìn lượt đồng thời. Đây chưa phải repository quan hệ hoàn chỉnh của các bảng trong `001_init.sql`. Backup dump có script thủ công, chưa tự động, chưa mã hóa hoặc lưu ngoài máy. Metadata file vào PostgreSQL; nội dung file dùng MinIO/S3. Compose nối ClamAV; production từ chối upload nếu scanner chưa cấu hình. Chưa thể kiểm chứng migration PostgreSQL, container hoặc quét tệp trên máy này vì Docker Engine chưa chạy.

## 6. Điều kiện cần TDC thống nhất trước pilot thật

- Chọn đơn vị chủ trì, học phần/lớp thử và đầu mối Phòng Đào tạo, CNTT, khoa/bộ môn.
- Cấp nguồn định danh chính thức gồm SSO, MSSV, roster và quy trình cập nhật/thu hồi tài khoản.
- Chốt quy chế thi, ngoại lệ mất mạng, loại giám sát phù hợp, thời hạn dữ liệu và quy trình khiếu nại.
- Cấp domain/TLS, secret riêng, máy chủ, PostgreSQL, kho tệp, backup mã hóa/offsite, quy trình restore và hỗ trợ trong giờ thi.
- Thống nhất tiêu chí nghiệm thu về tải đồng thời, trình duyệt/thiết bị, bảo mật, khả năng tiếp cận và độ chính xác báo cáo.

### Công việc kỹ thuật trước khi dùng cho kỳ thi thật

1. Thay snapshot JSONB bằng ghi/đọc quan hệ theo attempt/answer và khóa theo attempt; benchmark heartbeat/autosave/nộp bài trước khi chọn quy mô.
2. Tích hợp IdP/SSO và roster/ghi danh TDC; hoàn thiện phân quyền theo trường/khoa/lớp trên mọi endpoint và audit cho đề, điểm, xem/xuất dữ liệu.
3. Hoàn thiện chính sách chống gian lận, bảo vệ dữ liệu, hỗ trợ tiếp cận, rà soát con người và khiếu nại.
4. Xác minh ClamAV/virus signatures, false positives và timeout; kiểm thử bảo mật, tải, khôi phục, mất mạng, thiết bị và khả năng tiếp cận; tổ chức pilot giả lập/UAT trước khi dùng dữ liệu thật.

**Xác minh bản mã nguồn:** Sau cập nhật, `pnpm build` thành công cho API và production Next.js. Smoke test API local không dùng DB đã xác nhận: giảng viên tạo khóa học, sinh viên đúng lớp đọc được khóa, đánh dấu bài học, đọc lại tiến độ 100%, chỉ xem lớp/học phần trong phạm vi tài khoản và bị chặn khi truy cập chéo lớp. Test dùng bộ nhớ API và đã dừng tiến trình sau khi chạy. Các luồng cũ về tạo/giao/nộp/chấm bài tập và nhập roster giả được ghi nhận ở lần kiểm tra trước. Migration `004_learning_courses.sql` chưa chạy trên PostgreSQL; Docker Desktop/CLI chưa sẵn sàng, nên scanner, Compose production, domain/DNS, backup/restore, tải và nghiệm thu bảo mật vẫn chưa được xác minh.

## 7. Đề nghị quyết định sau buổi trình diễn

TDC có thể chọn một học phần và một lớp giả lập để làm pilot yêu cầu; chỉ chuyển sang pilot có dữ liệu thật sau khi hoàn tất rà soát CNTT, bảo vệ dữ liệu, quy chế thi và nghiệm thu. Phạm vi, thời gian, dữ liệu và điều kiện vận hành cần được TDC phê duyệt riêng.

---

**Lưu ý bàn giao:** tài liệu này mô tả nguyên mẫu hiện tại, không phải cam kết đáp ứng bảo mật, tải hoặc quy chế của kỳ thi chính thức. Đề nghị TDC rà soát nội dung chính sách và cập nhật danh mục/đề cương theo nguồn chính thức mới nhất trước khi trình diễn rộng rãi.
