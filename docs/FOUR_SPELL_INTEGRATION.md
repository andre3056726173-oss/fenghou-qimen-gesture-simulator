# Phase 4.100 — 四术真人施术链整合

本版本在独立 integration 分支保留三条修复分支的提交历史，未合入 main。
基线为 `e1084b3`；依次合入巽 `abfdb97`、震 `df145fd`、坎 `e402db1`。

## 输入与状态所有权

`GestureMotionDetector` 仍只计算运动证据；`RealSpellCastGate` 是真人输入的唯一施术路由，
每个新摄像头样本只更新当前已锁宫术式的控制器。最终 READY／CASTING／COOLDOWN 生命周期
仍由 `SpellCastController` 拥有。Demo／键盘调试路径不充当真人验收。

| 术式 | 当前控制器 | READY 后的合法动作 |
| --- | --- | --- |
| 坤 | ReadyMotionCastController(PUSH) | 松开锁宫、张掌 Neutral、新 PUSH、后续新样本确认 |
| 巽 | XunCastInputController → ReadyMotionCastController(SWIPE) | 松开锁宫、张掌 Neutral、新定向 SWIPE、后续新样本确认 |
| 震 | ZhenFlickController | 消费锁宫 PINCH、稳定松开、新 PINCH 蓄势、快速释放、后续新样本确认 |
| 坎 | KanPullController | 消费锁宫／自然回位、READY 后张掌 Neutral、新 PULL、后续新样本确认 |

坤／巽 Neutral 为 120ms，锁宫稳定松开为 80ms；候选确认间隔不超过 120ms。
四术不缓存任何 READY 之前的施术动作。原 360ms GestureInputBuffer 参数不变，
仅保留非施术意图；真人施术入口不再消费其中的运动动作。

## 冲突处理

- 合并 main.ts 的三套独立更新入口为一个 Cast Gate；专项诊断读取各控制器的状态。
- 保留 MotionState 的独立 SWIPE 证据与坎的 Z／Scale／Facing 分量。
- 合并四个专项 QA 模式和 Recorder 数值字段，不删除任一专项模式。
- 明确锁宫请求优先于 CAST；没有锁宫请求时 CAST 优先于普通操作。
  READY 中新的震术 PINCH 优先用于 ARM；无术式语义的 PINCH 仍可拨盘，双手 PINCH 可抓空间。
- 新锁宫消费全部动作周期，取消、换手、重启摄像头、换宫均重置施术准入状态。
- 丢手重新建立 Neutral／Arm；重复 timestamp 和 RAF 不推进确认、不生成施术事件。

## 验收入口

`?qa=spells` 显示锁宫、当前术式、生命周期、四种 Score、Cast Gate、
Neutral／Armed／Candidate／Confirmed／Cooldown、Fresh Sample、非施术 Buffer 与事件时间线。
`?qa=kun|xun|zhen|kan` 四个原专项入口继续保留。

默认 PUSH／PULL／SWIPE／FLICK 阈值、融合权重、Calibration、Grace、Hover／Sector
Hysteresis 和 Two Hand Intent Timing 不修改。没有新增视觉、音频或术式。

自动测试覆盖真实运动检测器 → 统一准入 → SpellCastController，但不替代真人摄像头成功率测量。
下一步可在该 integration 分支真人连续测试四术；未完成真人验收前不宣称达到某一成功率。
