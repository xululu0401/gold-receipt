#!/usr/bin/env python3
"""小票上的克价 · 独立参考实现（只按需求简报的文字规则重写，不读 core.js）。
用 Fraction 做精确有理数，四舍五入到分用 floor(x + 1/2)；回本线不用二分，
先用闭式求出候选再在 ±3 分内逐分确认「最小的那个」。生成 300 组设定 → tests/ref.json。
用法：python3 tests/ref.py
"""
from fractions import Fraction as F
import json, math, random, pathlib

UP = 10_000_000  # 回本线最多找到 10 万元/克（分）


def r2(x):  # 元 → 分，四舍五入
    return math.floor(F(x) * 100 + F(1, 2))


def calc(st):
    w = F(st['w'])            # 克
    rho = F(st['rho']) / 100  # 比例
    g0, g1 = F(st['g0']), F(st['g1'])
    if st['priceMode'] == 'gram':
        p, fee = F(st['p']), F(st['fee'])
        gold_part = r2(w * p)
        fee_f = r2(fee) if st['feeMode'] == 'piece' else r2(w * fee)
        gross = gold_part + fee_f
    else:
        gross = r2(F(st['fixed']))
    T = gross - r2(F(st['disc']))
    ded = r2(w * F(st['r']))

    def value(g):  # g 为元/克
        return r2(w * rho * g)

    def rec(g):
        return max(0, value(g) - ded)

    b, rb = F(st['b']), F(st['rb'])

    def bar(g):
        x = g - rb
        if x <= 0:
            return 0
        return math.floor(F(T) * x / (g0 + b) + F(1, 2))  # T 是分，结果是分

    def lowest(f, guess_cents):
        if f(F(UP, 100)) < T:
            return None
        c = max(1, min(UP, guess_cents))
        # 先往下走到不满足，再往上走到满足：结果是最小满足者（f 单调）
        while c > 1 and f(F(c - 1, 100)) >= T:
            c -= 1
        while f(F(c, 100)) < T:
            c += 1
        return c

    M0, M1, R = value(g0), value(g1), rec(g1)
    # 闭式猜测：w·rho·g ≈ T + ded
    guess = math.ceil((F(T + ded) / 100) / (w * rho) * 100) if w * rho > 0 else UP
    be = lowest(rec, guess)
    bguess = math.ceil((F(T, 1) * (g0 + b) / T + rb) * 100) if T > 0 else 1
    bbe = lowest(bar, bguess)
    return {
        'T': T, 'M0': M0, 'M1': M1, 'R': R,
        'premium': T - M0, 'goldMove': M0 - M1, 'deduct': M1 - R, 'loss': T - R,
        'breakEven': be, 'barR': bar(g1), 'barBreakEven': bbe,
    }


def rnd_money(rng, lo, hi, dp=2):
    return f"{rng.uniform(lo, hi):.{dp}f}"


def main():
    rng = random.Random(20261117)
    cases = []
    while len(cases) < 300:
        g0 = rnd_money(rng, 300, 1500)
        st = {
            'name': '样本', 'w': rnd_money(rng, 0.5, 120), 'rho': rng.choice(['100', '99.9', '75', '58.5', '91.6']),
            'priceMode': 'fixed' if rng.random() < 0.25 else 'gram',
            'feeMode': 'gram' if rng.random() < 0.4 else 'piece',
            'g0': g0, 'g1': rnd_money(rng, 300, 1500),
            'r': rng.choice(['0', '4', '15', rnd_money(rng, 0, 40)]),
            'b': rng.choice(['0', '8', rnd_money(rng, 0, 30)]), 'rb': rng.choice(['0', '4', rnd_money(rng, 0, 20)]),
        }
        g0f = float(g0)
        st['p'] = rnd_money(rng, g0f * 0.95, g0f * 1.3)
        st['fee'] = rnd_money(rng, 0, 800) if st['feeMode'] == 'piece' else rnd_money(rng, 0, 60)
        st['fixed'] = rnd_money(rng, 200, 60000)
        st['disc'] = '0' if rng.random() < 0.6 else rnd_money(rng, 0, 300)
        if rng.random() < 0.05:
            st['r'] = rnd_money(rng, 900, 1000)  # 扣费比金子还贵 → 回收 0
        st['g1'] = rng.choice([st['g1'], st['g0']]) if rng.random() < 0.1 else st['g1']
        e = calc(st)
        if e['T'] <= 0:
            continue
        if st['priceMode'] == 'fixed':
            st['p'] = ''; st['fee'] = ''
        else:
            st['fixed'] = ''
        cases.append({'state': st, 'expect': e})
    stats = {
        'gain': sum(1 for c in cases if c['expect']['loss'] < 0),
        'loss': sum(1 for c in cases if c['expect']['loss'] > 0),
        'premium_neg': sum(1 for c in cases if c['expect']['premium'] < 0),
        'zero_recover': sum(1 for c in cases if c['expect']['R'] == 0),
        'no_breakeven': sum(1 for c in cases if c['expect']['breakEven'] is None),
        'bar_better': sum(1 for c in cases if c['expect']['barR'] > c['expect']['R']),
    }
    out = pathlib.Path(__file__).with_name('ref.json')
    out.write_text(json.dumps({'cases': cases, 'stats': stats}, ensure_ascii=False))
    print('写入', out, len(cases), '组；', stats)


if __name__ == '__main__':
    main()
