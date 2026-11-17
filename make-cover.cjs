/* 封面 cover.svg（1200×1200），读数与条形来自 core.js 同一次 compute；再用浏览器截成 cover.png。 */
const fs = require('node:fs');
const A = require('./core.js');
const o = A.compute(A.defaultState()), r = o.r;
if (!o.ok || r.loss !== 983000) throw new Error('默认场景不对');
const F = "-apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
const mx = Math.max(r.T, r.M0, r.M1), x0 = 330, W = 560;
const rows = [['实付', 0, r.T, '#23201a', A.yuan(r.T)], ['工费和溢价', r.M0, r.T, '#b98a2e', '−' + A.yuan(r.premium)], ['金价变动', r.M1, r.M0, '#c9725f', '−' + A.yuan(r.goldMove)], ['回收扣', r.R, r.M1, '#9a948a', '−' + A.yuan(r.deduct)], ['拿回', 0, r.R, '#2f6b4f', A.yuan(r.R)]];
let bars = '';
rows.forEach(([n, a, b, c, v], i) => {
  const y = 470 + i * 78;
  bars += `<text x="140" y="${y + 36}" font-family="${F}" font-size="34" fill="#545046">${n}</text><rect x="${x0}" y="${y}" width="${W}" height="48" fill="#f6f2e9"/><rect x="${x0 + a / mx * W}" y="${y}" width="${Math.max(4, (b - a) / mx * W)}" height="48" fill="${c}"/><text x="1060" y="${y + 37}" text-anchor="end" font-family="${F}" font-size="34" font-weight="700" fill="#23201a">${v}</text>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#efece6"/>
  <rect x="60" y="60" width="1080" height="1080" rx="18" fill="#fffdf8"/>
  <text x="140" y="215" font-family="${F}" font-size="120" font-weight="800" fill="#23201a">小票上的克价</text>
  <text x="140" y="295" font-family="${F}" font-size="40" fill="#545046">金饰今天回收能拿回多少，差的钱在哪</text>
  <text x="140" y="400" font-family="${F}" font-size="30" fill="#8a8478">30 克足金手镯：付 ${A.yuan(r.T)} 元，今天回收拿回 ${A.yuan(r.R)} 元</text>
  ${bars}
  <text x="140" y="935" font-family="${F}" font-size="32" fill="#7d5512">今天大盘要到 ${A.yuan(r.breakEven)} 元/克，回收才够本</text>
  <text x="140" y="1095" font-family="${F}" font-size="24" fill="#8a8478">只算账，不预测金价 · 克重与价格为虚构示例</text>
</svg>`;
fs.writeFileSync('cover.svg', svg);
fs.writeFileSync('/tmp/cover98.html', '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body>' + svg + '</body></html>');
console.log('cover.svg', svg.length);
