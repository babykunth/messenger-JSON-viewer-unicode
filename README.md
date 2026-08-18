# Facebook Messenger exported JSON viewer

<p align="center">
  <img src="./public/ios/180.png" alt="Messenger Viewer" width="200" height="200">
</p>

## Đây là gì?

Đây là một công cụ đơn giản để xem các tệp JSON được xuất từ Facebook Messenger. Tôi thiết kế giao diện mô phỏng theo Messenger cho vui và để thử nghiệm khả năng của Tailwind CSS. Một lý do khác là tôi muốn thử dùng [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API), khi biết rằng nó có thể dùng để truy cập tệp trong thư mục ngay trên trình duyệt.

## Có gì mới?

- Hỗ trợ giải mã ký tự tiếng Việt Unicode.
- Giao diện hiển thị hỗ trợ English - Tiếng Việt.
- Xem trực tiếp hình ảnh, video ngay trong đoạn chat.
- Cập nhật giao diện tính năng, cột hiển thị toàn bộ và thống kê của đoạn chat đó : Ảnh - Video - Link - Thành viên.
- Hiển thị thời gian của tin nhắn.

## Thêm lỗi :
- Không hỗ trợ định dạng backup tin nhắn cũ là loại bao gồm folder chỉ chứa .json và thư mục con "media"

### Công nghệ sử dụng

- Next.JS + TailwindCSS
- [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)

## Hướng dẫn sử dụng

1. Mở [Công cụ](https://messenger-json-viewer-unicode-1.vercel.app/)
2. Nhấp vào nút và chọn thư mục bạn đã tải về từ Facebook.
3. Chờ vài giây, đôi khi có thể mất một phút để tải.
4. Tada!

Mã nguồn tác giả gốc : https://github.com/Yukaii/messenger-JSON-viewer
