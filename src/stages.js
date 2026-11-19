// Các chặng đua: hình dạng đường, độ cao, chướng ngại vật và kiểu cảnh vật
// - control: các điểm điều khiển (x, z) của đường, sẽ được nhân 1.5 lần
// - hills: các lớp đồi [độ cao, tần số, lệch pha]
// - rough: các điểm có gờ gồ ghề; jumps: dốc nhảy [vị trí, độ cao]
// - plan: chướng ngại vật (i = điểm dọc đường 0..999, lat = lệch ngang, mặt đường từ -8 tới 8)
// - theme: kiểu cảnh vật (xem scenery.js)

export const STAGES = {
  'hoang-hon': {
    name: 'Đồi Hoàng Hôn',
    desc: 'Rừng thông, núi tuyết, làng nhỏ và khinh khí cầu lúc chiều tà. Đường dễ, hợp để làm quen.',
    banner: 'ĐỒI HOÀNG HÔN',
    theme: 'sunset',
    control: [[-60, 0], [200, 0], [290, 50], [300, 170], [230, 250], [60, 260], [-100, 240], [-170, 160], [-160, 50]],
    hills: [[4.5, 4, 0], [2.5, 10, 1.3]],
    rough: [168, 176, 184, 192],
    jumps: [[475, 3.0], [735, 2.6]],
    plan: [
      { i: 90, type: 'cones', lat: -3.5 },
      { i: 150, type: 'boost', lat: 3 },
      { i: 215, type: 'barrels', lat: 4.3 },
      { i: 275, type: 'oil', lat: -3 },
      { i: 340, type: 'cones', lat: 3.5 },
      { i: 400, type: 'barrels', lat: -4.3 },
      { i: 455, type: 'boost', lat: 0 },
      { i: 530, type: 'oil', lat: 3.5 },
      { i: 590, type: 'barrels', lat: 0 },
      { i: 650, type: 'cones', lat: -3.5 },
      { i: 712, type: 'boost', lat: 0 },
      { i: 790, type: 'oil', lat: -4 },
      { i: 845, type: 'barrels', lat: 4 },
      { i: 900, type: 'cones', lat: 3 },
    ],
  },

  'ven-bien': {
    name: 'Biển Xanh',
    desc: 'Chạy dọc bờ biển giữa trưa: hàng dừa, ô dù, hải đăng và thuyền buồm. Đường dài, nhiều dốc nhỏ.',
    banner: 'ĐƯỜNG ĐUA BIỂN XANH',
    theme: 'beach',
    control: [[-80, 0], [240, 0], [330, 45], [355, 150], [300, 225], [190, 235], [90, 265], [-30, 295], [-150, 260], [-195, 150], [-170, 45]],
    hills: [[3, 6, 0.5], [1.6, 14, 2]],
    rough: [760, 768, 776, 784],
    jumps: [[215, 2.8], [600, 3.0]],
    plan: [
      { i: 90, type: 'cones', lat: -3.5 },
      { i: 145, type: 'oil', lat: 3 },
      { i: 195, type: 'boost', lat: 0 },
      { i: 270, type: 'barrels', lat: -4.3 },
      { i: 330, type: 'boost', lat: 3 },
      { i: 390, type: 'cones', lat: 3.5 },
      { i: 450, type: 'oil', lat: -3.5 },
      { i: 510, type: 'barrels', lat: 4 },
      { i: 580, type: 'boost', lat: 0 },
      { i: 660, type: 'cones', lat: -3 },
      { i: 715, type: 'barrels', lat: 0 },
      { i: 810, type: 'oil', lat: 3.5 },
      { i: 855, type: 'boost', lat: -3 },
      { i: 905, type: 'cones', lat: 3 },
    ],
  },

  'pho-dem': {
    name: 'Phố Đêm',
    desc: 'Đua giữa thành phố về đêm: nhà cao tầng sáng đèn, đèn đường và biển quảng cáo neon. Nhiều khúc cua nhất.',
    banner: 'ĐƯỜNG ĐUA PHỐ ĐÊM',
    theme: 'night',
    control: [[-90, 0], [200, 0], [285, 45], [305, 150], [255, 215], [150, 225], [80, 275], [40, 345], [-60, 370], [-160, 330], [-200, 240], [-180, 80]],
    hills: [[2, 2, 0], [1.2, 8, 0.7]],
    rough: [720, 728, 736, 744],
    jumps: [[650, 2.6], [845, 2.8]],
    plan: [
      { i: 90, type: 'barrels', lat: 4.3 },
      { i: 150, type: 'boost', lat: -3 },
      { i: 210, type: 'cones', lat: 3.5 },
      { i: 280, type: 'oil', lat: -3 },
      { i: 350, type: 'barrels', lat: -4.3 },
      { i: 420, type: 'cones', lat: 3 },
      { i: 490, type: 'boost', lat: 3 },
      { i: 560, type: 'oil', lat: 3.5 },
      { i: 630, type: 'boost', lat: 0 },
      { i: 700, type: 'barrels', lat: -4.3 },
      { i: 780, type: 'cones', lat: 3 },
      { i: 825, type: 'boost', lat: 0 },
      { i: 905, type: 'oil', lat: -3.5 },
    ],
  },
};

export const STAGE_IDS = Object.keys(STAGES);
