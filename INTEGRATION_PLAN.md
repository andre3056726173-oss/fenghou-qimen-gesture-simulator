# Phase 4.102 — four-spell pre-integration audit

This is a read-only comparison of the published branches plus synthetic tests on a branch cut from stable `main`. It is **not** a camera acceptance report or a merge approval. No gesture defaults or production runtime code changed here.

## Actual ancestry and recommended baseline

| Ref | Tip | Merge base with `main` | Relationship |
| --- | --- | --- | --- |
| `main` and `fix/real-kun-cast-chain` | `e1084b3` | `e1084b3` | Kun is already the stable baseline. |
| `fix/real-xun-cast-chain` | `abfdb97` | `e1084b3` | Ancestor of the four-spell integration and Target/Lock branch. |
| `fix/real-zhen-flick-chain` | `df145fd` | `e1084b3` | Ancestor of the four-spell integration and Target/Lock branch. |
| `fix/real-kan-pull-chain` | `e402db1` | `e1084b3` | Ancestor of the four-spell integration and Target/Lock branch. |
| `integration/real-four-spell-chains` | `a395fec` | `e1084b3` | Already contains the three merge commits and an integration commit. Remains unmerged to `main`. |
| `fix/target-focus-lock-flow` | `3e703e7` | `e1084b3` | Direct descendant of `a395fec`; contains **all four** spell chains and Target/Lock. Remains unmerged to `main`. |

`git merge-base --is-ancestor` confirms each spell tip and `a395fec` is an ancestor of `3e703e7`. `git merge-tree --write-tree` reports **no conflict** between the Target/Lock branch and the integration branch, or between Target/Lock and any individual spell branch, because the changes are already in its history. Do not merge or cherry-pick those tips into `fix/target-focus-lock-flow` again.

## Shared-file conflict matrix

Here “modified” means changed by an independent spell branch relative to `main`, or by the Target/Lock commit relative to `a395fec`. KUN is the baseline, so it has no independent delta. Eight paths are modified by two or more of XUN, ZHEN, KAN, TARGET; six of those are code files. “Historical text conflict” was checked with read-only `git merge-tree` between the *separate* spell branches, not guessed from file overlap. All historical conflicts have already been resolved in the integration ancestry; they do not recur when advancing from `a395fec` to `3e703e7`.

| Shared path | Independent writers | Historical text conflict | Semantic risk and retained integration behavior |
| --- | --- | --- | --- |
| `src/main.ts` | XUN, ZHEN, KAN, TARGET | XUN/ZHEN, XUN/KAN, ZHEN/KAN | **HIGH.** Keep one call order: fresh sample → target selection → spell-specific gate → priority → interaction events → spell update. Preserve Target/Lock’s `armedSector` and lock-cycle consumption; preserve integration’s single `RealSpellCastGate`. |
| `src/app/runtimeMode.ts` | XUN, ZHEN, KAN | all three pairs | LOW. Keep all `?qa=xun/zhen/kan/spells` branches. |
| `src/gestureRecognition/GestureDebugRecorder.ts` | XUN, ZHEN, KAN | all three pairs | MEDIUM. Preserve each spell’s numeric evidence without double recording or video. Target QA is separately owned by `RealInteractionQA`. |
| `src/gestureRecognition/GestureMotionDetector.ts` | XUN, KAN | XUN/KAN | **HIGH.** Preserve swipe trajectory evidence and pull decomposition together; do not replace one branch’s motion fields wholesale. Frozen thresholds/weights remain unchanged. |
| `src/spells/SpellSystem.ts` | XUN, KAN | XUN/KAN | MEDIUM. Keep wind direction/anticipation and water admission while leaving lifecycle ownership in `SpellCastController`. |
| `src/threeScene/QimenScene.ts` | XUN, ZHEN, TARGET | auto-merged XUN/ZHEN | MEDIUM. Keep visual direction, ZHEN feedback, and TARGET ray/cursor on the transformed HeavenPlate. |
| `README.md` | XUN, ZHEN, KAN | all three pairs | LOW. Existing integration wording already reconciles spell instructions. |
| `docs/GESTURES.md` | XUN, ZHEN, KAN, TARGET | ZHEN/KAN | LOW. Preserve current target-arming and each spell’s separate cast cycle instructions. |

Paths that change only on Target/Lock after `a395fec`: `GestureStateMachine.ts`, `RealInteractionQA.ts`, `TargetSelectionController.ts`, `TargetLockPinchDetector.ts`, `index.html`, `styles.css`, and Target/Lock tests. `GestureRecognizer`, `GestureSmoother`, `GestureChoreographyController`, `GestureInputBuffer`, `SectorFocusController`, `SpellCastController`, `SpellResolver`, `FormationPicking`, `QimenFormation`, and `GestureTuning` do **not** have competing independent branch edits. Some are still important runtime boundaries.

## Ownership and state hand-off

| Concept | Authoritative writer | Other fields/readers |
| --- | --- | --- |
| Gesture classification and temporal stability | `GestureRecognizer`, then `GestureSmoother` | `main.ts` samples both only on fresh camera frames. |
| Raw motion evidence | `GestureMotionDetector`; `HandSwipeDetector` for windowed swipe evidence | Spell gates consume it. A detected motion is **not** cast admission. |
| Target preview/focus/armed/lock pinch | `TargetSelectionController` + `TargetLockPinchDetector` on `3e703e7` | `GestureStateMachine` admits the resulting `LOCK` event; it does not select the sector itself. Legacy `SectorFocusController` remains in old tests but is not the real branch’s runtime selector. |
| Confirmed spell lock and lifecycle | `SpellCastController`, exposed by `SpellSystem` | `QimenScene.lockSpellSector` is the write entry; `main.ts` calls it after a confirmed target event. |
| Per-spell cast admission | `RealSpellCastGate`: `ReadyMotionCastController` for KUN/XUN, `ZhenFlickController`, `KanPullController` | Controllers expose differing diagnostics, not a shared method signature. `main.ts` routes exactly one active spell. A broad adapter would add risk without current benefit. |
| Formation selection and energy path | `QimenFormation` visual state | Preview/focus may temporarily change the visual `lockedSector`; **do not** treat that visual field as the authoritative spell lock. |

**Multiple-writer risk (HIGH):** Target/Lock has `TargetSelectionController.lockedSector`, `SpellCastController.lockedSector`, `QimenFormation.lockedSector`, and `main.ts` `selectedSector`. They are not the same ownership level. The target controller’s `lockedSector` is a mirror written after the spell lock succeeds. On primary-hand switch, `main.ts` resets target selection while the spell lock can remain; on a new preview, the formation visual can clear its own lock while the spell lifecycle still holds the previous one. Use `SpellSystem.lockedSector` as the spell authority and keep target/visual fields local. This mismatch is documented for integration review; no behavior-changing fix belongs in this audit.

`SpellCastController` alone changes the spell stage during real play. Demo/test-only `forceReady` is a bypass, so demo success does not validate hand gates. `main.ts` still contains orchestration and several derived UI states; it must not become an independent spell/sector authority.

## Input buffer and action priority

| Intent | Type permits buffer entry? | Stable `main` runtime pushes it? | `3e703e7` runtime pushes it? |
| --- | --- | --- | --- |
| PUSH / PULL / SWIPE / FLICK | Yes | **Yes**, on detected motion | **No**; spell-specific controllers gate fresh action samples. |
| LOCK | No (`LOCK` is an event, not a `BufferedIntent`) | No | No |
| POINT / PINCH / OPEN_PALM / FIST | Yes | Yes, including RAF repeats | Yes, only on fresh samples |

Stable `main` consumes an action from `GestureInputBuffer` within 360ms when the stage becomes READY. A pre-READY PUSH/PULL/SWIPE/FLICK can therefore be replayed as a cast: **HIGH on `main`**. The added characterization test reproduces that ability in the buffer without changing behavior. On `3e703e7`, `main.ts` does not push or consume cast actions; `RealSpellCastGate` requires the current locked spell, READY, hand present, fresh sample, and a matching controller confirmation. KUN/XUN share the post-READY neutral/new-candidate gate; ZHEN requires a new held cast pinch and release after the lock cycle; KAN requires release, READY neutral, then a new pull candidate. Lock calls `castGate.consumeLock` and clears the gesture buffer. Do not restore the old buffer consumption while resolving conflicts.

Stable `main` priority is `COLLAPSE > CAST > LOCK > ROTATE > TARGET > SPACE`. Integrated Target/Lock is `COLLAPSE > TARGET_LOCK > CAST > SPELL_ARM > ROTATE > TARGET > SPACE` in the resolver; the confirmed target lock is admitted before grab/rotate in `GestureStateMachine`. Without an armed target, normal pinch still rotates and two-hand pinch still grabs. **HIGH:** taking the old `main` resolver or state-machine branch during a manual conflict resolution would reintroduce lock theft. The spell-specific gate evaluates before the lower interaction event, but a confirmed lock consumes that cycle and suppresses the old cast motion before the spell update.

## Motion conflicts, stale samples, and loss

- PUSH and PULL scores can both include a small palm-facing term, and contradictory Z/scale trends can both generate evidence. Motion classification emits one action per sample. In the integration branch KUN requires PUSH evidence above threshold **and** PULL evidence below threshold; KAN requires an actual shrinking-palm/depth direction, low lateral drift, and a second confirming sample. Do not infer disjoint raw scores from the exclusive cast gates.
- A whole-hand swipe and a pinch release can have simultaneous velocity evidence; `GestureMotionDetector` classifies one raw action, while the integration router activates only the controller for the locked spell. ZHEN requires a fresh, post-READY pinch cycle and relative fingertip separation; XUN requires a coherent, directional swipe after READY neutral. Ordinary release outside ZHEN cannot cast lightning.
- `FrameSampleGate` rejects duplicate timestamps. On `3e703e7`, target preview/focus/pinch advancement and `GestureMotionDetector` updates require fresh camera samples; the common cast router returns a blocked motion on stale samples. Camera stall can expire an armed target by wall time but does not confirm a gesture. Loss clears motion association; KUN/XUN, ZHEN and KAN disarm their candidates and require neutral/re-arm. Short target grace retains the selected context without accumulating new evidence; beyond grace it clears.
- **MEDIUM:** multiple frames with the same physical gesture may be observed by both a visual target/plate layer and a spell gate, but only the admitted event may change lifecycle. Keep this order and reset behavior when the final candidate is tested with real hands.

## Test coverage and limits

`tests/pre-integration-harness.test.mjs` adds 13 deterministic tests on stable `main`: four complete common-core sequences (POINT → FOCUS → LOCK → PREPARING/CHARGING → READY → matching action → CASTING/COOLDOWN), four wrong-action combinations, buffer behavior, opposite depth motion, duplicate/lost sample, non-pinch lateral movement, and pinch release with lateral residual. These exercise **common-core modules**, not absent branch-specific gates. The four-spell integration branch already contains cross-gate tests; the Target/Lock branch contains both those tests and 17 Target/Lock tests. Re-run all of them on the final candidate branch; do not claim the 41 audit-branch tests alone prove an end-to-end hand interaction.

Real camera success rates and physical hand-to-photon latency remain unmeasured. No synthetic test can establish the requested 9/10 live lock rate.

## Merge plan (not executed here)

1. Keep `main` (`e1084b3`) unchanged until the integrated candidate is reviewed. For source order, KUN is base; XUN (`abfdb97`) → ZHEN (`df145fd`) → KAN (`e402db1`) have **already** been merged into `integration/real-four-spell-chains` (`a395fec`). Target/Lock (`3e703e7`) is its next commit. There is no pending four-way merge to repeat.
2. Create a *new* candidate branch from `fix/target-focus-lock-flow`, e.g. `integration/four-spells-with-target-lock`. This retains merge history, resolved conflicts, QA modes, and all spell controllers. Avoid rebasing or cherry-picking the individual spell fixes: both would duplicate work and risk restoring old `main.ts`/buffer/priority semantics.
3. Run typecheck, the complete test suite and build **on that candidate**. Inspect the `SpellSystem.lockedSector`/target mirror at hand switch, retarget during READY, and formation preview. Preserve the Target/Lock admission and single-cast-router semantics above. Any actual behavior fix needs its own review and camera QA when available.
4. If `main` advances independently, compare the new `main` to the candidate and merge `main` into the candidate with semantic conflict review. Do not prefer ours/theirs blindly. Only after acceptance should the candidate be merged into `main`; nothing is merged in Phase 4.102.

Recommendation: **neither rebase nor cherry-pick the existing spell branches**. Branch from their already-integrated descendant. Use a normal non-squash merge when promotion is eventually authorized, preserving history.
