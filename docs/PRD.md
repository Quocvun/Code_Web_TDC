# PRD — MeoTDC

**Phiên bản:** 0.1 · **Đối tượng:** đồ án phần mềm cho TDC · **Ngôn ngữ giao diện:** tiếng Việt

## 1. Bối cảnh

MeoTDC là hệ thống web phục vụ dạy và đánh giá trực tuyến tại Cao đẳng Công nghệ Thủ Đức. Người dùng chính gồm giảng viên, sinh viên, quản trị viên; định hướng mở rộng cho cán bộ đào tạo. Quy mô lập kế hoạch trên 5.000 tài khoản. Đây là mục tiêu thiết kế, chưa phải cam kết năng lực tải.

## 2. Vấn đề và mục tiêu

Giảng viên cần tạo đề, giao cho lớp và theo dõi kết quả trong một luồng. Sinh viên cần tìm bài được giao, làm bài trên máy tính/điện thoại, tiếp tục an toàn khi mạng chập chờn. Quản trị viên cần quản lý tài khoản, lớp và học phần tập trung.

### Mục tiêu MVP

1. Quản lý lớp, học phần, thành viên và ngân hàng câu hỏi theo quyền.
2. Tạo kỳ kiểm tra có thời lượng, lịch mở/đóng, số lần làm, trộn câu hỏi/đáp án và chính sách xem điểm.
3. Giao bài cho lớp, các sinh viên chọn từ roster hoặc qua liên kết có kiểm soát; sinh viên lưu câu trả lời định kỳ và nộp bài an toàn.
4. Chấm tự động dạng khách quan; hỗ trợ giảng viên chấm tự luận.
5. Nhập đề từ DOCX/PDF vào bản nháp có nguồn gốc từng câu và bước rà soát trước khi xuất bản.
6. Xem điểm, tình trạng hoàn thành và xuất bảng điểm.

### Ngoài phạm vi MVP

Giám sát thi xâm lấn, nhận diện khuôn mặt, ứng dụng native, họp video, phụ huynh, marketplace nội dung, tạo đề AI tự động và tích hợp chính thức hệ thống tài khoản/sổ điểm TDC. AI không được tự xuất bản đề hoặc quyết định điểm.

## 3. Vai trò và quyền

| Vai trò | Quyền dự kiến |
|---|---|
| Quản trị viên trường | Quản lý tài khoản, học kỳ, lớp, học phần, phân công; xem báo cáo cấp trường |
| Giảng viên | Quản lý lớp được phân công, câu hỏi/đề, bài giao, chấm bài và báo cáo lớp |
| Sinh viên | Xem lớp/học phần đã ghi danh, làm bài được giao, xem kết quả theo chính sách |
| Cán bộ đào tạo (giai đoạn sau) | Theo dõi báo cáo và dữ liệu trong phạm vi được cấp |

Mọi quyền phải được kiểm tra phía API theo trường/cơ sở và quan hệ giảng dạy/ghi danh, không chỉ ẩn nút trên web.

### Đăng nhập và định danh dự thi

- Sinh viên có thể dùng tài khoản Google; API chỉ tạo phiên sau khi kiểm tra chữ ký ID token, `aud`, `iss`, hạn token, nonce và email đã xác minh.
- Nếu email khớp roster được nhà trường cấp, hệ thống gắn sinh viên với đúng MSSV/lớp. Email là khóa liên kết có thể thay đổi; Google `sub` là định danh tài khoản ổn định.
- Trước khi vào bài, lưu bản chụp họ tên, MSSV và ngành cùng lượt thi. Đề theo lớp phải đối chiếu ghi danh phía server. Đề mở chỉ dùng khi giảng viên chọn rõ; thông tin tự khai phải được đánh dấu và không được coi là bằng chứng ghi danh.

## 4. Luồng chính

1. Giảng viên tạo câu hỏi hoặc tải DOCX/PDF lên.
2. Hệ thống tạo bản nháp import; báo câu/đáp án không chắc chắn, lỗi công thức, ảnh, bảng; giảng viên sửa và xác nhận.
3. Giảng viên cấu hình đề, chọn lớp, thời gian, lượt làm, đảo đề và kết quả được phép xem.
4. Sinh viên đăng nhập, xác nhận thông tin dự thi, mở bài, nhận mã lượt thi, làm bài và lưu câu trả lời nhiều lần.
5. Nộp bài được ghi nhận theo mã idempotency; hết giờ thì tự nộp theo chính sách đã công bố.
6. Hệ thống chấm khách quan; giảng viên chấm tự luận; điểm chỉ công bố đúng thời điểm cấu hình.

## 5. Yêu cầu chức năng

- **Câu hỏi:** một đáp án, nhiều đáp án, đúng/sai, trả lời ngắn, tự luận; điểm, giải thích, chủ đề, độ khó, tệp hình và công thức toán.
- **Đề và phiên bản:** đóng băng nội dung phiên bản khi bắt đầu có lượt thi; thay đổi đề không làm đổi đáp án của lượt đã bắt đầu.
- **Lượt thi:** trạng thái `in_progress/submitted/expired/graded`; máy chủ là nguồn thời gian chính; lưu từng câu có phiên bản tăng dần; nộp trùng không tạo lượt/điểm trùng.
- **Danh tính:** Google OIDC có nonce dùng một lần; snapshot họ tên/MSSV/ngành/email được lưu cùng lượt. Phân quyền theo lớp phải kiểm tra membership ở API; chế độ thi mở phải là lựa chọn riêng cho từng đề.
- **Import:** DOCX/PDF; import bất đồng bộ; lưu tệp trong vùng riêng tư; giới hạn dung lượng/loại tệp; báo lỗi và mức tin cậy; chỉ giáo viên mới xác nhận bản nháp.
- **Báo cáo:** điểm, điểm trung bình, phân bố điểm, tỷ lệ hoàn thành, câu có tỷ lệ sai cao; lọc theo lớp, môn và kỳ.
- **LMS:** học phần, tài liệu/bài học, nhiệm vụ, thời hạn và tiến độ học; MVP ưu tiên cấu trúc lớp/môn và giao bài.

## 6. Yêu cầu phi chức năng

- Responsive, bàn phím có thể điều hướng, thông báo lỗi dễ hiểu; thiết kế có thể cài PWA ở giai đoạn tiếp theo.
- Tách tenant/trường về dữ liệu; nhật ký sự kiện quan trọng; mã hóa khi truyền; mật khẩu Argon2id/bcrypt; refresh token xoay vòng; rate limit; CSRF khi dùng cookie; validate đầu vào.
- Sao lưu/khôi phục và chính sách lưu dữ liệu phải thống nhất với TDC trước khi dùng thật.
- Mục tiêu khởi tạo để kiểm chứng: 5.000 tài khoản; bài kiểm thử tải phải mô phỏng đỉnh nộp bài đồng thời. Chưa có số liệu benchmark nên chưa đặt SLA.

## 7. Tiêu chí chấp nhận MVP

- Giảng viên có thể soạn đề, xem trước, sửa bản nháp import và giao cho lớp hoặc đúng danh sách MSSV đã chọn.
- Sinh viên chỉ truy cập bài thuộc lớp/đối tượng của mình và không thể gửi đáp án cho bài chưa mở/hết hạn.
- Đăng nhập Google sai token/audience/nonce bị từ chối; email khớp roster vào đúng hồ sơ; sửa thông tin khai báo không làm thay đổi định danh SSO.
- Câu trả lời vẫn khôi phục được sau tải lại hoặc mất mạng ngắn; request lưu/nộp lặp không nhân đôi dữ liệu.
- Điểm trắc nghiệm khớp đáp án và thang điểm; tự luận ở trạng thái chờ chấm.
- Báo cáo lớp đối soát được với lượt thi; xuất file không lộ dữ liệu lớp khác.
- Kiểm thử quyền, dữ liệu biên, khôi phục backup và tải đồng thời đạt ngưỡng được TDC duyệt trước nghiệm thu.

## 8. Giả định đầu vào

TDC được hiểu là Cao đẳng Công nghệ Thủ Đức. Chưa có quy định SSO, mẫu dữ liệu sinh viên, quy chế thi, chính sách lưu giữ điểm/tệp và nhà cung cấp hạ tầng; cần xác minh trước tích hợp hoặc vận hành thật. Ngân sách/nhân sự chưa cung cấp nên lộ trình dưới đây là ước lượng tham khảo cho nhóm nhỏ, không phải cam kết.
