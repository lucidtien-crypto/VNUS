VOICENOTE VI/US — MOBILE OFFLINE PWA
==================================

1. CÁCH CÀI LÊN ĐIỆN THOẠI
- Đây là WEBSITE/PWA, KHÔNG PHẢI file APK hoặc IPA.
- Đưa TẤT CẢ file trong thư mục này lên một địa chỉ HTTPS hỗ trợ hosting tĩnh
  (GitHub Pages, Netlify, Cloudflare Pages...). Không mở index.html bằng file://.
- Trên Android: mở địa chỉ HTTPS bằng Chrome, chọn "Add to Home screen" / "Cài ứng dụng".
- Trên iPhone: mở bằng Safari, Chia sẻ -> Thêm vào Màn hình chính.
- Chấp nhận quyền micro khi bấm Bắt đầu nói.

2. TẢI VÀ SỬ DỤNG OFFLINE
- Kết nối Wi-Fi, bấm "Tải bộ nhận dạng". Chờ trạng thái "Đã nạp · dùng offline".
- Nên chạy thử một câu khi còn mạng, sau đó bật chế độ máy bay và mở lại ứng dụng.
- App thử kiểm tra mô hình từ bộ nhớ cache khi mở lại; nếu tài nguyên bị xóa phải tải lại.
- Mô hình multilingual Whisper-tiny dùng CHUNG cho VI và EN-US.
- Mỗi đoạn âm thanh được xử lý offline sau khi thu, không phải phụ đề thời gian thực
  từng chữ. Có thể chậm trên điện thoại yếu và nhận dạng không hoàn hảo.
- Đọc lại bằng loa phụ thuộc giọng đọc cài trên hệ điều hành, không bảo đảm offline.

3. CẬP NHẬT
- "Kiểm tra cập nhật" kiểm tra SW/app và model-release.json trên chính trang đã đăng.
- Nếu người triển khai nâng appVersion hoặc modelVersion trong model-release.json,
  nút sẽ báo có bản mới và đề nghị tải lại trang / tải mô hình.
- Bản này KHÔNG có một kho cập nhật tự động trên Internet; nhà triển khai phải xuất bản
  bản mới. Nó KHÔNG thể tự phát hiện mọi thay đổi của Hugging Face.
- Không xóa dữ liệu web của trình duyệt nếu muốn giữ mô hình.

4. GIỚI HẠN QUAN TRỌNG
- Trong gói ZIP này KHÔNG có sẵn mô hình Whisper hoặc các tệp runtime WASM.
  Khi tải lần đầu, trình duyệt tải từ Hugging Face và jsDelivr.
- Tài nguyên mô hình có thể ~75–150 MB hoặc hơn tùy phiên bản và kiểu lượng tử;
  nên để dư bộ nhớ và RAM. iPhone cũ có thể không chạy nổi.
- PWA shell được SW lưu; transformers.js cố lưu mô hình trong Cache API.
  Trình duyệt / hệ điều hành vẫn có quyền xóa cache để giải phóng dung lượng.
- Việc hoạt động offline sau khi cài chưa được xác minh thực nghiệm trên máy người dùng.

5. KIỂM THỬ NHANH
- Tải model và để ứng dụng chạy xong.
- Đóng hẳn ứng dụng, ngắt mạng, mở lại -> "Kiểm tra đã tải".
- Ghi 1 đoạn tiếng Việt và 1 đoạn tiếng Anh, dừng để xem kết quả.
- Nếu lỗi, bật mạng để tải bổ sung. Xem dung lượng trang web trong cài đặt điện thoại.
