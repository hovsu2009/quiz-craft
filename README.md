# Quiz Craft — HTML / CSS / JavaScript tách riêng

## Cấu trúc

```text
QuizCraft/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── supabase-bridge.js  # Kết nối API / Supabase bridge
│   ├── app.js              # Trạng thái dùng chung, lưu trữ, trình soạn câu hỏi, sự kiện và khởi động
│   ├── teacher.js          # Thống kê giáo viên, quản lý đề/lớp, xuất và phát hành đề, đăng nhập giáo viên
│   └── student.js         # Giao diện làm bài, chấm điểm, tiến độ và bộ mã xuất đề học sinh
└── README.md
```

## Thứ tự nạp JavaScript

`index.html` nạp các tệp theo thứ tự: `supabase-bridge.js` → `config.js` → `app.js` → `teacher.js` → `student.js`.

Các tệp `app.js`, `teacher.js` và `student.js` hiện vẫn là **classic scripts** để cùng chia sẻ các biến/hàm cấp cao nhất như bản gốc. Vì vậy:

- Không thêm `type="module"` vào các thẻ script này.
- Không đổi thứ tự nạp nếu chưa kiểm tra các phụ thuộc.
- Khi sửa tính năng giáo viên, ưu tiên `teacher.js`; tính năng học sinh/làm bài, ưu tiên `student.js`; chức năng dùng chung và trình soạn câu hỏi nằm trong `app.js`.

## Chạy / triển khai

Giữ nguyên cấu trúc thư mục khi tải lên GitHub Pages. Mở trang qua GitHub Pages hoặc local web server; không nên mở trực tiếp bằng `file://` nếu tính năng cần kết nối mạng.

`config.js` là tệp cấu hình bên ngoài và không được đóng gói sẵn. Giữ tệp này ở cùng cấp `index.html` như cấu hình hiện tại của dự án.

Các đoạn dữ liệu nhúng không phải JavaScript (ví dụ `type="text/plain"`) được giữ trong HTML. CSS vẫn được gom trong `css/styles.css`.


## Đồng bộ xóa đề và kiểm tra quyền thi

- Xóa đề trên Supabase cập nhật `de_thi.trang_thai = 'DELETED'` theo `id_gv + project_key`; nếu không khớp sẽ thử theo `id_gv + id_de`.
- API chỉ xác nhận xóa khi Supabase trả về ít nhất một dòng được cập nhật. Nếu không có dòng khớp, giao diện sẽ nhận lỗi thay vì báo xóa thành công giả.
- Học sinh bị từ chối vào thi khi mã đề không tồn tại hoặc đã bị xóa.
- Thống kê lọc lịch sử theo danh sách đề đang hoạt động.
- File HTML học sinh được nhúng `supabase-bridge.js` để kiểm tra trạng thái đề trực tiếp khi mở bài.

Sau khi cập nhật, cần tải toàn bộ thư mục lên GitHub Pages và xuất lại file/link đề học sinh cũ để chúng có bridge kiểm tra trạng thái mới.
