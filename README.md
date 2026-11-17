# 小票上的克价（gold-receipt）

照着买金饰的小票填克重、成色、店内克价、工费，再填买那天和今天的大盘价、回收每克扣多少：

- 今天回收能拿回多少；
- 亏的钱拆成三块：工费和溢价、金价变动、回收扣（三块相加等于亏的钱）；
- 今天大盘最少到多少，回收才够本（精确到分）；
- 同样的钱当时买金条，今天卖拿回多少；
- 大盘 −20% 到 +40% 的对照表。

只算账，不预测金价、不建议买卖。默认数字为虚构示例。

体验：https://xululu0401.github.io/gold-receipt/

## 文件

- `index.html`（由 `template.html` 经 `node build.cjs` 产出）、`core.js`（计算）、`ui.js`（界面）
- `tests/core.test.cjs`：`node --test tests/core.test.cjs`
- `tests/ref.py`：独立 Python 参考实现（Fraction），生成 `tests/ref.json` 300 组对拍数据
- `tests/inject.cjs`：注入测试
