(function () {
  'use strict';
  var people = [
    { id: 'lin', name: '林怡君', email: 'yijun.lin@example.com' },
    { id: 'chen', name: '陳柏翰', email: 'bohan.chen@example.com' },
    { id: 'wang', name: '王思妤', email: 'siyu.wang@example.com' },
    { id: 'zhang', name: '張雅婷', email: 'yating.zhang@example.com' },
    { id: 'huang', name: '黃嘉雯', email: 'jiawen.huang@example.com' },
    { id: 'wu', name: '吳承翰', email: 'chenghan.wu@example.com' },
    { id: 'liu', name: '劉美玲', email: 'meiling.liu@example.com' },
    { id: 'xu', name: '許家豪', email: 'jiahao.xu@example.com' }
  ];
  var units = [
    { code: 'A1', room: '1', type: 'cabinet', layers: 3, x: -1.0, z: -2.9, w: 2, h: 3, d: 1, rotation: 0 },
    { code: 'B1', room: '1', type: 'shelf', layers: 4, x: -4.05, z: -0.8, w: 2.6, h: 2.6, d: .9, rotation: Math.PI / 2 },
    { code: 'A2', room: '1', type: 'box', layers: 0, x: -3.85, z: -.7, y: 1.34, w: .8, h: .55, d: .6, rotation: Math.PI / 2, parent: 'B1', parentLayer: 3 },
    { code: 'B2', room: '1', type: 'cabinet', layers: 2, x: -3.95, z: 2.35, w: 1.5, h: 2, d: .9, rotation: Math.PI / 2 },
    { code: 'A3', room: '1', type: 'drawer', layers: 4, x: 3.1, z: .7, w: 1.8, h: 1.7, d: 1, rotation: 0 },
    { code: 'C1', room: '1', type: 'box', layers: 0, x: .3, z: 2.25, w: 1.1, h: .65, d: .85, rotation: 0 },
    { code: 'D1', room: '2', type: 'cabinet', layers: 3, x: -1.7, z: -2.8, w: 2, h: 2.8, d: 1, rotation: 0 },
    { code: 'D2', room: '2', type: 'shelf', layers: 3, x: -4, z: .25, w: 2.5, h: 2.3, d: 1, rotation: Math.PI / 2 },
    { code: 'D3', room: '2', type: 'drawer', layers: 3, x: 2.2, z: -2.8, w: 2, h: 1.6, d: 1.1, rotation: 0 },
    { code: 'D4', room: '2', type: 'box', layers: 0, x: 1.5, z: 1.8, w: 1.4, h: .75, d: 1, rotation: 0 }
  ];
  function art(ground, drawing) {
    return '<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="96" height="96" fill="' + ground + '"/><g stroke="#14213D" stroke-width="1.4" stroke-linejoin="round">' + drawing + '</g></svg>';
  }
  var items = [
    { id: 'emotion', code: 'A1-1-01', unit: 'A1', layer: 1, name: '情緒圖卡組', total: 4, image: art('#F7E3B5', '<rect x="17" y="23" width="50" height="59" rx="4" fill="#fff" transform="rotate(-8 42 50)"/><rect x="29" y="15" width="50" height="59" rx="4" fill="#fff"/><circle cx="54" cy="40" r="14" fill="#F2C230"/><path d="M47 44q7 7 14 0M48 36h2m8 0h2" fill="none"/><path d="M42 62h24"/>') },
    { id: 'action', code: 'A1-1-02', unit: 'A1', layer: 1, name: '動作圖卡', total: 3, image: art('#CFE3D4', '<rect x="22" y="17" width="52" height="63" rx="4" fill="#fff"/><circle cx="49" cy="33" r="6" fill="#E9C48D"/><path d="m48 40-1 18m-1-13-14 8m15-8 16-7m-16 20-10 13m10-13 12 12" stroke="#3E7D57" stroke-width="4" fill="none"/>') },
    { id: 'oral', code: 'A1-2-01', unit: 'A1', layer: 2, name: '口腔動作評估工具', total: 1, image: art('#DCE4F2', '<rect x="16" y="28" width="64" height="45" rx="6" fill="#fff"/><path d="M21 37h54M28 46v17m12-17v17m12-17v17m12-17v17" stroke="#173F8A" stroke-width="4"/><rect x="39" y="19" width="18" height="9" rx="2" fill="#A6BEDA"/>') },
    { id: 'number', code: 'A1-2-02', unit: 'A1', layer: 2, name: '數字配對卡', total: 6, image: art('#E9D9EF', '<rect x="13" y="20" width="34" height="55" rx="4" fill="#fff" transform="rotate(-8 30 47)"/><rect x="48" y="24" width="33" height="55" rx="4" fill="#FAF3CE"/><path d="M24 37q17-12 15 1 0 4-14 17h17" stroke="#87559C" stroke-width="4" fill="none"/><circle cx="59" cy="43" r="4" fill="#87559C"/><circle cx="71" cy="60" r="4" fill="#87559C"/>') },
    { id: 'sequence', code: 'A1-3-01', unit: 'A1', layer: 3, name: '生活順序圖卡', total: 2, image: art('#F2D7C8', '<rect x="13" y="31" width="28" height="40" rx="3" fill="#fff"/><rect x="35" y="23" width="28" height="40" rx="3" fill="#fff"/><rect x="57" y="15" width="28" height="40" rx="3" fill="#fff"/><path d="M20 50h14m8-8h14m8-8h14" stroke="#BD7653" stroke-width="5"/><path d="M21 59h12m10-8h12m10-8h12"/>') },
    { id: 'tactile', code: 'B1-1-01', unit: 'B1', layer: 1, name: '觸覺球組', total: 6, image: art('#D5E5D5', '<circle cx="33" cy="55" r="20" fill="#78AD85"/><circle cx="64" cy="40" r="19" fill="#E5B45A"/><circle cx="65" cy="69" r="14" fill="#98B7D5"/><path d="M19 48h4m5-8v5m8 1 3-4m2 12h5m-18 9 4-3m25-31 4 3m9 0v5m-4 11h5m-12-9h3m-2 27h4" fill="none"/>') },
    { id: 'balance', code: 'B1-4-01', unit: 'B1', layer: 4, name: '平衡踏石', total: 3, image: art('#D9E7EA', '<path d="m11 64 18-25 21 8 7 24-29 7z" fill="#7AB5B0"/><path d="m46 42 13-22 21 5 8 23-23 8z" fill="#E4B173"/><path d="m16 63 17-12 17 8m2-17 14-9 15 8" fill="none"/>') },
    { id: 'beads', code: 'A2-01', unit: 'A2', layer: 0, name: '串珠訓練組', total: 4, image: art('#F0DDE1', '<path d="M18 25q59 4 52 28T26 73" fill="none" stroke-width="3"/><circle cx="24" cy="28" r="9" fill="#B95E73"/><circle cx="48" cy="33" r="9" fill="#E7B84C"/><circle cx="69" cy="45" r="9" fill="#6FA3A9"/><circle cx="61" cy="67" r="9" fill="#B95E73"/><circle cx="37" cy="74" r="9" fill="#9DAA6B"/>') },
    { id: 'language', code: 'B2-1-01', unit: 'B2', layer: 1, name: '語言理解桌遊', total: 2, image: art('#DCDCF0', '<path d="m17 33 39-12 25 15-40 12z" fill="#A5A0CC"/><path d="M17 33v36l24 12V48z" fill="#C6BEDF"/><path d="m41 48 40-12v36L41 81z" fill="#fff"/><path d="m48 58 25-8m-25 17 18-6" stroke="#7566A0" stroke-width="3"/>') },
    { id: 'scissors', code: 'A3-1-01', unit: 'A3', layer: 1, name: '安全剪刀組', total: 3, image: art('#F3DFB7', '<path d="m33 60 36-39 5 3-24 37m-3-4L23 25l5-5 32 36" fill="#D4DEE5"/><ellipse cx="30" cy="69" rx="13" ry="10" fill="#7CA1B9"/><ellipse cx="64" cy="67" rx="13" ry="10" fill="#7CA1B9"/><circle cx="46" cy="51" r="3" fill="#fff"/>') },
    { id: 'peg', code: 'A3-3-01', unit: 'A3', layer: 3, name: '精細動作插棒板', total: 4, image: art('#DCE8CF', '<path d="m17 44 45-11 19 16-44 16z" fill="#E5C396"/><path d="M17 44v22l20 14V65m0 15 44-15V49" fill="#D3AB7B"/><path d="M29 49V31m17 13V23m16 17V19m7 35V37" stroke-width="8" stroke="#6E99AC"/><path d="m28 69 10 7 33-11" fill="none"/>') },
    { id: 'sand', code: 'C1-01', unit: 'C1', layer: 0, name: '動力沙工具組', total: 2, image: art('#F3E6C8', '<path d="M15 46h64l-8 31H24z" fill="#B6C7DA"/><path d="m23 54 16-13 14 12 10-8 10 12v13H24z" fill="#DBB784"/><path d="m59 21 5 20m-9-24 9-3 4 8-9 3" fill="#CB8171"/><path d="M18 46h61"/>') },
    { id: 'mirror', code: 'C1-02', unit: 'C1', layer: 0, name: '發音練習鏡', total: 1, image: art('#E5DDE7', '<rect x="19" y="13" width="58" height="64" rx="12" fill="#B790A8"/><rect x="25" y="19" width="46" height="50" rx="9" fill="#DFECF0"/><path d="m33 50 23-23m-10 32 17-17" stroke="#fff" stroke-width="4"/><path d="M44 77v9h11v-9" fill="#B790A8"/>') },
    { id: 'puzzle', code: 'D1-1-01', unit: 'D1', layer: 1, name: '幾何拼圖板', total: 2, image: art('#E6D8C6', '<rect x="15" y="22" width="66" height="54" rx="4" fill="#E6C89D"/><circle cx="33" cy="42" r="11" fill="#D79878"/><path d="m55 29 17 27H42z" fill="#7AA798"/><rect x="27" y="58" width="15" height="13" fill="#8CAAC2"/><rect x="53" y="59" width="19" height="10" fill="#D0AC58"/>') },
    { id: 'drum', code: 'D1-3-01', unit: 'D1', layer: 3, name: '節奏樂器組', total: 3, image: art('#EDD8C6', '<path d="M21 42v28q27 17 54 0V42" fill="#AD7B66"/><ellipse cx="48" cy="41" rx="27" ry="14" fill="#F6E8C4"/><path d="M28 49v22m14-17v22m15-22v22m12-27v22" stroke="#F6E8C4"/><path d="m24 16 26 25m24-23L47 43" stroke-width="4"/>') },
    { id: 'hoop', code: 'D2-1-01', unit: 'D2', layer: 1, name: '套圈圈組', total: 5, image: art('#D3E3E7', '<ellipse cx="47" cy="72" rx="29" ry="10" fill="#C5AB81"/><path d="M47 72V26" stroke-width="9" stroke="#C5AB81"/><ellipse cx="42" cy="46" rx="22" ry="9" fill="none" stroke="#B17787" stroke-width="6"/><ellipse cx="53" cy="59" rx="24" ry="9" fill="none" stroke="#638F99" stroke-width="6"/>') },
    { id: 'timer', code: 'D3-2-01', unit: 'D3', layer: 2, name: '視覺計時器', total: 3, image: art('#DDE2ED', '<rect x="20" y="16" width="57" height="65" rx="8" fill="#fff"/><circle cx="49" cy="47" r="22" fill="#E9EDF4"/><path d="M49 47V25a22 22 0 0 1 19 33z" fill="#BE7D7A"/><path d="M49 28v4m19 15h-4M49 65v-4M30 47h4"/><circle cx="49" cy="47" r="3" fill="#14213D"/>') },
    { id: 'parachute', code: 'D4-01', unit: 'D4', layer: 0, name: '團體彩虹傘', total: 1, image: art('#E3DFCC', '<path d="M13 51q35-61 70 0L48 78z" fill="#A0B8A3"/><path d="M13 51 48 19v59z" fill="#D7AD69"/><path d="M48 19v59l35-27z" fill="#9BAFC5"/><path d="m13 51 35 27 35-27M48 19v59" fill="none"/><path d="m10 54 6 6m65-6 5 6M45 79v7" stroke-width="3"/>') }
  ];
  function record(id, itemId, userId, quantity, start, end, picked, returned, status) {
    return { id: id, itemId: itemId, userId: userId, name: people.find(function (p) { return p.id === userId; }).name, quantity: quantity, start: start, reservationStart: start, end: end, picked: picked || 0, returned: returned || 0, cancelled: 0, status: status || (picked ? 'active' : 'reserved') };
  }
  var records = [
    record('r1', 'emotion', 'lin', 2, '2026-11-08', '2026-11-15', 2),
    record('r2', 'emotion', 'chen', 1, '2026-11-01', '2026-11-14', 1),
    record('r3', 'emotion', 'wang', 2, '2026-11-16', '2026-11-24'),
    record('r4', 'emotion', 'huang', 2, '2026-11-17', '2026-11-28'),
    record('r5', 'action', 'lin', 1, '2026-11-10', '2026-11-18', 1),
    record('r6', 'oral', 'zhang', 1, '2026-11-12', '2026-11-15', 1),
    record('r7', 'number', 'lin', 2, '2026-11-15', '2026-11-20'),
    record('r8', 'number', 'xu', 1, '2026-11-11', '2026-11-19', 1),
    record('r9', 'tactile', 'lin', 3, '2026-11-09', '2026-11-17', 3, 1),
    record('r10', 'tactile', 'wang', 1, '2026-11-20', '2026-11-27'),
    record('r11', 'language', 'wu', 2, '2026-11-09', '2026-11-16', 2),
    record('r12', 'language', 'liu', 1, '2026-11-17', '2026-11-24'),
    record('r13', 'peg', 'lin', 2, '2026-11-10', '2026-11-15', 2),
    record('r14', 'peg', 'zhang', 2, '2026-11-17', '2026-11-23'),
    record('r15', 'mirror', 'liu', 1, '2026-11-10', '2026-11-15', 1),
    record('r16', 'puzzle', 'lin', 1, '2026-11-05', '2026-11-18', 1),
    record('r17', 'puzzle', 'xu', 2, '2026-11-19', '2026-11-25'),
    record('r18', 'hoop', 'chen', 2, '2026-11-06', '2026-11-13', 2),
    record('r19', 'hoop', 'lin', 2, '2026-11-18', '2026-11-25'),
    record('r20', 'timer', 'lin', 1, '2026-11-22', '2026-11-27'),
    record('r21', 'sequence', 'lin', 1, '2026-11-12', '2026-11-19'),
    record('r22', 'beads', 'lin', 1, '2026-11-19', '2026-11-23', 0, 0, 'cancelled'),
    record('r23', 'sand', 'lin', 1, '2026-11-01', '2026-11-06', 1, 1, 'returned'),
    record('r24', 'language', 'lin', 1, '2026-11-17', '2026-11-24')
  ];
  var autoCancelled = records.find(function (r) { return r.id === 'r21'; });
  autoCancelled.cancelled = 1;
  autoCancelled.autoCancelled = true;
  autoCancelled.status = 'auto_cancelled';
  records.find(function (r) { return r.id === 'r22'; }).cancelled = 1;
  window.EZData = { today: '2026-11-15', people: people, rooms: [{ id: '1', name: '一樓 治療教室' }, { id: '2', name: '二樓 教具倉庫' }], units: units, items: items, records: records, types: { cabinet: '有門的櫃子', shelf: '開放式層架', drawer: '抽屜櫃', box: '收納箱' } };
}());
