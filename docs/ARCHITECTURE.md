# Architecture / 架构导览

这是一个 TypeScript + Vite 单页面项目。`src/main.ts` 是运行时编排入口；相机帧、手势和 WebGL 在同一页面协作，但各自有明确状态所有者。深入审计和已知边界见 [ARCHITECTURE_AUDIT.md](../ARCHITECTURE_AUDIT.md)。

```text
Camera <video>
  → HandTracker / MediaPipe（只对新视频帧推理）
  → DominantHandController / GestureRecognizer / GestureSmoother
  → GestureMotionDetector + HandRotationController
  → Choreography + InputBuffer + PriorityResolver
  → GestureStateMachine（被准入后提交交互状态）
  → QimenScene / QimenFormation / HandSpaceController
  → Sector Focus / SpellSystem / SpellCastController / SpellResolver
  → SpellVisuals + CameraController + PostProcessingPipeline
  → Three.js render
```

## 模块与状态所有权

| 目录 | 主要职责 |
|---|---|
| `handTracking/` | 视频源的 MediaPipe 推理、视频帧时间戳、镜像与画面裁剪映射 |
| `gestureRecognition/` | 手形分类、稳定判定、运动窗口、交互状态、编排、校准与 QA 数值记录 |
| `qimen/` | 四盘对象、八宫几何、空间盘层、展开/收束与抓盘惯性 |
| `threeScene/` | 场景与手空间、相机、渲染质量、后处理、资源释放 |
| `spells/` | 术式定义、生命周期、动作解析、视觉对象池与镜头反馈 |
| `effects/`, `audio/`, `showcase/`, `ui/` | 能量流、音效事件、自动展示和调试界面 |

`FormationAnimator` 持有展开状态，`GestureStateMachine` 持有当前交互状态，`QimenFormation` 合成盘层角度与深度，`SpellCastController` 持有锁定宫位及施术阶段。选宫的预览状态不等于术式锁定状态。相机变换由 `CameraController` 最终合成，`SpellCameraEffects` 只提交效果请求。

交互关键路径：摄像头 30Hz 与显示帧率可以不同；旧 landmark 不应被当作新样本重复计算速度。输入先经过优先级和许可检查，再由状态机提交。Finger Ray 应与实际旋转、移动、缩放的盘层求交。渲染质量档位由 `PerformanceGovernor` 提议，`QimenScene` 与视觉系统消费；部分后处理项目前只是接口占位。

## 演示与测试边界

`?demo=1` 只演阵局；`?spellDemo=1` 和 `?showcase=1` 用语义锁宫、蓄势、动作走同一 Spell 生命周期，但绕过真实摄像头识别。`?qa=1` 使用真实摄像头并启用记录入口。自动化测试覆盖状态、几何、对象池与模拟时钟，不能代替真人手势和实际 GPU 长时间测试。

开发时运行 `npm run typecheck`、`npm test`、`npm run build`。新增视觉资源时检查 `SpellVisuals` 对象池 reset/dispose；新增输入路径时检查状态准入、手丢失恢复和 Demo/Real 差异。源码中的 `GROUND_DOMAIN` 是实验性布局占位，不是与 `FRONT_CIRCLE` 等价的完整模式。
