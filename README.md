
Nhóm 1: Quản lý người dùng & Tài khoản

• tai_khoan: Lưu thông tin đăng nhập chính (Gmail, mật khẩu, tên hiển thị, vai trò Giáo viên hay Học sinh).
• giao_vien: Lưu hồ sơ riêng của giáo viên và mã giáo viên (id_gv, ví dụ: GV-XXXX) để gắn với các đề thi họ tạo.
• hoc_sinh: Lưu thông tin học sinh có đăng ký tài khoản chính thức.
• qc_guest_accounts: Lưu thông tin nhận diện tạm thời cho những học sinh không đăng nhập Gmail (vào thi bằng cách gõ thẳng Họ tên + Lớp). Bảng này sẽ tự động dọn dẹp sau 60 ngày không hoạt động.
• thiet_bi: Ghi nhận thông tin thiết bị/trình duyệt truy cập (dùng để chống gian lận hoặc kiểm tra phiên thiết bị).

Nhóm 2: Quản lý Đề thi & Lớp học

• de_thi: Lưu toàn bộ cấu hình của các bài tập/đề thi đã xuất (tên đề, mã đề id_de, mã giáo viên tạo, số câu, thang điểm, chế độ công khai/riêng tư, lịch khóa đề...).
• lop_hoc: Lưu danh sách các mã lớp (ví dụ 10A1, 12A4) gắn với từng giáo viên để lọc và so sánh điểm theo lớp.
• phien_de_thi: Lưu lịch sử các lần giáo viên cập nhật hoặc xuất bản các phiên bản khác nhau của một bộ đề.

Nhóm 3: Vận hành thi, Chấm điểm & Hệ thống

• qc_exam_sessions: Đóng vai trò như "vé vào phòng thi" (entry_token). Cấp vé lúc học sinh bắt đầu thi và đối chiếu vé lúc nộp bài để chống nộp điểm giả hoặc nộp trùng.
• lich_su: Bảng quan trọng nhất để thống kê — lưu toàn bộ kết quả thi đã nộp của học sinh (điểm số, thời gian làm bài, ngày giờ nộp, số lần thi...).
• nhat_ky: Ghi lại nhật ký hoạt động của hệ thống (ai đăng nhập, tạo đề, xóa đề hay lỗi phát sinh) để tiện tra cứu khi cần.
• qc_cleanup_state: Lưu trạng thái và mốc thời gian chạy của các lệnh dọn dẹp dữ liệu tự động (Cron Job).



Dự án **Quiz Craft** (bao gồm mã nguồn, giao diện, cấu trúc dữ liệu và tài liệu đi kèm) thuộc quyền sở hữu trí tuệ của **Hồ Sử (hovsu2009)**.
- **Nghiêm cấm:** Sao chép, chỉnh sửa, phân phối lại, đóng gói lại dưới tên khác hoặc sử dụng mã nguồn cho mục đích thương mại khi chưa có sự đồng ý bằng văn bản của tác giả.
Mọi hành vi vi phạm bản quyền sẽ được báo cáo trực tiếp tới GitHub (DMCA) và các nền tảng lưu trữ liên quan.

