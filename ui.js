/* 小票上的克价 · 界面（ui.js）
 * 读 state → AppCore.compute → 把同一次输出画出来。页面自己不做估算。 */
(function () {
  'use strict';
  var A = window.AppCore;
  var KEY = 'gold-receipt:v1';
  var $ = function (id) { return document.getElementById(id); };
  var PRESETS = [
    { key: 'base', name: '30 克足金手镯（默认）', note: '虚构示例：30 克足金手镯，店内克价 1,320 元、工费按件 380 元；买那天大盘 1,180 元，今天 1,020 元，回收每克扣 15 元。' },
    { key: 'k18', name: '18K 吊坠一口价', note: '虚构示例：5.2 克 18K（成色 75%）吊坠一口价 5,999 元，其他价格同默认。', f: function (s) { s.name = '18K 吊坠'; s.w = '5.2'; s.rho = '75'; s.priceMode = 'fixed'; s.fixed = '5999'; } },
    { key: 'bean', name: '免工费金豆', note: '虚构示例：10 克足金金豆，店内克价 1,198 元、不收工费，其他价格同默认。', f: function (s) { s.name = '金豆'; s.w = '10'; s.p = '1198'; s.fee = '0'; } },
    { key: 'up', name: '金价比买时涨了', note: '虚构示例：同默认的手镯，但今天大盘 1,380 元，比买时高 200 元。', f: function (s) { s.g1 = '1380'; } }
  ];
  var FIELDS = ['name', 'w', 'rho', 'p', 'fee', 'fixed', 'disc', 'g0', 'g1', 'r', 'b', 'rb'];
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function presetState(k) { var s = A.defaultState(), p = PRESETS.filter(function (q) { return q.key === k; })[0]; if (p.f) p.f(s); return s; }
  function norm(s) { return JSON.stringify(sanitize(s)); }
  function presetKey(s) { var j = norm(s); for (var i = 0; i < PRESETS.length; i++) if (norm(presetState(PRESETS[i].key)) === j) return PRESETS[i].key; return null; }
  function str(v, n) { return v == null || typeof v === 'object' ? '' : String(v).slice(0, n); }
  function sanitize(s) {
    if (!s || typeof s !== 'object') return null;
    var d = A.defaultState();
    FIELDS.forEach(function (k) { if (k in s) d[k] = str(s[k], k === 'name' ? 12 : 12); });
    if (s.priceMode === 'gram' || s.priceMode === 'fixed') d.priceMode = s.priceMode;
    if (s.feeMode === 'gram' || s.feeMode === 'piece') d.feeMode = s.feeMode;
    return d;
  }
  function load() { try { var t = localStorage.getItem(KEY); if (!t) return null; var j = JSON.parse(t); return j && j.state ? sanitize(j.state) : null; } catch (e) { return null; } }
  var state = load() || A.defaultState(), out = null, tmr = null;
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, state: state })); $('saveTag').textContent = '· 已自动存在本机'; } catch (e) { $('saveTag').textContent = '· 这台设备存不了，刷新会丢'; } }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var Y = A.yuan;

  function fill() {
    FIELDS.forEach(function (k) { $(k).value = state[k]; });
    $('pm_gram').setAttribute('aria-pressed', state.priceMode === 'gram'); $('pm_fixed').setAttribute('aria-pressed', state.priceMode === 'fixed');
    $('fm_piece').setAttribute('aria-pressed', state.feeMode === 'piece'); $('fm_gram').setAttribute('aria-pressed', state.feeMode === 'gram');
    $('gramBox').classList.toggle('hide', state.priceMode !== 'gram'); $('fixedBox').classList.toggle('hide', state.priceMode !== 'fixed');
    $('feeLab').textContent = state.feeMode === 'piece' ? '工费（元，整件）' : '工费（元/克）';
  }
  FIELDS.forEach(function (k) { $(k).addEventListener('input', function () { state[k] = this.value; schedule(); }); });
  function schedule() { clearTimeout(tmr); tmr = setTimeout(update, 80); }
  $('pmSeg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pm]'); if (!b) return; var m = b.getAttribute('data-pm'); if (m === state.priceMode) return;
    /* 切到一口价时，一口价框空着就先填上按克算出来的优惠前价钱，方便改 */
    if (m === 'fixed' && !String(state.fixed).trim() && out && out.ok) state.fixed = String(out.r.gross / 100);
    state.priceMode = m; fill(); update();
  });
  $('fmSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-fm]'); if (!b) return; state.feeMode = b.getAttribute('data-fm'); fill(); update(); });
  $('presets').addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (!b) return; state = presetState(b.getAttribute('data-p')); fill(); update(); });
  $('acts').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || !out || !out.ok) return;
    var a = out.actions.filter(function (x) { return x.id === b.getAttribute('data-act'); })[0]; if (!a) return;
    state = A.applyChange(state, a.ch); fill(); update();
  });

  function markErrors() {
    document.querySelectorAll('.bad').forEach(function (e) { e.classList.remove('bad'); });
    if (!out.ok) out.errors.forEach(function (er) { var el = $(er.field); if (el) el.classList.add('bad'); });
  }
  function renderPresets() {
    var key = presetKey(state);
    $('presets').innerHTML = PRESETS.map(function (p) { return '<button type="button" class="chip" id="preset_' + p.key + '" data-p="' + p.key + '" aria-pressed="' + (key === p.key) + '">' + esc(p.name) + '</button>'; }).join('');
    var cur = PRESETS.filter(function (p) { return p.key === key; })[0];
    $('presetNote').textContent = cur ? cur.note : '你改过的设定（克重、价格都是你填的）。';
  }
  function wfRows(o) {
    var r = o.r;
    return [
      { id: 'w_pay', lab: '实付', a: 0, b: r.T, cls: 't-pay', v: Y(r.T) },
      { id: 'w_pre', lab: '工费和溢价', a: Math.min(r.M0, r.T), b: Math.max(r.M0, r.T), cls: 't-pre', v: (r.premium >= 0 ? '−' : '+') + Y(Math.abs(r.premium)) },
      { id: 'w_mov', lab: '金价变动', a: Math.min(r.M0, r.M1), b: Math.max(r.M0, r.M1), cls: 't-mov' + (r.goldMove < 0 ? ' up' : ''), v: (r.goldMove >= 0 ? '−' : '+') + Y(Math.abs(r.goldMove)) },
      { id: 'w_ded', lab: '回收扣', a: r.R, b: r.M1, cls: 't-ded', v: '−' + Y(r.deduct) },
      { id: 'w_rec', lab: '拿回', a: 0, b: r.R, cls: 't-rec', v: Y(r.R) }
    ];
  }
  function render() {
    var o = out;
    $('errBox').classList.toggle('hide', o.ok);
    ['okBox', 'ladPanel'].forEach(function (id) { $(id).classList.toggle('hide', !o.ok); });
    if (!o.ok) {
      $('errBox').innerHTML = '先改好标红的地方：<ul>' + o.errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul>';
      $('lines').innerHTML = ''; $('paid').textContent = '—'; return;
    }
    var r = o.r, P = o.P;
    $('lines').innerHTML = A.receiptLines(o).filter(function (x) { return x[0] !== '实付'; }).map(function (x) {
      return '<div class="f" style="margin:3px 0"><span class="muted">' + esc(x[0]) + (x[1] ? ' · ' + esc(x[1]) : '') + '</span><span style="text-align:right">' + Y(x[2]) + '</span></div>';
    }).join('');
    $('paid').textContent = Y(r.T) + ' 元（合 ' + Y(r.perGram) + ' 元/克）';
    $('big').textContent = Y(r.R) + ' 元';
    $('big').className = 'big ' + (r.loss > 0 ? 'neg' : 'pos');
    $('headline').textContent = A.headline(o);
    var mx = Math.max(r.T, r.M0, r.M1, 1);
    $('wf').innerHTML = wfRows(o).map(function (w) {
      var left = w.a / mx * 100, wid = Math.max(0, (w.b - w.a) / mx * 100);
      return '<div class="wrow" id="' + w.id + '"><span class="lab">' + w.lab + '</span><span class="track"><i class="' + w.cls + '" style="left:' + left.toFixed(2) + '%;width:' + wid.toFixed(2) + '%;min-width:' + (w.b > w.a ? 2 : 0) + 'px"></i></span><span class="v">' + w.v + '</span></div>';
    }).join('');
    $('why').textContent = A.explain(o);
    $('acts').innerHTML = o.actions.length ? o.actions.map(function (a) { return '<button type="button" class="act" id="' + a.id + '" data-act="' + a.id + '">→ ' + esc(a.text) + '</button>'; }).join('') : '<span class="muted">' + (r.loss > 0 ? '大盘涨到 10 万元/克也回不了本，改价格没有意义。' : '今天卖不亏，没有要改的。') + '</span>';
    $('lad').innerHTML = '<tr><th>今天大盘（元/克）</th><th>比今天</th><th>回收拿回</th><th>比实付</th><th>换成金条拿回</th><th>比实付</th></tr>' + o.ladder.map(function (x) {
      var d = x.be ? '回本线' : x.d === 0 ? '今天' : (x.d > 0 ? '+' : '') + x.d + '%';
      var cls = x.d === 0 && !x.be ? 'now' : x.be ? 'be' : '';
      var sg = function (l) { return l > 0 ? '<td class="neg">−' + Y(l) + '</td>' : '<td class="pos">' + (l < 0 ? '+' + Y(-l) : '0') + '</td>'; };
      return '<tr class="' + cls + '"><td>' + Y(x.g) + '</td><td>' + d + '</td><td>' + Y(x.R) + '</td>' + sg(x.loss) + '<td>' + Y(x.barR) + '</td>' + sg(x.barLoss) + '</tr>';
    }).join('');
    $('bar').textContent = A.barText(o);
  }
  function update() { clearTimeout(tmr); out = A.compute(state); markErrors(); renderPresets(); render(); save(); }

  function stamp() { var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function download(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  function tag() { return out.ok ? (out.r.loss > 0 ? '亏' + Y(out.r.loss).replace(/,/g, '') + '元' : out.r.loss < 0 ? '赚' + Y(-out.r.loss).replace(/,/g, '') + '元' : '持平') : '待改'; }
  $('dlCsv').addEventListener('click', function () { if (out.ok) download('小票上的克价-明细.csv', new Blob(['\ufeff' + A.toCSV(out, stamp())], { type: 'text/csv;charset=utf-8' })); });
  $('dlMd').addEventListener('click', function () { if (out.ok) download('小票上的克价-' + tag() + '.md', new Blob([A.toMD(out, stamp())], { type: 'text/markdown;charset=utf-8' })); });
  $('dlJson').addEventListener('click', function () { download('小票上的克价-备份.json', new Blob([JSON.stringify({ app: '小票上的克价', slug: 'gold-receipt', version: 1, exported_at: stamp(), state: state }, null, 2)], { type: 'application/json' })); });
  $('impJson').addEventListener('click', function () { $('impFile').click(); });
  $('impFile').addEventListener('change', function () { var f = this.files && this.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { importText(String(rd.result)); }; rd.readAsText(f); this.value = ''; });
  function importText(t) {
    var s = null;
    try { var j = JSON.parse(t); s = sanitize(j && j.state ? j.state : j); } catch (e) { s = null; }
    if (!s) { $('saveTag').textContent = '· 这个文件读不出来，没改动'; return false; }
    state = s; fill(); update(); return true;
  }
  $('reset').addEventListener('click', function () { state = A.defaultState(); fill(); update(); });

  /* 结果卡 PNG 1080×1350：文字、条形与表格取自同一次 out */
  function drawCard() {
    var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d'), FF = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    g.fillStyle = '#efece6'; g.fillRect(0, 0, W, H); g.fillStyle = '#fffdf8'; g.fillRect(50, 50, W - 100, H - 100);
    var L = 100, Rr = W - 100, maxW = Rr - L, y = 145;
    function font(size, bold) { g.font = (bold ? '700 ' : '') + size + 'px ' + FF; }
    function clip(t, w) { t = String(t); if (g.measureText(t).width <= w) return t; while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }
    function wrap(t, size, color, bold, lim) {
      font(size, bold); g.fillStyle = color; var cur = '', n = 0;
      var toks = String(t).match(/[0-9.,%+−-]+ ?(?:元\/克|元|克|%)?[）)。，、；：]?|[（(「]?[A-Za-z]+[）)」。，、；：]?|[（(「]?[^\s（(「][）)」。，、；：]?|\s/g) || [];
      for (var i = 0; i < toks.length; i++) { var ch = toks[i]; if (g.measureText(cur + ch).width > maxW && cur) { if (lim && ++n >= lim) { g.fillText(clip(cur + '…', maxW), L, y); y += size * 1.45; return; } g.fillText(cur, L, y); y += size * 1.45; cur = ch.trim() ? ch : ''; } else cur += ch; }
      if (cur) { g.fillText(cur, L, y); y += size * 1.45; }
    }
    font(54, true); g.fillStyle = '#23201a'; g.fillText('小票上的克价', L, y); y += 54;
    if (!out.ok) { font(42, true); g.fillStyle = '#a8372b'; g.fillText('还算不了', L, y + 20); y += 90; out.errors.slice(0, 8).forEach(function (e) { wrap('· ' + e.message, 28, '#545046', false, 2); y += 8; }); y += 30; wrap('改好标红的地方，会自动重算。', 26, '#8a8478'); return cv; }
    var o = out, P = o.P, r = o.r;
    font(26); g.fillStyle = '#8a8478'; g.fillText(clip(P.name + ' · ' + A.grams(P) + ' 克 · 成色 ' + A.rhoText(P) + ' · 买时大盘 ' + Y(P.g0) + ' → 今天 ' + Y(P.g1) + ' 元/克', maxW), L, y); y += 56;
    font(30); g.fillStyle = '#545046'; g.fillText('今天回收拿回', L, y); y += 88;
    font(80, true); g.fillStyle = r.loss > 0 ? '#a8372b' : '#2f6b4f'; g.fillText(clip(Y(r.R) + ' 元', maxW), L, y); y += 50;
    wrap(A.headline(o), 30, '#23201a', true, 3); y += 16;
    /* 拆账条 */
    var mx = Math.max(r.T, r.M0, r.M1, 1), bx = L + 200, bw = maxW - 200 - 250, cols = { 't-pay': '#23201a', 't-pre': '#b98a2e', 't-mov': '#c9725f', 't-mov up': '#79a88c', 't-ded': '#9a948a', 't-rec': '#2f6b4f' };
    wfRows(o).forEach(function (w) {
      font(26); g.fillStyle = '#545046'; g.fillText(w.lab, L, y + 28);
      g.fillStyle = '#f6f2e9'; g.fillRect(bx, y + 4, bw, 34);
      var a = w.a / mx * bw, ww = Math.max(w.b > w.a ? 3 : 0, (w.b - w.a) / mx * bw); g.fillStyle = cols[w.cls]; g.fillRect(bx + a, y + 4, ww, 34);
      font(26, true); g.fillStyle = '#23201a'; g.textAlign = 'right'; g.fillText(clip(w.v, 240), Rr, y + 30); g.textAlign = 'left';
      y += 46;
    });
    y += 30;
    wrap(A.explain(o), 24, '#545046', false, 5); y += 10;
    wrap(A.barText(o), 24, '#7d5512', false, 3);
    /* 大盘到多少拿回多少（从对照表挑：今天、+10%、+20%、回本线），同一次 out.ladder */
    var pick = o.ladder.filter(function (x) { return x.be || x.d === 0 || x.d === 10 || x.d === 20; });
    var room = Math.floor((H - 160 - y - 18 - 38) / 40);              /* 放得下几行 */
    if (pick.length > room) pick = pick.filter(function (x) { return x.be || x.d === 0; });   /* 放不下就只留今天和回本线 */
    if (pick.length <= room && pick.length) {
      y += 18; var cx = [L + 14, L + 330, L + 600, Rr - 14];
      font(20); g.fillStyle = '#8a8478'; g.fillText('今天大盘（元/克）', cx[0], y); g.fillText('回收拿回', cx[1], y); g.fillText('比实付', cx[2], y); g.textAlign = 'right'; g.fillText('只是对照，不是预测', cx[3], y); g.textAlign = 'left'; y += 38;
      pick.forEach(function (x) {
        if (x.d === 0 && !x.be) { g.fillStyle = '#fbf1d8'; g.fillRect(L, y - 28, maxW, 38); }
        font(24, x.be || x.d === 0); g.fillStyle = x.be ? '#7d5512' : '#23201a';
        g.fillText(Y(x.g) + (x.be ? '（回本线）' : x.d === 0 ? '（今天）' : '（+' + x.d + '%）'), cx[0], y); g.fillText(Y(x.R), cx[1], y);
        g.fillStyle = x.loss > 0 ? '#a8372b' : '#2f6b4f'; g.fillText(x.loss > 0 ? '−' + Y(x.loss) : x.loss < 0 ? '+' + Y(-x.loss) : '0', cx[2], y);
        y += 40;
      });
    }
    y = H - 120;
    wrap('只算账，不预测金价、不建议买卖；各家回收规则不同，以实际报价为准。默认克重与价格为虚构示例。', 20, '#8a8478', false, 2);
    return cv;
  }
  $('dlPng').addEventListener('click', function () { drawCard().toBlob(function (bl) { if (bl) download('小票上的克价-' + tag() + '-1080x1350.png', bl); }, 'image/png'); });

  window.__grUi = { state: function () { return clone(state); }, out: function () { return out; }, importText: importText, drawCard: drawCard, storageKey: KEY };
  fill(); update();
})();
