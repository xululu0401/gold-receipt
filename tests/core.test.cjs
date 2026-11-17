/* 小票上的克价 · 核心测试：node --test tests/core.test.cjs
 * 锚点：tests/ref.json（独立 Python 按文字规则重写 + Fraction，回本线用逐分确认而不是二分，300 组）、默认场景手算、
 *       三块拆账守恒、回本线「最小」的两侧、改法真的重算、边界与非法输入、导出。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const A = require(path.join(__dirname, '..', 'core.js'));
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'ref.json'), 'utf8'));
const D = () => A.defaultState();

test('默认场景：手算读数、标题、说明', () => {
  const o = A.compute(D()); assert.ok(o.ok, JSON.stringify(o.errors));
  const r = o.r;
  /* 手算：30 × 1320 = 39,600 + 工费 380 = 39,980 实付；买时金子值 30 × 1180 = 35,400；今天 30 × 1020 = 30,600；
   * 回收扣 30 × 15 = 450 → 拿回 30,150；亏 9,830 = 4,580 + 4,800 + 450。 */
  assert.deepEqual([r.T, r.M0, r.M1, r.R, r.premium, r.goldMove, r.deduct, r.loss], [3998000, 3540000, 3060000, 3015000, 458000, 480000, 45000, 983000]);
  /* 回本线：30 × g − 450 ≥ 39,980 → g ≥ 1,347.666… → 1,347.67 元/克 */
  assert.equal(r.breakEven, 134767);
  assert.equal(r.perGram, 133267);
  /* 金条：39,980 ÷ 1,188 = 33.653… 克；今天卖 × 1,016 = 34,191.65；回本线 39,980 ÷ 33.653 + 4 = 1,192 */
  assert.equal(r.barR, 3419165); assert.equal(r.barBreakEven, 119200);
  assert.equal(A.headline(o), '足金手镯今天拿去回收，能拿回 30,150 元，比买时付的 39,980 元少 9,830 元（24.6%）。');
  assert.equal(A.explain(o), '付的 39,980 元里，金子本身按买时大盘值 35,400 元，多付的 4,580 元（占 11.5%）是工费和店里的溢价，回收时一分不认。今天大盘比买时低 160 元/克，这 30 克少值 4,800 元。回收每克扣 15 元，又是 450 元。要回本，今天大盘得到 1,347.67 元/克，比现在高 32.1%。');
  assert.equal(A.barText(o), '同样 39,980 元，当时要是买金条（每克比大盘贵 8 元）能买 33.65 克；今天卖（每克扣 4 元）拿回 34,191.65 元，亏 5,788.35 元，回本线 1,192 元/克。比这件多拿回 4,041.65 元（这件的工费和溢价是 4,580 元）。');
});

test('与独立 Python 实现逐组对拍（300 组，含回本线与金条）', () => {
  assert.equal(REF.cases.length, 300);
  const st = REF.stats;
  assert.ok(st.gain >= 30 && st.loss >= 100 && st.premium_neg >= 20 && st.zero_recover >= 3 && st.bar_better >= 30, '样本要覆盖赚/亏/溢价为负/回收为 0：' + JSON.stringify(st));
  for (const c of REF.cases) {
    const o = A.compute(c.state); assert.ok(o.ok, JSON.stringify(o.errors) + JSON.stringify(c.state));
    const got = {}; Object.keys(c.expect).forEach((k) => { got[k] = o.r[k] == null ? null : o.r[k]; });
    assert.deepEqual(got, c.expect, JSON.stringify(c.state));
  }
});

test('三块拆账守恒、值域', () => {
  for (const c of REF.cases.concat([{ state: D() }])) {
    const r = A.compute(c.state).r;
    assert.equal(r.premium + r.goldMove + r.deduct, r.loss);
    assert.equal(r.T - r.R, r.loss);
    assert.ok(r.R >= 0 && r.deduct >= 0 && r.T > 0);
    [r.T, r.M0, r.M1, r.R, r.barR].forEach((x) => assert.ok(Number.isSafeInteger(x)));
  }
});

test('回本线是「最小」：少 1 分就不够，刚好就够；金条同理', () => {
  for (const c of REF.cases.concat([{ state: D() }])) {
    const o = A.compute(c.state), P = o.P, r = o.r;
    if (r.breakEven != null) { assert.ok(A.recover(P, r.breakEven) >= r.T); if (r.breakEven > 1) assert.ok(A.recover(P, r.breakEven - 1) < r.T); }
    if (r.barBreakEven != null) { assert.ok(A.barBack(P, r.T, r.barBreakEven) >= r.T); if (r.barBreakEven > 1) assert.ok(A.barBack(P, r.T, r.barBreakEven - 1) < r.T); }
  }
  /* 回本线落在最低的 1 分：二分要先看下界本身 */
  const z = D(); Object.assign(z, { priceMode: 'fixed', fixed: '1', w: '1000', r: '0' }); assert.equal(A.compute(z).r.breakEven, 1);
  /* 扣费比金子还贵：回收为 0，回本线照样存在（大盘涨上去就够） */
  const s = D(); s.r = '1000'; s.g1 = '900'; const o = A.compute(s); /* 30 × 900 = 27,000 < 扣 30,000 */ assert.equal(o.r.R, 0); assert.ok(o.r.clipped);
  assert.ok(A.explain(o).indexOf('比金子本身还多，回收价按 0 算') > 0);
  /* 上界：到 10 万元/克也回不了本 → null，不给回本线改法 */
  const t = D(); t.w = '0.01'; t.rho = '1'; t.r = '1000'; const ot = A.compute(t); assert.equal(ot.r.breakEven, null);
  assert.ok(!ot.actions.some((a) => a.kind === 'breakeven')); assert.ok(A.explain(ot).endsWith('大盘涨到 10 万元/克也回不了本。'));
});

test('改法：每条都真的改输入重算，按钮里的数字和应用后一致', () => {
  const o = A.compute(D());
  assert.deepEqual(o.actions.map((a) => a.text), [
    '把「今天大盘价」改成回本线 1,347.67 元/克（比今天高 32.1%）：回收刚好够 39,980 元。只是一条线，不是预测',
    '要是当时赶上免工费：今天卖亏 9,830 元 → 亏 9,450 元',
    '要是店内克价就按当时大盘 1,180 元：今天卖亏 9,830 元 → 亏 5,630 元']);
  for (const a of o.actions) {
    const o2 = A.compute(A.applyChange(D(), a.ch)); assert.ok(o2.ok, a.id);
    if (a.kind === 'breakeven') { assert.ok(o2.r.loss <= 0); assert.equal(o2.r.breakEven, A.compute(D()).r.breakEven); }
    else assert.equal(o2.r.loss, a.loss);
    assert.ok(o2.r.loss < o.r.loss);
  }
  let k = 0;
  for (const c of REF.cases) {
    const oc = A.compute(c.state);
    for (const a of oc.actions) { k++; const o2 = A.compute(A.applyChange(c.state, a.ch)); assert.ok(o2.ok && o2.r.loss < oc.r.loss, JSON.stringify(c.state) + a.text); if (a.kind === 'breakeven') assert.ok(o2.r.loss <= 0); }
    if (oc.r.loss <= 0) assert.equal(oc.actions.filter((a) => a.kind === 'breakeven').length, 0);
  }
  assert.ok(k >= 200, '改法样本 ' + k);
  const d = D(); A.applyChange(d, { g1: '1' }); assert.equal(d.g1, '1020');
});

test('赚了与持平：措辞；不预测', () => {
  const s = D(); s.g1 = '1380'; const o = A.compute(s);
  /* 30 × 1380 − 450 = 40,950 拿回；比实付 39,980 多 970 */
  assert.equal(o.r.R, 4095000); assert.equal(o.r.loss, -97000);
  assert.equal(A.headline(o), '足金手镯今天拿去回收，能拿回 40,950 元，比买时付的 39,980 元多 970 元。');
  assert.ok(A.headline(o).indexOf('多 ') > 0 && A.headline(o).endsWith('元。'));
  assert.equal(o.actions.filter((a) => a.kind === 'breakeven').length, 0);
  assert.ok(A.explain(o).indexOf('今天大盘比买时高 200 元/克，这 30 克多值 6,000 元') > 0);
  const t = D(); t.g1 = '1180'; assert.ok(A.explain(A.compute(t)).indexOf('今天大盘和买时一样，金价这一行是 0') > 0);
  /* 刚好持平：一口价 = 回收价 */
  const u = D(); u.priceMode = 'fixed'; u.fixed = '30150'; const ou = A.compute(u); assert.equal(ou.r.loss, 0); assert.ok(A.headline(ou).endsWith('正好是买时付的钱。'));
  /* 买得比金子本身还便宜：溢价为负 */
  const v = D(); v.p = '1100'; v.fee = '0'; const ov = A.compute(v); assert.ok(ov.r.premium < 0); assert.ok(A.explain(ov).indexOf('反而比金子本身少付了 2,400 元') > 0);
  assert.ok(!ov.actions.some((a) => a.kind === 'price'));
  const z = D(); z.p = '1180'; z.fee = '0'; assert.ok(A.explain(A.compute(z)).indexOf('值 35,400 元，一分没多付。') > 0, '溢价正好为 0');
  for (const c of REF.cases.concat([{ state: D() }])) { const oc = A.compute(c.state); const t2 = A.headline(oc) + A.explain(oc) + A.barText(oc) + oc.actions.map((a) => a.text).join(''); assert.ok(!/会涨|会跌|建议(买|卖)|预计/.test(t2), t2); }
});

test('计价方式：按克 / 工费按克 / 一口价 / 优惠 / 成色', () => {
  const s = D(); s.feeMode = 'gram'; s.fee = '20'; assert.equal(A.compute(s).r.T, 3960000 + 60000);
  const t = D(); t.priceMode = 'fixed'; t.fixed = '2999'; t.w = '5.2'; t.rho = '75'; const ot = A.compute(t);
  assert.equal(ot.r.T, 299900); assert.equal(ot.r.M0, 460200); assert.equal(ot.r.R, 390000); /* 5.2 × 0.75 × 1180 = 4602；× 1020 = 3978；扣 5.2 × 15 = 78 → 3900 */
  assert.ok(!ot.actions.some((a) => a.kind === 'fee' || a.kind === 'price'));
  const u = D(); u.disc = '980'; assert.equal(A.compute(u).r.T, 3900000);
  const w = D(); w.w = '1.235'; assert.equal(A.compute(w).errors[0].field, 'w');
  /* 小数克重的分摊：每行四舍五入到分 */
  const x = D(); x.w = '3.33'; x.p = '1199.99'; x.fee = '0'; assert.equal(A.compute(x).r.T, Math.round(333 * 119999 / 100));
  assert.equal(A.receiptLines(A.compute(D())).map((l) => l[0]).join(), '金料,工费,实付');
  assert.equal(A.receiptLines(A.compute(u)).map((l) => l[0]).join(), '金料,工费,优惠,实付');
});

test('非法输入：逐项报错；全角与千分位能认', () => {
  const s = D(); s.w = '0'; s.rho = '101'; s.p = 'abc'; s.g1 = '-5'; s.r = '';
  const o = A.compute(s); assert.equal(o.ok, false);
  assert.deepEqual(o.errors.map((e) => e.field).sort(), ['g1', 'p', 'r', 'rho', 'w']);
  const t = D(); t.disc = '39980'; assert.deepEqual(A.compute(t).errors.map((e) => e.field), ['disc']);
  assert.ok(A.compute(t).errors[0].message.indexOf('要比优惠前的 39,980 元少') > 0);
  const t2 = D(); t2.disc = '39979.99'; const o2 = A.compute(t2); assert.ok(o2.ok); assert.ok(!o2.actions.some((a) => a.kind === 'fee' || a.kind === 'price'), '免工费/降克价后优惠比价钱大：不给这两条改法');
  const u = D(); u.p = '１,３２０'; u.w = '３０'; assert.ok(A.compute(u).ok); assert.equal(A.compute(u).r.T, 3998000);
  const v = D(); v.priceMode = 'fixed'; v.fixed = ''; assert.deepEqual(A.compute(v).errors.map((e) => e.field), ['fixed']);
  const v2 = D(); v2.priceMode = 'fixed'; v2.fixed = '5000'; v2.p = 'abc'; assert.ok(A.compute(v2).ok, '一口价时不校验克价');
  assert.equal(A.parse(Object.assign(D(), { priceMode: 'x', feeMode: 'y' })).P.priceMode, 'gram');
  assert.equal(A.parse(Object.assign(D(), { name: '   ' })).P.name, '这件金饰');
  assert.equal(A.parse(Object.assign(D(), { name: '一二三四五六七八九十甲乙丙' })).P.name.length, 12);
});

test('极值：1000 克 × 5000 元/克、上限一口价，整数不溢出', () => {
  const s = D(); Object.assign(s, { w: '1000', p: '5000', fee: '100000', g0: '5000', g1: '5000', r: '1000', b: '1000', rb: '1000', disc: '0' });
  const o = A.compute(s); assert.ok(o.ok); const r = o.r;
  assert.equal(r.T, 500000000 + 10000000);
  [r.T, r.M0, r.M1, r.R, r.barR, r.breakEven, r.barBreakEven].forEach((x) => assert.ok(Number.isSafeInteger(x), String(x)));
  const t = D(); t.priceMode = 'fixed'; t.fixed = '5000000'; t.w = '0.01'; t.g0 = '1'; t.b = '0'; t.g1 = '5000'; t.rb = '0';
  const ot = A.compute(t); assert.ok(ot.ok); assert.ok(Number.isSafeInteger(ot.r.barR)); assert.equal(ot.r.barR, 500000000 * 5000);
  assert.equal(A.yuan(195020), '1,950.20'); assert.equal(A.yuan(5), '0.05'); assert.equal(A.yuan(-150), '-1.50'); assert.equal(A.yuan(200000), '2,000');
  assert.equal(A.pct(0.0004), '不到 0.1%'); assert.equal(A.pct(0.2458), '24.6%');
});

test('对照表：今天那一档等于主读数，回本线那一档刚好不亏，按价递增', () => {
  for (const c of REF.cases.concat([{ state: D() }])) {
    const o = A.compute(c.state), L = o.ladder;
    const now = L.filter((x) => x.d === 0 && !x.be)[0]; assert.equal(now.R, o.r.R); assert.equal(now.barR, o.r.barR);
    for (let i = 1; i < L.length; i++) { assert.ok(L[i].g >= L[i - 1].g); assert.ok(L[i].R >= L[i - 1].R); }
    const be = L.filter((x) => x.be)[0]; if (be) assert.ok(be.loss <= 0);
  }
  assert.equal(A.compute(D()).ladder.length, 8);
});

test('导出：CSV 防公式注入与行数、MD 含拆账表', () => {
  const s = D(); s.name = '=1+2';
  const csv = A.toCSV(A.compute(s), '2026-11-17 22:00');
  assert.ok(csv.indexOf("名字,'=1+2,") > 0, csv);
  assert.equal(csv.split('\r\n').filter(Boolean).length, 2 + 3 + 9);
  assert.ok(csv.indexOf('差额,实付 − 回收,9830.00') > 0);
  const md = A.toMD(A.compute(D()), 'w');
  assert.ok(md.indexOf('| 工费和溢价 | 4,580 |') > 0 && md.indexOf('| 合计 | 9,830 |') > 0 && md.indexOf('虚构示例') > 0 && md.indexOf('| 实付 | 合 1,332.67 元/克 | 39,980 |') > 0, md);
});
