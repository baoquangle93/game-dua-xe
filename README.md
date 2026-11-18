# Đường Đua Hoàng Hôn

Game đua xe 3D chạy ngay trên trình duyệt, viết bằng **Three.js** và đóng gói bằng **Vite** (Node.js).
Mọi hình ảnh (xe, đường đua, cây, núi, bầu trời) đều được dựng bằng code, không dùng file mô hình hay hình ảnh bên ngoài.

## Tính năng (bản sơ bộ v0.1)

- Đường đua khép kín lúc hoàng hôn: bó vỉa đỏ trắng, lề cát, tường chắn, cổng xuất phát, khán đài có khán giả
- Ánh sáng và bóng đổ thời gian thực, thân xe sơn bóng phản chiếu bầu trời, hiệu ứng phát sáng (bloom)
- Đường đua dạng bầu dục với các đoạn thẳng dài và vài khúc cua thoải
- Chướng ngại vật: thùng phuy (đâm vào bị bật lại), cọc tiêu (tông đổ được), vũng dầu (trơn trượt), ô mũi tên tăng tốc
- 3 xe đối thủ do máy điều khiển, biết giảm tốc khi vào cua và lách tránh chướng ngại vật
- 3 vòng đua, đếm ngược, đồng hồ, xếp hạng, bản đồ nhỏ, cảnh báo chạy sai hướng
- Drift bằng phanh tay, khói bánh xe, bụi khi chạy ra lề cát
- Tiếng động cơ tổng hợp bằng Web Audio
- Điều khiển bằng bàn phím hoặc nút cảm ứng trên điện thoại
- Lưu kỷ lục thời gian trong trình duyệt

## Chạy trên máy

Cần cài [Node.js](https://nodejs.org) (bản 18 trở lên).

```bash
npm install
npm run dev
```

Mở http://localhost:5173 trong trình duyệt.

Build bản để đưa lên mạng: `npm run build` (kết quả nằm trong thư mục `dist`).

## Đưa lên mạng

Mỗi lần đẩy code lên nhánh `main`, GitHub Actions (`.github/workflows/deploy.yml`) tự build và đăng game lên GitHub Pages.

## Cấu trúc

| File | Nội dung |
|---|---|
| `src/main.js` | Vòng lặp game, vật lý xe, xe đối thủ, camera, HUD |
| `src/track.js` | Hình dạng đường đua, mặt đường, bó vỉa, tường |
| `src/scenery.js` | Bầu trời, ánh sáng, cây, núi, mây, khán đài, cổng xuất phát |
| `src/obstacles.js` | Chướng ngại vật và ô tăng tốc (sửa danh sách `PLAN` để đổi vị trí) |
| `src/car.js` | Mẫu xe 3D |
| `src/effects.js` | Khói và tiếng động cơ |
| `src/input.js` | Bàn phím và nút cảm ứng |
| `src/textures.js` | Hoạ tiết vẽ bằng canvas |
