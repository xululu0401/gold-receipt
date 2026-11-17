/* 小票上的克价 · 计算核心（core.js）
 * 问题：一件金饰（手镯、戒指、吊坠）买的时候付了多少，今天拿去回收能拿回多少，差的钱是哪几块：
 *       工费和店里的溢价、金价跌了、回收扣的手续费；大盘回到多少回收才够本；同样的钱当时买金条会怎样。
 * 模型（设计选择，页面「怎么算的」写明）：
 *   - 付的钱 T：按克计价 = 克重 × 店内克价 + 工费（按件，或按克 × 克重）− 优惠；一口价 = 一口价 − 优惠。每行四舍五入到分。
 *   - 金子本身值多少 = 克重 × 成色 × 大盘价（成色：足金按 100%，18K 填 75）。
 *   - 回收拿回 R = 克重 × 成色 × 今天大盘 − 克重 × 每克回收扣费，最少 0。
 *   - 亏的钱 T − R 恰好拆成三行：溢价（T − 当时金子值）+ 金价变动（当时金子值 − 今天金子值）+ 回收扣（今天金子值 − R）。
 *   - 回本线：让 R ≥ T 的最低今天大盘价（精确到分，逐分二分）。只是一条线，不预测金价会不会到。
 *   - 金条对照：同样 T 元当时买金条（每克比大盘贵 b），今天卖（每克扣 rb）。克数不取整，拿回 = T × (今天大盘 − rb) ÷ (当时大盘 + b)。
 *   - 金额全部用整数计算：克重以 0.01 克、价格以分、成色以千分之一为单位，乘完再一次性四舍五入到分。 */
(function (root) {
  'use strict';
  var MAX_W = 1000, MAX_G = 5000, MAX_FIX = 5000000, UP = 10000000; /* UP：回本线最多往上找到 10 万元/克（分）；上限保证所有整数乘积 < 2^53 */

  function defaultState() {
    return {
      name: '足金手镯', w: '30', rho: '100', priceMode: 'gram', p: '1320', feeMode: 'piece', fee: '380', fixed: '', disc: '0',
      g0: '1180', g1: '1020', r: '15', b: '8', rb: '4'
    };
  }

  function half(s) { return String(s == null ? '' : s).replace(/[\uFF01-\uFF5E]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); }).replace(/\u3000/g, ' ').replace(/[,，\s]/g, ''); }
  function num(s) { s = half(s).replace(/。/g, '.'); if (/^\d+(\.\d+)?$/.test(s)) return Number(s); if (/^-\d+(\.\d+)?$/.test(s)) return Number(s); return NaN; }
  /* 正整数 n 除以正整数 d，四舍五入（n ≥ 0） */
  function rdiv(n, d) { return Math.floor((n + Math.floor(d / 2)) / d); }

  function parse(st) {
    var errs = [], P = {};
    st = st && typeof st === 'object' ? st : {};
    function need(v, f, lo, hi, dp, msg) {
      var x = num(v);
      if (!isFinite(x)) { errs.push({ field: f, message: msg + '：要填数字' }); return NaN; }
      if (x < lo || x > hi) { errs.push({ field: f, message: msg + '：要在 ' + fmt(lo, dp) + '–' + fmt(hi, dp) + ' 之间' }); return NaN; }
      var sc = Math.pow(10, dp);
      if (Math.abs(Math.round(x * sc) - x * sc) > 1e-6) { errs.push({ field: f, message: msg + '：最多 ' + dp + ' 位小数' }); return NaN; }
      return Math.round(x * sc);
    }
    P.name = String(st.name == null ? '' : st.name).slice(0, 12).trim() || '这件金饰';
    P.priceMode = st.priceMode === 'fixed' ? 'fixed' : 'gram';
    P.feeMode = st.feeMode === 'gram' ? 'gram' : 'piece';
    P.w = need(st.w, 'w', 0.01, MAX_W, 2, '克重');                 /* 0.01 克 */
    P.rho = need(st.rho, 'rho', 1, 100, 1, '成色');                 /* 千分之一 */
    if (P.priceMode === 'gram') {
      P.p = need(st.p, 'p', 1, MAX_G, 2, '店内克价');               /* 分/克 */
      P.fee = need(st.fee, 'fee', 0, P.feeMode === 'piece' ? 100000 : 5000, 2, P.feeMode === 'piece' ? '工费（按件）' : '工费（每克）');
    } else {
      P.fixed = need(st.fixed, 'fixed', 1, MAX_FIX, 2, '一口价');     /* 分 */
    }
    P.disc = need(st.disc, 'disc', 0, MAX_FIX, 2, '优惠');
    P.g0 = need(st.g0, 'g0', 1, MAX_G, 2, '买时大盘价');
    P.g1 = need(st.g1, 'g1', 1, MAX_G, 2, '今天大盘价');
    P.r = need(st.r, 'r', 0, 1000, 2, '回收每克扣');
    P.b = need(st.b, 'b', 0, 1000, 2, '金条每克比大盘贵');
    P.rb = need(st.rb, 'rb', 0, 1000, 2, '金条回收每克扣');
    if (!errs.length) {
      var g = gross(P);
      if (P.disc >= g) { errs.push({ field: 'disc', message: '优惠：要比优惠前的 ' + yuan(g) + ' 元少' }); P.disc = NaN; }
    }
    return { P: P, errors: errs };
  }

  /* 优惠前的价钱（分） */
  function gross(P) {
    if (P.priceMode === 'fixed') return P.fixed;
    var goldPart = rdiv(P.w * P.p, 100);
    var fee = P.feeMode === 'piece' ? P.fee : rdiv(P.w * P.fee, 100);
    return goldPart + fee;
  }
  function goldValue(P, g) { return rdiv(P.w * P.rho * g, 100000); }        /* 克重 × 成色 × 大盘价，分 */
  function recover(P, g) { var ded = rdiv(P.w * P.r, 100); return Math.max(0, goldValue(P, g) - ded); }
  function barBack(P, T, g) { var x = g - P.rb; if (x <= 0) return 0; var d = BigInt(P.g0 + P.b); return Number((BigInt(T) * BigInt(x) * 2n + d) / (2n * d)); } /* T·x 可到 1e16，用 BigInt 精确四舍五入 */
  /* 最小的分 g（1..UP）使 f(g) ≥ T；f 单调不减。到不了返回 null。 */
  function lowest(f, T) {
    if (f(UP) < T) return null;
    var lo = 1, hi = UP;
    if (f(lo) >= T) return lo;
    while (hi - lo > 1) { var mid = Math.floor((lo + hi) / 2); if (f(mid) >= T) hi = mid; else lo = mid; }
    return hi;
  }

  function evaluate(P) {
    var g = gross(P), T = g - P.disc;
    var M0 = goldValue(P, P.g0), M1 = goldValue(P, P.g1), R = recover(P, P.g1);
    var o = {
      gross: g, T: T, perGram: rdiv(T * 100, P.w), M0: M0, M1: M1, R: R,
      premium: T - M0, goldMove: M0 - M1, deduct: M1 - R, loss: T - R,
      lossPct: (T - R) / T, clipped: R === 0 && M1 - rdiv(P.w * P.r, 100) < 0
    };
    o.breakEven = lowest(function (x) { return recover(P, x); }, T);
    o.barGrams = T / (P.g0 + P.b);                            /* 克（分 ÷ 分/克，不取整，只用于显示） */
    o.barR = barBack(P, T, P.g1); o.barLoss = T - o.barR;
    o.barBreakEven = lowest(function (x) { return barBack(P, T, x); }, T);
    return o;
  }

  /* 大盘到多少拿回多少：今天大盘的 -20%…+40%（每 10% 一档）加上回本线，按价排序；不预测哪个会发生 */
  function ladder(P, r) {
    var xs = [-20, -10, 0, 10, 20, 30, 40].map(function (d) { return { d: d, g: rdiv(P.g1 * (100 + d), 100) }; });
    if (r.breakEven != null && r.breakEven <= MAX_G * 100 && !xs.some(function (x) { return x.g === r.breakEven; })) xs.push({ d: null, g: r.breakEven, be: true });
    xs.sort(function (a, b) { return a.g - b.g; });
    return xs.map(function (x) { var R = recover(P, x.g), B = barBack(P, r.T, x.g); return { d: x.d, be: !!x.be, g: x.g, R: R, loss: r.T - R, barR: B, barLoss: r.T - B }; });
  }

  function applyChange(st, ch) { var s = JSON.parse(JSON.stringify(st)); Object.keys(ch).forEach(function (k) { s[k] = ch[k]; }); return s; }
  function cents(x) { return (x / 100).toFixed(2).replace(/\.?0+$/, ''); }

  function compute(st) {
    var pr = parse(st);
    if (pr.errors.length) return { ok: false, errors: pr.errors, P: pr.P };
    var P = pr.P, e = evaluate(P), acts = [];
    if (e.loss > 0 && e.breakEven != null && e.breakEven <= MAX_G * 100) {
      acts.push({ id: 'actBE', kind: 'breakeven', ch: { g1: cents(e.breakEven) }, loss: 0,
        text: '把「今天大盘价」改成回本线 ' + yuan(e.breakEven) + ' 元/克（比今天高 ' + pct((e.breakEven - P.g1) / P.g1) + '）：回收刚好够 ' + yuan(e.T) + ' 元。只是一条线，不是预测' });
    }
    if (P.priceMode === 'gram' && P.fee > 0) {
      var p1 = parse(applyChange(st, { fee: '0' })), e1 = p1.errors.length ? null : evaluate(p1.P); /* 免工费后优惠可能比价钱还大 → 不给 */
      if (e1) acts.push({ id: 'actFee', kind: 'fee', ch: { fee: '0' }, loss: e1.loss, text: '要是当时赶上免工费：今天卖' + lossWord(e.loss) + ' → ' + lossWord(e1.loss) });
    }
    if (P.priceMode === 'gram') {
      var ch2 = { p: cents(P.g0) }, s2 = applyChange(st, ch2), p2 = parse(s2);
      if (!p2.errors.length) { var e2 = evaluate(p2.P); if (e2.loss < e.loss) acts.push({ id: 'actPrice', kind: 'price', ch: ch2, loss: e2.loss, text: '要是店内克价就按当时大盘 ' + yuan(P.g0) + ' 元：今天卖' + lossWord(e.loss) + ' → ' + lossWord(e2.loss) }); }
    }
    return { ok: true, P: P, r: e, actions: acts, ladder: ladder(P, e) };
  }

  function lossWord(x) { return x > 0 ? '亏 ' + yuan(x) + ' 元' : x < 0 ? '多拿回 ' + yuan(-x) + ' 元' : '不亏不赚'; }
  function pct(x) { var v = Math.round(x * 1000) / 10; return (v === 0 && x !== 0 ? (x > 0 ? '不到 0.1' : '-0.1 以内') : fmt(v, 1)) + '%'; }
  function fmt(x, d) { d = d == null ? 2 : d; var s = Number(x).toFixed(d).replace(/\.?0+$/, ''); var a = s.split('.'); a[0] = a[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); return a.join('.'); }
  /* 分 → 「1,234.5」形式：整元不带小数，否则两位 */
  function yuan(f) { var neg = f < 0; f = Math.abs(f); var y = Math.floor(f / 100), c = f % 100; var s = String(y).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (c ? '.' + (c < 10 ? '0' : '') + c : ''); return (neg ? '-' : '') + s; }
  function grams(P) { return fmt(P.w / 100, 2); }
  function rhoText(P) { return fmt(P.rho / 10, 1) + '%'; }

  function headline(o) {
    var r = o.r, P = o.P;
    var lead = P.name + '今天拿去回收，能拿回 ' + yuan(r.R) + ' 元';
    if (r.loss > 0) return lead + '，比买时付的 ' + yuan(r.T) + ' 元少 ' + yuan(r.loss) + ' 元（' + pct(r.lossPct) + '）。';
    if (r.loss < 0) return lead + '，比买时付的 ' + yuan(r.T) + ' 元多 ' + yuan(-r.loss) + ' 元。';
    return lead + '，正好是买时付的钱。';
  }
  function moveText(P, r) {
    var d = P.g1 - P.g0;
    if (d === 0) return '今天大盘和买时一样，金价这一行是 0';
    return '今天大盘比买时' + (d < 0 ? '低 ' : '高 ') + yuan(Math.abs(d)) + ' 元/克，这 ' + grams(P) + ' 克' + (P.rho < 1000 ? '（按 ' + rhoText(P) + ' 成色）' : '') + (d < 0 ? '少值 ' : '多值 ') + yuan(Math.abs(r.goldMove)) + ' 元';
  }
  function explain(o) {
    var r = o.r, P = o.P, s = '';
    s += '付的 ' + yuan(r.T) + ' 元里，金子本身按买时大盘值 ' + yuan(r.M0) + ' 元，';
    s += r.premium === 0 ? '一分没多付。' : r.premium > 0 ? '多付的 ' + yuan(r.premium) + ' 元（占 ' + pct(r.premium / r.T) + '）是工费和店里的溢价，回收时一分不认。' : '反而比金子本身少付了 ' + yuan(-r.premium) + ' 元。';
    s += moveText(P, r) + '。';
    s += r.clipped ? '回收每克扣 ' + yuan(P.r) + ' 元比金子本身还多，回收价按 0 算。' : '回收每克扣 ' + yuan(P.r) + ' 元，又是 ' + yuan(r.deduct) + ' 元。';
    if (r.breakEven == null) s += '大盘涨到 10 万元/克也回不了本。';
    else if (r.loss > 0) s += '要回本，今天大盘得到 ' + yuan(r.breakEven) + ' 元/克，比现在高 ' + pct((r.breakEven - P.g1) / P.g1) + '。';
    return s;
  }
  function barText(o) {
    var r = o.r, P = o.P;
    return '同样 ' + yuan(r.T) + ' 元，当时要是买金条（每克比大盘贵 ' + yuan(P.b) + ' 元）能买 ' + fmt(r.barGrams, 2) + ' 克；今天卖（每克扣 ' + yuan(P.rb) + ' 元）拿回 ' + yuan(r.barR) + ' 元，' + lossWord(r.barLoss) + (r.barBreakEven != null ? '，回本线 ' + yuan(r.barBreakEven) + ' 元/克' : '') + '。' +
      (r.barR > r.R ? '比这件多拿回 ' + yuan(r.barR - r.R) + ' 元' : r.barR < r.R ? '比这件少拿回 ' + yuan(r.R - r.barR) + ' 元' : '和这件拿回的一样') +
      (r.premium > 0 ? '（这件的工费和溢价是 ' + yuan(r.premium) + ' 元）。' : '。');
  }

  function receiptLines(o) {
    var P = o.P, r = o.r, L = [];
    if (P.priceMode === 'gram') {
      L.push(['金料', grams(P) + ' 克 × ' + yuan(P.p) + ' 元/克', rdiv(P.w * P.p, 100)]);
      L.push(['工费', P.feeMode === 'piece' ? '按件' : grams(P) + ' 克 × ' + yuan(P.fee) + ' 元/克', P.feeMode === 'piece' ? P.fee : rdiv(P.w * P.fee, 100)]);
    } else L.push(['一口价', '', P.fixed]);
    if (P.disc) L.push(['优惠', '', -P.disc]);
    L.push(['实付', '合 ' + yuan(r.perGram) + ' 元/克', r.T]);
    return L;
  }

  function csvCell(v) { var x = String(v); if (/^[=+\-@]/.test(x)) x = "'" + x; return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }
  function row(a) { return a.map(csvCell).join(','); }
  function toCSV(o, when) {
    var P = o.P, r = o.r, L = [];
    L.push(row(['小票上的克价', '导出时间', when]));
    L.push(row(['项目', '说明', '金额（元）']));
    receiptLines(o).forEach(function (x) { L.push(row([x[0], x[1], (x[2] / 100).toFixed(2)])); });
    L.push(row(['今天回收拿回', grams(P) + ' 克 × ' + rhoText(P) + ' × ' + yuan(P.g1) + ' 元/克 − 每克扣 ' + yuan(P.r) + ' 元', (r.R / 100).toFixed(2)]));
    L.push(row(['差额', '实付 − 回收', (r.loss / 100).toFixed(2)]));
    L.push(row(['其中：工费和溢价', '实付 − 买时金子值 ' + yuan(r.M0), (r.premium / 100).toFixed(2)]));
    L.push(row(['其中：金价变动', '买时金子值 − 今天金子值 ' + yuan(r.M1), (r.goldMove / 100).toFixed(2)]));
    L.push(row(['其中：回收扣', '', (r.deduct / 100).toFixed(2)]));
    L.push(row(['回本线（元/克）', '今天大盘到这个数回收才够本', r.breakEven == null ? '到不了' : (r.breakEven / 100).toFixed(2)]));
    L.push(row(['金条对照：拿回', fmt(r.barGrams, 2) + ' 克', (r.barR / 100).toFixed(2)]));
    L.push(row(['金条对照：差额', '', (r.barLoss / 100).toFixed(2)]));
    L.push(row(['名字', P.name, '']));
    return L.join('\r\n') + '\r\n';
  }
  function toMD(o, when) {
    var P = o.P, r = o.r, L = [];
    L.push('# 小票上的克价 · ' + P.name, '', '_导出：' + when + '_', '', '**' + headline(o) + '**', '', explain(o), '');
    L.push('| 项目 | 说明 | 金额（元） |', '|---|---|---:|');
    receiptLines(o).forEach(function (x) { L.push('| ' + x[0] + ' | ' + x[1] + ' | ' + yuan(x[2]) + ' |'); });
    L.push('| 今天回收拿回 | ' + yuan(P.g1) + ' 元/克，每克扣 ' + yuan(P.r) + ' 元 | ' + yuan(r.R) + ' |', '');
    L.push('| 差在哪 | 金额（元） |', '|---|---:|');
    L.push('| 工费和溢价 | ' + yuan(r.premium) + ' |', '| 金价变动 | ' + yuan(r.goldMove) + ' |', '| 回收扣 | ' + yuan(r.deduct) + ' |', '| 合计 | ' + yuan(r.loss) + ' |', '');
    L.push(barText(o), '');
    o.actions.forEach(function (a) { L.push('- ' + a.text); });
    if (o.actions.length) L.push('');
    L.push('> 只算账，不预测金价、不建议买卖。默认数字是虚构示例。');
    return L.join('\n') + '\n';
  }

  var api = { MAX_G: MAX_G, UP: UP, ladder: ladder, defaultState: defaultState, parse: parse, gross: gross, goldValue: goldValue, recover: recover, barBack: barBack, lowest: lowest, evaluate: evaluate,
    compute: compute, applyChange: applyChange, headline: headline, explain: explain, barText: barText, receiptLines: receiptLines, lossWord: lossWord,
    fmt: fmt, yuan: yuan, pct: pct, grams: grams, rhoText: rhoText, toCSV: toCSV, toMD: toMD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
