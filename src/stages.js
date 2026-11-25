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
    scale: 2,      // độ lớn đường đua (càng lớn đường càng dài)
    combat: { mines: [[160, -2], [160, 4], [385, 3], [540, -4], [540, 2], [700, 0], [860, -3]], cams: [100, 560], boxes: [70, 330, 600, 905] },
    hazards: {
      coins: [[60, 0, 'line'], [130, 3, 'zigzag'], [232, -3, 'line'], [292, 0, 'cross'], [362, -3, 'line'], [430, 3, 'zigzag'], [512, 0, 'line'], [612, -3, 'cross'], [682, 3, 'line'], [762, 0, 'zigzag'], [872, -3, 'line'], [940, 0, 'line']],
      trucks: [300, 800], buffalo: [245, 620], rocks: [310, 820], potholes: [120, 370, 680, 875],
    },
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
    scale: 2,      // độ lớn đường đua (càng lớn đường càng dài)
    combat: { mines: [[350, -2], [350, 4], [470, -3], [650, 2], [790, -4], [790, 3], [885, 0]], cams: [100, 560], boxes: [70, 280, 625, 905] },
    hazards: {
      coins: [[60, 0, 'line'], [165, -4, 'line'], [240, 0, 'zigzag'], [360, 3, 'line'], [425, 0, 'cross'], [540, -3, 'zigzag'], [635, 0, 'line'], [745, 3, 'line'], [830, 0, 'cross'], [935, -3, 'line']],
      trucks: [200, 700], buffalo: [300], potholes: [170, 480, 690, 880], rain: [[395, 565]],
    },
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
    scale: 2,      // độ lớn đường đua (càng lớn đường càng dài)
    combat: { mines: [[110, -4], [260, 3], [340, 0], [470, 4], [610, -3], [740, 2], [890, -2]], cams: [100, 810], boxes: [70, 300, 565, 905] },
    hazards: {
      coins: [[60, 0, 'line'], [120, 3, 'line'], [240, -3, 'zigzag'], [312, 0, 'line'], [392, 3, 'cross'], [455, -3, 'line'], [525, 0, 'zigzag'], [595, 3, 'line'], [680, 0, 'cross'], [760, -3, 'line'], [870, 3, 'zigzag'], [940, 0, 'line']],
      trucks: [300, 750], train: [185], potholes: [320, 460, 600, 880], rain: [[380, 540]],
    },
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
