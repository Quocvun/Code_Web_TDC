# Rà soát tài liệu công khai Azota và định hướng MeoTDC

**Cập nhật:** 19/11/2026. Phạm vi là tài liệu hướng dẫn chính thức mà Azota công khai; đây không phải kiểm thử tài khoản hay kiểm toán kỹ thuật sản phẩm. Tài liệu công khai không đủ để kết luận về hạ tầng nội bộ hoặc khẳng định Azota thiếu một năng lực nào đó.

## Năng lực Azota đã công bố

- Tài liệu thi trực tuyến mô tả cấu hình giờ thi, thời lượng, số lượt, đối tượng, đảo câu/đáp án, chính sách xem điểm, giám sát, chấm khách quan tự động và chấm tự luận. Tài liệu tạo đề mô tả Word/PDF/Excel, ngân hàng câu hỏi, ma trận và hỗ trợ AI tạo câu hỏi. [Thi online](https://docs.azota.vn/docs/huong-dan-su-dung/thi-online/), [Cấu hình thi online](https://docs.azota.vn/docs/huong-dan-su-dung/thi-online/cau-hinh-thi-online/), [Tạo đề thi](https://docs.azota.vn/docs/huong-dan-su-dung/de-thi/)
- Azota có thống kê theo câu hỏi và thống kê theo Yêu cầu cần đạt (YCCĐ); phần thống kê năng lực tổng hợp câu hỏi cùng YCCĐ và xem xu hướng qua nhiều lần làm. [Thống kê đề thi](https://docs.azota.vn/docs/huong-dan-su-dung/de-thi/thong-ke-de-thi/), [Thống kê theo năng lực](https://docs.azota.vn/docs/huong-dan-su-dung/thi-online/thong-ke-theo-nang-luc/)
- Ở chế độ thi trên web, hướng dẫn giám sát mô tả tín hiệu thoát toàn màn hình/chuyển tab. Cùng tài liệu nói rõ hệ thống không báo giáo viên trực tiếp trong lúc thi, không tự kết luận gian lận, không tự chặn thao tác hay hủy bài; dữ liệu có thể thiếu do giới hạn trình duyệt/thiết bị và chức năng hoạt động đầy đủ trên máy tính hơn điện thoại/máy tính bảng. Đây là ranh giới mà tài liệu công khai nêu cho chế độ này. [Giám sát thi](https://docs.azota.vn/docs/huong-dan-su-dung/thi-online/giam-sat-thi/)
- Azota còn hướng dẫn chế độ chỉ thi trên ứng dụng Azota Student: chặn copy/paste, chụp màn hình trên thiết bị thi và ghi một số mốc hoạt động. Tài liệu cũng nhấn mạnh không có cơ chế phát hiện tuyệt đối mọi hình thức gian lận. Vì vậy không nên mô tả giám sát trình duyệt là điểm yếu chung của toàn sản phẩm. [Chỉ thi trên ứng dụng](https://docs.azota.vn/docs/huong-dan-su-dung/thi-online/cai-dat-chi-thi-tren-ung-dung-azota/)
- Tài liệu phân biệt bài tập, đề thi và khóa học; bài tập hỗ trợ tệp, nhận xét/nộp lại; đề thi có câu hỏi, đáp án, thời lượng, đảo đề, giám sát và thống kê. [Bài tập và đề thi](https://docs.azota.vn/docs/huong-dan-su-dung/bai-tap/phan-biet-chuc-nang-bai-tap-va-de-thi/)

## Điều nên học cho sản phẩm TDC

| Nhu cầu | Cách đưa vào MeoTDC | Trạng thái hiện tại |
|---|---|---|
| Luồng học tập liền mạch | Nối lớp/học phần → ngân hàng → soạn đề/bài tập → giao → làm/nộp → chấm → báo cáo | Đề/lượt thi và bài tập/bài nộp/điểm đã có API; lớp/học phần, khóa học và ngân hàng vẫn còn dữ liệu mẫu |
| Cấu hình đề kiểm soát được | Lịch mở/đóng, thời lượng, số lượt, đối tượng, mật khẩu, trộn đề, ma trận và thời điểm mở điểm | API đề đã xác minh lịch, mật khẩu, lớp/MSSV/Google, lượt, câu hỏi rút và chính sách điểm |
| Đáp án không phát cho thí sinh | Giữ đáp án chuẩn ở API; chấm khách quan ở máy chủ; chỉ trả điểm khi chính sách cho phép | Đã triển khai cho đề server-backed; dữ liệu đề cũ trong localStorage được làm sạch khi đọc |
| Theo dõi phiên thi | Bảng giám sát phiên đang chạy, heartbeat, nhật ký sự kiện và hàng đợi cần rà soát | Có monitor giảng viên và endpoint live; sự kiện nguồn trình duyệt vẫn không phải chứng cứ chắc chắn |
| Phân tích gắn chuẩn đầu ra TDC | Tổng hợp câu trả lời theo YCCĐ của chương trình/ngành; cho xem nguồn dữ liệu và mức độ tin cậy | Có tỷ lệ đúng theo chuẩn đầu ra trên câu khách quan của đề; chưa phải chỉ số năng lực tích lũy qua nhiều bài |
| Tài khoản tổ chức | Ánh xạ SSO ↔ MSSV ↔ roster chính thức ↔ khoa/lớp/học kỳ | Có Google/roster CSV và cấp tài khoản thử; cần TDC cấp nguồn danh tính, danh mục lớp/học phần và quy tắc phân quyền |

## Phạm vi bản dùng để đối chiếu tại TDC

MeoTDC hiện phù hợp để trình diễn luồng và thu thập yêu cầu bằng dữ liệu giả lập. Bảng dưới tách phần đã vận hành trong nguyên mẫu khỏi những năng lực còn phải kết nối/nghiệm thu:

| Vai trò | Đã có trong nguyên mẫu | Còn thiếu trước khi vận hành chính thức |
|---|---|---|
| Sinh viên | Xem đề theo đối tượng, làm bài có đồng hồ, autosave, nộp bài tập, xem điểm/nhận xét | SSO/MSSV được TDC xác nhận, lịch sử học vụ đầy đủ, thông báo đa kênh và hỗ trợ tiếp cận được nghiệm thu |
| Giảng viên | Soạn/giao đề, theo dõi lượt thi, nhập roster thử, giao bài tập, nhận bài, chấm và xuất CSV | CRUD lớp/học phần chính thức, đồng giảng viên/phân quyền theo lớp, ngân hàng dùng chung có phiên bản và báo cáo tích lũy |
| Nhà trường | Tổng quan từ API, xem roster, nhập CSV, cấp tài khoản thử và xem báo cáo lượt thi | Quản trị khoa/học kỳ/lớp, quy trình duyệt, audit bất biến, lưu trữ/xóa dữ liệu, tích hợp SIS/SSO và backup/khôi phục |
| Vận hành | Compose có PostgreSQL/MinIO/ClamAV/Caddy, health check và restart policy | Docker/server/domain/DNS/Google origin thật, giám sát/cảnh báo, backup offsite, kiểm thử tải và diễn tập khôi phục |

Các mục “đã có” chỉ mô tả chức năng nguyên mẫu, không phải xác nhận nghiệm thu CNTT hoặc phê duyệt dùng dữ liệu cá nhân thật.

## Ranh giới chống gian lận

MeoTDC hiện chia bảo vệ thành hai lớp. API giữ đáp án và dữ liệu chấm, kiểm tra quyền bắt đầu lượt, áp dụng hạn/số lượt, lưu câu trả lời và trả điểm theo chính sách. Giao diện trình duyệt yêu cầu toàn màn hình, chặn một số thao tác phổ biến và gửi tín hiệu khi rời tab, thoát fullscreen hoặc thử copy/paste/in; ba đợt được tính có thể tự nộp bài để giảng viên xem lại.

Lớp thứ hai vẫn dựa vào trình duyệt của thí sinh. Người dùng có thể dùng thiết bị khác, sửa mã/trình duyệt hoặc làm cho tín hiệu không gửi được. Tự nộp không đồng nghĩa kết luận gian lận, và nhật ký không được dùng làm căn cứ kỷ luật duy nhất. Bài thi có rủi ro cao cần quy chế rõ, xác thực danh tính/thiết bị phù hợp, giám sát có thông báo, lưu vết máy chủ, phương án tiếp cận và cơ chế giải trình. Ngay tài liệu Azota cũng xem log giám sát là dữ liệu tham khảo, không phải phát hiện tuyệt đối.

## Việc cần hoàn thành trước pilot có dữ liệu thật

1. Thay snapshot JSONB runtime bằng repository PostgreSQL quan hệ theo attempt/answer, khóa theo lượt để tăng đồng thời; thêm backup mã hóa/offsite, phục hồi và thời hạn lưu. PostgreSQL hiện đã được nối cho snapshot, roster, phiên, rate limit và metadata tệp nhưng chưa ghi vào các bảng nghiệp vụ quan hệ trong `001_init.sql`.
2. Nối SSO TDC và roster có xác minh; cấp quyền giảng viên theo lớp/học phần và thu hồi được. Google email đơn lẻ không chứng minh MSSV hay quan hệ học tập.
3. Tách kho câu hỏi riêng có phân quyền máy chủ và lịch sử phiên bản; hoàn thiện nhập XLSX/OCR với bước duyệt trước khi xuất bản.
4. Lưu audit bền vững cho xuất bản đề, chấm/sửa điểm, xuất báo cáo và truy cập dữ liệu; thêm kiểm thử bảo mật, tải, khôi phục, trình duyệt/thiết bị và accessibility.
5. TDC xác định loại kỳ thi nào dùng browser guardrail, loại nào cần ứng dụng/kiosk/giám sát trực tiếp; công bố thu thập dữ liệu, quy trình xử lý cảnh báo và khiếu nại.
6. Thử pilot nhỏ bằng dữ liệu giả trước; chỉ dùng dữ liệu thật sau khi TDC nghiệm thu hạ tầng, chính sách, phân quyền và quy trình vận hành.

MeoTDC nên khác biệt bằng mô hình của TDC—khoa, ngành, học kỳ, học phần, MSSV và chuẩn đầu ra—chứ không tự nhận có nhiều tính năng hơn Azota. Các nguồn phía trên cho thấy Azota đã công bố nhiều khả năng tương ứng; khi so sánh cần nêu rõ nguồn, chế độ web/app và phạm vi đo lường.
