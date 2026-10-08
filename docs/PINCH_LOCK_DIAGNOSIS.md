# 捏合锁宫失败：诊断与建议改法

本文只做诊断，不改代码。附带的复现脚本跑的是真实模块，不是另写的模拟逻辑。

## 现象

真人测试时，指宫后捏合经常锁不上：要么没有反应，要么捏合变成了转盘，要么锁到隔壁宫。

## 结论

确实是模块冲突。同一个捏合同时被两套逻辑认领：

- 锁宫：`TargetSelectionController` + `TargetLockPinchDetector`
- 转盘：`GestureStateMachine` 的 ACTIVE 分支，`input.pinch && !input.pointing` 时进入 ROTATING（`GestureStateMachine.ts:158`）

谁拿到这个捏合，只看 Armed 还在不在。Armed 从最后一次 POINT 起只保留 700ms（`TargetSelectionController.ts:34`）。手指从指向到捏紧、中途停一下，很容易超过 700ms。Armed 一过期，捏合就归转盘。`main.ts` 里的 `TARGET_LOCK_STOLEN_BY_ROTATE` 只拦得住 Armed 还在的情况。

另外，捏合检测本身有两道门偏严，指尖瞄准还会在弯指时漂移。总共四个原因，见下表。

## 复现

```
node --import ./scripts/test-loader.mjs scripts/repro-pinch-lock.mjs
```

当前 main 的输出：

```
OK   A 指宫后直接捏（300ms）        期望 LOCK 宫3  实际 LOCK 宫3
FAIL B 指完停 500ms 再捏         期望 LOCK 宫3  实际 转盘 (FOCUS_EXPIRED)
FAIL C 捏到 0.25 犹豫 500ms 再捏紧 期望 LOCK 宫3  实际 转盘 (LOCK_TIMEOUT, FOCUS_EXPIRED)
FAIL D 捏紧时距离只到 0.21         期望 LOCK 宫3  实际 无反应 (LOCK_TIMEOUT, FOCUS_EXPIRED)
FAIL E 弯指时指尖漂到隔壁宫           期望 LOCK 宫3  实际 LOCK 宫5
```

只有「指完立刻干脆地捏」能成功，和真人测试的情况一致。

## 四个原因和改法

| | 原因 | 位置 | 建议改法 |
|---|---|---|---|
| 1 | Armed 只保留 700ms，过期后捏合归转盘（B、C） | `TargetSelectionController.ts:34` | 默认改为 1500ms，上限放到 2000 |
| 2 | 捏合 400ms 内没确认就超时，之后必须先张开到 0.30 以上才能重来（C） | `TargetLockPinchDetector.ts:40-42` | 去掉 400ms 超时，只在手指张开（≥0.30）时取消候选 |
| 3 | 确认要求距离 ≤0.20，比 `GestureSmoother` 的捏合退出阈值 0.25 还严；捏紧只读到 0.21 的人永远锁不上（D） | `TargetLockPinchDetector.ts:48` | 改为 ≤0.24，和 Smoother 对齐 |
| 4 | 选宫用指尖位置，弯食指时指尖下移，Armed 被改到隔壁宫（E） | `TargetSelectionController.ts:86` | 已 Armed 且手指正在合拢（`pinch.closingVelocity > 0`）时，不切换 Armed 宫位 |

四处改动合计约 5 行，不新增状态，也不新增模块。「旧捏合不能锁宫」的保证由 neutral 判断负责，这几处改动都不涉及它。

## 已验证到哪一步

在临时副本里应用上面四处改动后：

- 复现脚本 A–E 全部 OK
- typecheck 通过
- 162 项测试中 158 项通过。失败的 4 项都需要随改动更新：
  - `armed window expires after 700ms and cannot lock`、`an over-400ms closure still times out...`：断言的就是原因 1、2 的旧规则
  - `slow closing can confirm after...`、`small contact rebound keeps...`：断言的是 ≤0.20 下的确认时刻，改成 ≤0.24 后会提前确认

**没有做真人摄像头测试。** 改法 4 依赖 `closingVelocity`，真实数据有抖动。若真人测试发现该切宫时切不过去，给它加一个小阈值（例如 `> 0.3`）。

## 真人测试时怎么对号

在 `?qa=spells` 下锁不上时，看 QA 面板：

- 先出现 `FOCUS_EXPIRED`，然后阵盘被转动 → 原因 1
- 出现 `LOCK_TIMEOUT` → 原因 2
- 捏紧时面板上的 `normalized` 一直大于 0.20 → 原因 3
- 锁上了，但不是指的那个宫 → 原因 4
