# MeoTDC

MeoTDC là đồ án nền tảng học tập số cho sinh viên, giảng viên, nhà trường và quản trị viên Trường Cao đẳng Công nghệ Thủ Đức. Bản tải về là demo local có các luồng thao tác giữa vai trò; không phải hệ thống TDC chính thức.

## Chạy nhanh

Yêu cầu Node.js 20.9 trở lên và pnpm.

```powershell
pnpm install
pnpm dev
```

Mở `http://localhost:3000`. Chế độ phát triển chỉ bind giao diện/API vào loopback máy local. API mặc định chạy tại `http://localhost:4000/api/v1/health`; nếu cấu hình `API_PORT` thì dùng cổng đó. Trên Windows có thể chạy `Run-MeoTDC.bat`.

Các alias `.localhost` bên dưới trỏ về loopback và chỉ dùng trên máy đang chạy ứng dụng. Thử mở trực tiếp trước; nếu Windows không phân giải được, chạy `.\scripts\install-local-hosts.ps1` trong PowerShell quyền quản trị:

- `http://meotdc.localhost:3000`
- `http://student.meotdc.localhost:3000`
- `http://teacher.meotdc.localhost:3000`
- `http://school.meotdc.localhost:3000`
- `http://admin.meotdc.localhost:3000`

Các tên này trỏ về `127.0.0.1`; chúng là địa chỉ demo nội bộ, không phải tên miền Internet. Tất cả mở cùng ứng dụng và dùng tài khoản theo vai trò.

Không có `DATABASE_URL`, `pnpm dev` dùng bộ nhớ để trình diễn. Nếu có `.env` chứa `DATABASE_URL`, API tự chạy migrations và lưu đề/lượt thi, bài tập/bài nộp, roster, phiên và rate limit trong PostgreSQL.

### Chạy stack PostgreSQL và MinIO

Yêu cầu Docker Desktop. Sao chép `.env.example` thành `.env`; đặt hai secret ngẫu nhiên độc lập dài ít nhất 24 ký tự cho `POSTGRES_PASSWORD` và `MINIO_ROOT_PASSWORD`, rồi cấu hình Google OAuth ID/email allowlist. Có thể tạo chuỗi an toàn trong PowerShell bằng:

```powershell
([Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))).Replace('+','-').Replace('/','_').TrimEnd('=')
```

`GOOGLE_CLIENT_ID` và `NEXT_PUBLIC_GOOGLE_CLIENT_ID` phải cùng Web Client ID. Production từ chối khởi động nếu thiếu admin email, Google Client ID, database/object-storage secret đạt độ dài tối thiểu, HTTPS origin công khai hoặc bộ quét tệp bắt buộc.

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

Mở `http://localhost:3000`; API health tại `http://localhost:4000/api/v1/health`. Các cổng DB, MinIO và API chỉ bind vào loopback. Backup PostgreSQL thủ công bằng `.\scripts\backup.ps1`; script này chưa sao lưu bucket MinIO.

Để phục vụ nhiều domain công khai, đặt `MEOTDC_DOMAINS=portal.example.com,exam.example.com` và `MEOTDC_WEB_ORIGINS=https://portal.example.com,https://exam.example.com`; mỗi host phải trỏ DNS về máy chạy Caddy. Nếu chỉ có một host, có thể tiếp tục dùng `MEOTDC_DOMAIN` cũ. Thêm từng origin vào **Authorized JavaScript origins** của Google Web Client ID, sau đó chạy `docker compose --profile public up --build -d`. Caddy cấp TLS cho các host trong `MEOTDC_DOMAINS`; cookie production luôn đặt `Secure`. Đổi secret mẫu trước khi chạy và áp dụng policy mạng/backup của trường.

API và giao diện trong Compose chạy bằng user `node`; API lưu tệp vào volume `meotdc-uploads`. Kiểm tra sức khỏe sau khi deploy tại `https://<domain>/api/v1/health`. Backup script hiện chỉ dump PostgreSQL, chưa sao lưu bucket MinIO.

### Giữ máy chủ chạy liên tục

Các container trong Compose đặt `restart: unless-stopped`; Docker sẽ tự khởi động lại container khi lỗi hoặc khi Docker Engine khởi động lại. Máy Windows cần bật Docker Desktop tự chạy khi đăng nhập và không ngủ/tắt máy. Để chạy 24/7 cho nhà trường, nên triển khai trên máy chủ Linux/VM luôn bật, bật Docker service lúc khởi động, trỏ DNS A/AAAA về IP máy chủ và chỉ mở cổng 80/443 của Caddy ra Internet. Không mở cổng PostgreSQL, Redis, MinIO hoặc API trực tiếp.

Kiểm tra trạng thái bằng `docker compose ps`, API health tại `/api/v1/health` và log bằng `docker compose logs --tail=100 api web caddy`. Restart policy không thay thế giám sát/cảnh báo, sao lưu ngoài máy và diễn tập khôi phục; hiện script backup mới dump PostgreSQL thủ công, chưa backup MinIO.

### Publish ảnh lên Docker Hub

Compose dùng `vuongdeptraii2k8/duantuonglai` cho giao diện web và `vuongdeptraii2k8/meotdc-api` cho API. Để build/push image theo tag yêu cầu mà chưa triển khai production, chạy:

```powershell
.\scripts\publish-duantuonglai.ps1 -Tag tagname
```

Script kiểm tra Docker Engine, đăng nhập Docker Hub bằng device flow, xác nhận đúng tài khoản `vuongdeptraii2k8`, rồi build/push cả web và API; image giao diện mang tên chính xác `vuongdeptraii2k8/duantuonglai:tagname`. Nếu Google Client ID chưa được cấp vào môi trường build, script cảnh báo và image web sẽ chưa bật đăng nhập Google. Image không chứa file `.env`, OAuth client secret, hay dữ liệu trong `apps/api/data` nhờ `.dockerignore`.

Để publish sau khi đã cấu hình production, có thể dùng script kiểm tra đầy đủ domain/origin/secret. Cần Docker Engine, `.env` production hoàn chỉnh và Docker Hub access token quyền `write`; đặt token trong `DOCKERHUB_TOKEN` của phiên PowerShell (không lưu token vào `.env` hay Git), sau đó chạy:

```powershell
$env:MEOTDC_IMAGE_TAG = "2026-11-19"
.\scripts\publish-docker.ps1
```

Script kiểm tra `.env`, đăng nhập bằng `--password-stdin`, build rồi push hai ảnh. Máy chủ đích có thể kéo ảnh đã publish bằng `docker compose pull api web` rồi chạy `docker compose --profile public up --no-build -d`.

## Trang giới thiệu và đăng ký

Khách truy cập vào trang giới thiệu có nút **Đăng nhập** và **Đăng ký** ở góc phải. Google xác minh danh tính; ở demo, email chưa có roster có thể vào hồ sơ mô phỏng. Ở production, sinh viên phải có email trong roster và giảng viên/nhà trường/admin phải nằm trong allowlist role trên máy chủ.

## Tài khoản trải nghiệm

Mật khẩu chung cho ba tài khoản trải nghiệm là `MeoTDC@2026`.

| Vai trò | Tên đăng nhập |
|---|---|
| Sinh viên mẫu | `sv.demo` |
| Giảng viên | `gv.demo` |
| Nhà trường | `school.demo` |

Quản trị viên đăng nhập bằng Google đã xác minh theo email cấu hình riêng ở API. Tài khoản quản trị không có mật khẩu demo và địa chỉ cấu hình không được gửi về giao diện.

Có thể chọn bất kỳ ngành nào trong danh mục 37 ngành khi đăng nhập sinh viên. Các ngành chưa có lớp/học phần mẫu sẽ được đưa vào học phần “Toàn trường (mô phỏng)”.

### Đăng nhập bằng Google và thông tin trước giờ thi

MeoTDC hỗ trợ Google Identity Services: Google xác thực tài khoản, API kiểm tra chữ ký ID token, `aud`, `iss`, thời hạn, nonce dùng một lần và email đã xác minh. Ứng dụng không nhận hay lưu mật khẩu Gmail.

Để bật đăng nhập Google trên máy local:

1. Tạo OAuth Client loại **Web application** trong Google Cloud Console.
2. Thêm origin bạn sẽ mở vào **Authorized JavaScript origins**. Local mặc định là `http://localhost:3000`; nếu dùng alias, thêm từng origin riêng: `http://meotdc.localhost:3000`, `http://student.meotdc.localhost:3000`, `http://teacher.meotdc.localhost:3000`, `http://school.meotdc.localhost:3000` và `http://admin.meotdc.localhost:3000`. Domain công khai phải thêm origin HTTPS chính xác của từng host. Google không chấp nhận origin chưa khai báo cho Client ID.
3. Đặt `GOOGLE_CLIENT_ID` và `MEOTDC_ADMIN_EMAIL` trong `.env` gốc hoặc `apps/api/.env`; đặt cùng Client ID trong `apps/web/.env.local` dưới `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Khi chạy production, khai báo email giảng viên/nhà trường trong allowlist; đồng thời gán lớp cụ thể cho từng giảng viên bằng `MEOTDC_TEACHER_CLASS_ASSIGNMENTS=email@tdc.edu.vn=CLASS1|CLASS2;...`. Giảng viên production chưa được gán mã lớp sẽ không xem/chỉnh sửa đề, bài tập, bài nộp hoặc lượt thi của lớp. Sinh viên cần có email trong roster. Không đưa file `.env` thật lên Git hoặc chia sẻ trong ảnh chụp màn hình.
4. Khởi động lại ứng dụng:

   ```powershell
   pnpm dev
   ```

API xác minh chữ ký token Google, `aud`, `iss`, thời hạn, nonce dùng một lần và email đã xác minh. Tài khoản admin/giảng viên/nhà trường chỉ nhận role nếu email khớp cấu hình máy chủ. Khi mở bài thi, sinh viên xác nhận **họ tên, MSSV, ngành**. Nếu giáo viên nhập roster CSV có cột `Email` hoặc `Gmail`, tài khoản Google trùng email sẽ tự gắn với hồ sơ và lớp đó. Khi soạn đề, giảng viên có thể giao cho cả lớp, chọn riêng các MSSV trong roster, hoặc mở cho mọi tài khoản Google đã xác minh được hệ thống chấp nhận.

Không có OAuth Client ID thì nút Google hiển thị hướng dẫn cấu hình và chưa thể đăng nhập; ba tài khoản trải nghiệm ở trên vẫn dùng được. Chế độ đề mở lưu MSSV và ngành do thí sinh khai báo, chưa đối chiếu dữ liệu TDC, vì vậy chưa dùng cho kỳ thi chính thức. Google OAuth chỉ xác minh định danh Google, không tự chứng minh sinh viên thuộc trường.

### Tạo đăng nhập riêng theo roster sinh viên

1. Đăng nhập giảng viên, vào **Lớp học**, tạo lớp thuộc ngành cần demo.
2. Nhập CSV có các cột `MSSV`, `Họ tên`, và tùy chọn `Email`/`Gmail`. MeoTDC xem trước dữ liệu, báo MSSV/tên trùng và email sai trước khi xác nhận; danh sách cũng có thể xuất lại CSV.
3. Đăng xuất, vào bằng `school.demo`, mở **Tài khoản**.
4. Chọn lớp và bấm **Cấp tài khoản cho lớp**. Mỗi sinh viên có username theo MSSV và mật khẩu ngẫu nhiên riêng; tải CSV để phát cho sinh viên. Email trong roster liên kết Gmail; mật khẩu chỉ xuất hiện ở lượt cấp mới.
5. Sinh viên đăng nhập bằng MSSV và mật khẩu trong CSV. Có thể chọn ngành bất kỳ trong danh mục khi đăng nhập tài khoản mẫu `sv.demo`.

Nếu bật PostgreSQL, roster, phiên, bài tập, bài nộp và điểm bài tập tồn tại qua restart; đề/lượt thi giữ trong snapshot JSONB có advisory lock để tránh ghi đè giữa API instance. Cấu hình MinIO/S3 lưu nội dung tệp và PostgreSQL lưu metadata. Danh mục lớp/học phần, khóa học và roster giảng viên vẫn chưa đồng bộ với hệ thống chính thức TDC; local demo còn dùng dữ liệu trình duyệt cho các màn hình mẫu đó. Nếu không cấu hình database/object storage, local demo dùng bộ nhớ và filesystem.

## Danh mục ngành và tài liệu TDC

Landing page và cổng nhà trường hiển thị 37 ngành tham chiếu cùng liên kết tài liệu theo từng thẻ ngành. Nguồn hiện gắn vào dữ liệu:

- [Thông báo học phí HKI 2025–2026 của TDC](https://online.tdc.edu.vn/img/Th%C3%B4ng%20b%C3%A1o%20chung/file/P_KHTC/HOC%20PHI%202025-2026/HOC%20KY%2001/THONG%20BAO%20THU%20HP%20HKI%202025-2026%20-%20Dieu%20chinh%207-9%20.pdf) để đối chiếu ngành và trình độ.
- [Sổ tay học vụ theo khoa 2024–2025](https://online.tdc.edu.vn/img/S%E1%BB%95%20tay%20Sinh%20vi%C3%AAn/file/So%20Tay%20HSSV/HK1%20NH%202024-2025/SO%20TAY%20HOC%20VU%20KHOA%202024.pdf) để tham khảo tổ chức khoa và thông tin học vụ.
- Với các ngành thuộc FIT, trang [chương trình đào tạo](https://fit.tdc.edu.vn/dao-tao) và [tuyển sinh 2026](https://fit.tdc.edu.vn/tuyen-sinh) được đính kèm riêng.

Đây là tài liệu tham khảo theo năm công bố, không phải đề cương chi tiết của từng ngành hoặc cam kết tuyển sinh hiện tại. Trước khi trình diễn/chốt dữ liệu cho trường, cần xin phiên bản đề cương và danh mục tuyển sinh mới nhất từ từng khoa/phòng đào tạo.

## Luồng đã có trong demo

- **Giảng viên:** tạo lớp mẫu; soạn và xuất bản đề server-backed; giao bài tập trên máy chủ theo lớp; xem bài nộp, chấm/nhận xét, yêu cầu sửa và xuất CSV. Một số màn hình khóa học, bài học và ngân hàng câu hỏi vẫn là dữ liệu demo.
- **Sinh viên:** đăng nhập bằng tài khoản demo hoặc Google đã xác minh; trước khi thi xác nhận họ tên, MSSV, ngành; chỉ thấy đề theo lớp, theo MSSV đã chọn, hoặc đề mở cho Google. Có thể tìm và lọc đề theo trạng thái/hạn làm; đề server-backed có đồng hồ, tự lưu câu trả lời và chấm điểm khách quan trên API; bài tập đã giao có thể nộp nội dung/tệp và nhận điểm/phản hồi.
- **Nhà trường/quản trị:** xem tổng quan theo dữ liệu API, ngành tham khảo, roster, lượt thi và điểm; nhập roster sinh viên bằng CSV và cấp mật khẩu khởi tạo riêng. Quản trị viên đăng nhập Google theo cấu hình máy chủ.
- **Nhập đề:** thử trích xuất DOCX, PDF có lớp văn bản hoặc TXT theo mẫu câu hỏi đơn giản; luôn chuyển vào bản nháp để rà soát.

## Giới hạn cần biết

- Danh mục 37 ngành là dữ liệu tham khảo; lớp và roster trong gói là dữ liệu mẫu hoặc do người trải nghiệm tự nhập.
- Không có danh tính, MSSV, SSO hoặc chính sách tài khoản chính thức của TDC. MSSV/ngành ở đề mở là thông tin tự khai; cần đối chiếu roster trước khi dùng kết quả thật. Không dùng tài khoản và mật khẩu demo cho hệ thống thật.
- PostgreSQL hiện lưu runtime trong một JSONB snapshot bị khóa toàn cục. Cách này bền qua restart và tránh lost update, nhưng tuần tự hóa heartbeat/autosave nên chưa phù hợp 5.000 lượt đồng thời; cần chuyển sang repository quan hệ và benchmark.
- Stack dùng S3-compatible storage và ClamAV khi chạy Docker; upload tối đa 10 MB, kiểm tra chữ ký và quét trước khi lưu. Local demo không cấu hình scanner nên không bật quét. Phân quyền file/attempt theo lớp học phần vẫn cần tích hợp roster chính thức.
- Chưa có SSO TDC, backup mã hóa/offsite tự động, retention/deletion, audit đầy đủ, đo tải hoặc review bảo mật. Tín hiệu tab/fullscreen/copy vẫn do trình duyệt gửi, có thể bị giả/mất; không dùng một mình làm căn cứ kỷ luật.

## Tài liệu đồ án

- [PRD và tiêu chí MVP](docs/PRD.md)
- [Kiến trúc và luồng nghiệp vụ](docs/architecture.md)
- [Mô hình dữ liệu](docs/db-schema.md)
- [API hiện có và giới hạn bảo mật](docs/api.md)
- [Tham khảo sản phẩm](docs/competitors.md)
- [Phân tích Azota và quyết định cho MeoTDC](docs/azota-product-analysis.md)
- [Kế hoạch sáu giai đoạn](docs/implementation-plan.md)
- [Lộ trình pilot](docs/roadmap.md)
- [Hồ sơ trình diễn và đề xuất pilot gửi TDC](docs/tdc-pilot-handoff.md)
- [Đối chiếu tính năng Azota và khoảng trống pilot](docs/azota-product-analysis.md)

```powershell
pnpm build
```

Tài liệu triển khai: [Kiến trúc](docs/architecture.md), [API](docs/api.md), [mô hình dữ liệu](docs/db-schema.md), [hồ sơ pilot TDC](docs/tdc-pilot-handoff.md).

MeoTDC học theo quy trình sản phẩm giáo dục, không sao chép giao diện, tên gọi hoặc tài sản của Azota.

### Cấu hình thi bổ sung trong bản demo

- Giảng viên đặt giờ mở và giờ đóng, mật khẩu đề, cùng các trường văn bản cần sinh viên khai báo trước khi thi.
- Có thể rút một số câu ngẫu nhiên từ bộ câu hỏi của đề cho mỗi lượt; giảng viên đặt quota chính xác theo tổ hợp chủ đề, chuẩn đầu ra và mức độ; báo cáo chỉ so sánh câu đã được rút.
- Đề server-backed được API xác minh mật khẩu/lịch mở, quyền dự thi, số lượt, câu được rút và thời hạn; đáp án giữ ở API, câu trả lời tự lưu/offline queue và điểm khách quan được tính ở máy chủ. Cấu hình PostgreSQL hiện là snapshot khóa toàn cục, chưa đạt thông lượng thi lớn.

### Giám sát bài thi trong bản demo

- Đề mới bật sẵn chế độ giám sát nghiêm ngặt; giảng viên có thể tắt cho bài luyện tập. Chế độ này yêu cầu toàn màn hình, chặn các thao tác sao chép/dán/in và một số phím tắt, ghi nhật ký khi rời tab hoặc thoát toàn màn hình, rồi tự nộp sau ba đợt vi phạm.
- Nhật ký và lý do tự nộp xuất hiện trong báo cáo lượt thi và tệp CSV. Đây là tín hiệu để giảng viên rà soát, không phải kết luận gian lận và không tự trừ điểm.
- Tín hiệu focus/fullscreen/copy vẫn phát sinh từ trình duyệt và có thể bị giả, bị chặn hoặc không gửi; API đóng dấu thời điểm nhận, lưu sự kiện và có thể tự nộp sau ba đợt. Ứng dụng không ngăn thiết bị thứ hai, không khóa hệ điều hành và không xác minh người ngồi trước máy. Cảnh báo/tự nộp chỉ yêu cầu giảng viên rà soát, không phải kết luận gian lận.
