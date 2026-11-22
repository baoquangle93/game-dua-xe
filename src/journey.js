// PHƯỢT XUYÊN VIỆT: hành trình nhiều chặng từ Bắc vào Nam
// - Mỗi chặng là một cuộc đua ngắn (2 vòng). Về top 3 thì được đi tiếp.
// - Thua thì mất 1 lượt thử lại; hết lượt thì hành trình dừng lại, phải đi lại từ đầu.
// - Trạng thái hành trình lưu trong trình duyệt, tải lại trang vẫn còn.

export const JOURNEY = {
  laps: 2,     // số vòng mỗi chặng
  top: 3,      // phải về hạng này hoặc tốt hơn
  retries: 2,  // số lượt thử lại cho cả hành trình

  // Các điểm dừng trên lộ trình. leg = chặng kết thúc tại điểm này; soon = sẽ mở ở bản sau
  stops: [
    { name: 'Hà Nội', note: 'Điểm xuất phát' },
    { name: 'Hạ Long', leg: 0 },
    { name: 'Huế', soon: true },
    { name: 'Hội An', soon: true },
    { name: 'Đà Lạt', leg: 1 },
    { name: 'Sài Gòn', leg: 2 },
    { name: 'Cần Thơ', soon: true },
    { name: 'Cà Mau', soon: true },
  ],

  // Các chặng đua: dùng đường đua nào (stages.js), đối thủ mạnh lên dần
  legs: [
    { from: 'Hà Nội', to: 'Hạ Long', stage: 'ven-bien', skill: 0.94, desc: 'Chạy dọc vịnh biển, đảo đá nhô lên giữa làn nước xanh, hải đăng và thuyền buồm.' },
    { from: 'Hạ Long', to: 'Đà Lạt', stage: 'hoang-hon', skill: 1.0, desc: 'Đồi thông, hồ nước, làng nhỏ và khinh khí cầu lúc chiều tà.' },
    { from: 'Đà Lạt', to: 'Sài Gòn', stage: 'pho-dem', skill: 1.05, desc: 'Thành phố về đêm: nhà cao tầng sáng đèn, biển neon và nhiều khúc cua.' },
  ],
};

const KEY = 'dua-xe-hanh-trinh';
const BEST_KEY = 'dua-xe-ky-luc-xuyen-viet';

export function newJourney() {
  return { leg: 0, retries: JOURNEY.retries, times: [], open: true, over: false, finished: false };
}
export function loadJourney() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
}
export function saveJourney(j) {
  try { localStorage.setItem(KEY, JSON.stringify(j)); } catch (e) { /* trình duyệt chặn lưu */ }
}
export function loadJourneyBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || null; } catch (e) { return null; }
}
export function saveJourneyBest(t) {
  try { localStorage.setItem(BEST_KEY, String(t)); } catch (e) { /* bỏ qua */ }
}
// Hành trình đang đi dở (chưa thua hẳn, chưa về đích)?
export const inProgress = (j) => !!j && !j.over && !j.finished;
