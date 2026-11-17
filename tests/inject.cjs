'use strict';
/* 注入测试：对 core.js 做一处小改动，看核心测试能不能抓到。跑完自动还原。
 * 首轮 26/30。没抓到的 4 个：二分下界 f(1) ≥ T → 补测（回本线 = 1 分）；「免工费后亏得更少」与「店内克价 > 大盘才给」两个守卫经分析多余
 * （工费 > 0 时免掉一定更少亏；克价 ≤ 大盘时后面「e2.loss < e.loss」兜底）→ 从 core.js 删掉，变异改打在剩下的守卫上；1 个变异原文写错 → 改正。
 * 第二轮补「溢价正好 0」测试；「premium > 0 → >= 0」是等价变异（=0 已在前一分支处理），删除。 */
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const F=path.join(__dirname,'../core.js'),src=fs.readFileSync(F,'utf8');
const M=[
["return Math.floor((n + Math.floor(d / 2)) / d);","return Math.floor(n / d);"],
["var goldPart = rdiv(P.w * P.p, 100);","var goldPart = rdiv(P.w * P.g0, 100);"],
["var fee = P.feeMode === 'piece' ? P.fee : rdiv(P.w * P.fee, 100);","var fee = P.fee;"],
["return rdiv(P.w * P.rho * g, 100000);","return rdiv(P.w * g, 100);"],
["return Math.max(0, goldValue(P, g) - ded);","return goldValue(P, g) - ded;"],
["var ded = rdiv(P.w * P.r, 100);","var ded = P.r;"],
["var x = g - P.rb; if (x <= 0) return 0;","var x = g + P.rb; if (x <= 0) return 0;"],
["var d = BigInt(P.g0 + P.b);","var d = BigInt(P.g0);"],
["(BigInt(T) * BigInt(x) * 2n + d) / (2n * d)","(BigInt(T) * BigInt(x)) / d"],
["var g = gross(P), T = g - P.disc;","var g = gross(P), T = g;"],
["if (f(UP) < T) return null;",""],
["if (f(mid) >= T) hi = mid; else lo = mid;","if (f(mid) > T) hi = mid; else lo = mid;"],
["if (f(lo) >= T) return lo;",""],
["if (e.loss > 0 && e.breakEven != null","if (e.breakEven != null"],
["if (e1) acts.push","if (true) acts.push"],
["if (e2.loss < e.loss) acts.push","acts.push"],
["if (P.disc >= g) {","if (P.disc > g) {"],
["P.w = need(st.w, 'w', 0.01, MAX_W, 2, '克重');","P.w = need(st.w, 'w', 0, MAX_W, 2, '克重');"],
["P.rho = need(st.rho, 'rho', 1, 100, 1, '成色');","P.rho = need(st.rho, 'rho', 1, 1000, 1, '成色');"],
["if (Math.abs(Math.round(x * sc) - x * sc) > 1e-6)","if (false)"],
["if (/^[=+\\-@]/.test(x)) x = \"'\" + x;",""],
["replace(/[,，\\s]/g, '')","replace(/[，\\s]/g, '')"],
["(c ? '.' + (c < 10 ? '0' : '') + c : '')","(c ? '.' + c : '')"],
["String(st.name == null ? '' : st.name).slice(0, 12)","String(st.name == null ? '' : st.name)"],
["[-20, -10, 0, 10, 20, 30, 40]","[-20, -10, 10, 20, 30, 40]"],
["xs.sort(function (a, b) { return a.g - b.g; });",""],
["s += r.premium === 0 ?","s += false ?"],
["clipped: R === 0 && M1 - rdiv(P.w * P.r, 100) < 0","clipped: false"],
["if (d === 0) return '今天大盘和买时一样，金价这一行是 0';",""],
["P.priceMode = st.priceMode === 'fixed' ? 'fixed' : 'gram';","P.priceMode = st.priceMode === 'gram' ? 'gram' : 'fixed';"],
];
let caught=0;const rows=[];
for(const [a,b] of M){
  if(src.indexOf(a)<0){rows.push('✗ 找不到原文：'+a.slice(0,80));continue;}
  fs.writeFileSync(F,src.replace(a,b));
  let ok=true;try{execFileSync('node',['--test',path.join(__dirname,'core.test.cjs')],{stdio:'pipe',timeout:120000});}catch(e){ok=false;}
  rows.push((ok?'✗ 没抓到':'✓ 抓到')+'：'+a.slice(0,70)+' → '+b.slice(0,70));if(!ok)caught++;
}
fs.writeFileSync(F,src);
console.log(rows.join('\n'));console.log('合计 '+caught+'/'+M.length);
