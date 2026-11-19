# Đường Đua Hoàng Hôn

Game đua xe 3D chạy ngay trên trình duyệt, viết bằng **Three.js** và đóng gói bằng **Vite** (Node.js).
Mọi hình ảnh (xe, đường đua, cây, núi, bầu trời) đều được dựng bằng code, không dùng file mô hình hay hình ảnh bên ngoài.

## Tính năng (v0.4)

- **3 chặng đua**, mỗi chặng một hình dạng đường và một khung cảnh riêng:
  - Đồi Hoàng Hôn: rừng thông, núi tuyết, hồ nước, 2 ngôi làng, khinh khí cầu
  - Biển Xanh: bãi cát, ô dù, người tắm biển, hàng dừa, hải đăng có đèn quay, thuyền buồm
  - Phố Đêm: nhà cao tầng sáng đèn, đèn đường, biển quảng cáo neon, sao và trăng, đèn pha xe
- 5 đối thủ: 3 ô tô và **2 xe máy** (có người lái, nghiêng người khi vào cua)
- Khán giả: khán đài, bục gỗ hai bên đường, cầu vượt; nhảy cổ vũ khi xe chạy ngang qua; người vẫy cờ ở vạch xuất phát
- Kỷ lục được lưu riêng cho từng chặng
- Đường đua khép kín lúc hoàng hôn: bó vỉa đỏ trắng, lề cát, tường chắn, cổng xuất phát, khán đài có khán giả
- Ánh sáng và bóng đổ thời gian thực, thân xe sơn bóng phản chiếu bầu trời, hiệu ứng phát sáng (bloom)
- Đường đua dạng bầu dục với các đoạn thẳng dài và vài khúc cua thoải
- Địa hình lồi lõm: đồi lên xuống, đoạn gồ ghề, 2 dốc nhảy (xe bay lên khi qua dốc đủ nhanh)
- Chướng ngại vật: thùng phuy (đâm vào bị bật lại), cọc tiêu (tông đổ được), vũng dầu (trơn trượt), ô mũi tên tăng tốc
- Xe đối thủ do máy điều khiển, biết giảm tốc khi vào cua và lách tránh chướng ngại vật
- Xe đối thủ chạy theo nhóm: dẫn xa thì chờ, bị bỏ xa thì đuổi theo; 3 mức độ khó Dễ / Vừa / Khó
- Hỗ trợ lái (bật/tắt), chống kẹt và cứu hộ (phím R)
- Đồ hoạ Tự động / Thấp / Vừa / Cao: tự hạ chất lượng nếu máy chạy chậm; vật lý tính theo bước cố định
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
| `src/stages.js` | Các chặng đua: hình dạng đường, đồi, dốc nhảy, vị trí chướng ngại vật |
| `src/scenery.js` | Bầu trời, ánh sáng và cảnh vật của từng chặng |
| `src/people.js` | Khán giả và người vẫy cờ |
| `src/obstacles.js` | Chướng ngại vật và ô tăng tốc |
| `src/car.js` | Mẫu ô tô 3D |
| `src/bike.js` | Mẫu xe máy 3D có người lái |
| `src/effects.js` | Khói và tiếng động cơ |
| `src/input.js` | Bàn phím và nút cảm ứng |
| `src/textures.js` | Hoạ tiết vẽ bằng canvas |
