# VocabMaster

Extension Chrome để học từ vựng tiếng Anh với các tính năng highlight và ôn tập từ.

## Tính năng chính

### 1. Highlight từ vựng
- **Double-click** vào từ bất kỳ trên trang web để chọn từ
- **Nhấn Alt+H** để highlight và lưu từ đã chọn
- Từ được highlight sẽ được bôi đậm với màu sắc tùy chọn
- Tự động lưu từ mới vào Google Sheets (nếu đã cấu hình)

### 2. Quản lý từ vựng
- Xem danh sách tất cả từ đã highlight
- Thêm nghĩa cho từ (click vào từ để chỉnh sửa)
- Xóa từ riêng lẻ hoặc xóa tất cả
- Sao chép danh sách từ vào clipboard
- Chọn màu highlight từ 5 màu có sẵn

### 3. Ôn tập từ ngẫu nhiên
- Tab "Từ Ngẫu Nhiên" hiển thị từ ngẫu nhiên mỗi ngày
- Đánh giá từ: "Tôi Biết" hoặc "Tôi Không Biết"
- Theo dõi tiến độ ôn tập hàng ngày
- Ưu tiên từ chưa được ôn tập gần đây

### 4. Tích hợp Google Sheets
- Nhập URL Google Sheets để tự động lưu từ mới
- Từ mới sẽ được gửi tự động vào sheet với thông tin:
  - Từ vựng
  - Nghĩa (nếu có)
  - Ngày thêm
  - Số lần highlight
  - URL nguồn
  - Tiêu đề trang

## Cách sử dụng

### Cài đặt Extension
1. Mở Chrome và vào `chrome://extensions/`
2. Bật "Developer mode" ở góc trên bên phải
3. Click "Load unpacked" và chọn thư mục chứa extension
4. Extension sẽ xuất hiện trong thanh công cụ

### Sử dụng cơ bản
1. **Highlight từ**: Double-click vào từ → Nhấn Alt+H
2. **Mở popup**: Click vào icon extension trên thanh công cụ
3. **Chọn màu**: Click vào màu trong phần color picker
4. **Cấu hình Google Sheets**: Nhập URL sheet và click "Lưu URL Sheet"

### Cấu hình Google Sheets
1. Tạo Google Sheets mới
2. Copy URL của sheet
3. Paste vào ô "Google Sheets URL" trong extension
4. Click "Lưu URL Sheet"
5. Từ mới sẽ tự động được gửi vào sheet

## Cấu trúc file

```
├── manifest.json          # Cấu hình extension
├── popup.html             # Giao diện popup
├── popup.js               # Logic popup
├── content.js             # Script chạy trên trang web
├── content.css            # Style cho highlight
├── background.js          # Background script
├── icons/                 # Icon extension
└── README.md             # Hướng dẫn này
```

## Phím tắt

- **Alt+H**: Highlight từ đã chọn (double-click)

## Lưu ý

- Extension hoạt động trên tất cả trang web
- Dữ liệu được lưu cục bộ trong Chrome storage
- Google Sheets integration cần cấu hình URL sheet
- Extension tự động bật highlight mode khi load

## Phát triển

### Yêu cầu
- Chrome Extension Manifest V3
- JavaScript ES6+
- Chrome Storage API
- Google Sheets API (tùy chọn)

### Cài đặt phát triển
1. Clone repository
2. Mở Chrome Extensions page
3. Enable Developer mode
4. Load unpacked extension
5. Test trên các trang web

## License

MIT License - Sử dụng tự do cho mục đích học tập và cá nhân.