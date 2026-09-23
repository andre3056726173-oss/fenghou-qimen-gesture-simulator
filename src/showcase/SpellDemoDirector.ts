import type { QimenScene } from '../threeScene/QimenScene';
import type { SpellControllerEvent } from '../spells/SpellCastController';
import { SPELL_DEFINITIONS } from '../spells/SpellDefinition';

export interface SpellDemoCallbacks {
  events(events: SpellControllerEvent[]): void;
  cue(label: string): void;
}

/** Deterministic, camera-free presentation choreography for recording and visual tuning. */
export class SpellDemoDirector {
  private activeAt = 0;
  private cycle = 0;
  private fired = new Set<string>();
  private castNotBefore = Infinity;

  constructor(private readonly scene: QimenScene, private readonly callbacks: SpellDemoCallbacks) {}

  start() {
    this.activeAt = 0;
    this.cycle = 0;
    this.fired.clear();
    this.castNotBefore = Infinity;
    this.scene.resetSpellSystem();
    this.scene.spellSystem.visuals.clear();
    this.scene.handSpace.reset();
    this.scene.animator.restart();
    this.scene.animator.summon();
    this.scene.setPresentationCamera(true);
  }

  update(timestamp: number) {
    if (this.scene.animator.phase === 'IDLE') {
      this.start();
      return;
    }
    if (this.scene.animator.phase !== 'ACTIVE') return;
    if (!this.activeAt) this.activeAt = timestamp;
    const elapsed = timestamp - this.activeAt;
    const key = (name: string, at: number, action: () => void) => {
      const id = `${this.cycle}:${name}`;
      if (elapsed >= at && !this.fired.has(id)) { this.fired.add(id); action(); }
    };

    key('dial-grab', 550, () => {
      this.callbacks.cue('拨盘 · 四盘错位');
      this.scene.formation.beginRotationOn(3);
      this.scene.formation.setRotationVelocity(2.7);
    });
    key('dial-lock', 1250, () => this.scene.formation.settleRotation());

    const spells = SPELL_DEFINITIONS.map((spell, index) => ({ ...spell, at: 1800 + index * 2850 }));
    spells.forEach(({ sector, name, at }) => {
      key(`${sector}-focus`, at, () => { this.callbacks.cue(name); this.scene.formation.focus(sector, 1); });
      key(`${sector}-lock`, at + 200, () => {
        const events = this.scene.lockSpellSector(sector, timestamp);
        if (events.length) this.scene.formation.activate(sector, 1);
        this.callbacks.events(events);
        this.castNotBefore = timestamp + 750;
      });
    });
    const system = this.scene.spellSystem;
    const action = system.stage === 'READY' && timestamp >= this.castNotBefore ? system.activeSpell?.action ?? null : 'HOLD';
    this.callbacks.events(system.demoUpdate(timestamp, action));

    key('collapse', 14000, () => {
      this.callbacks.cue('收阵');
      this.scene.resetSpellSystem();
      this.scene.animator.collapse();
      this.activeAt = 0;
      this.cycle += 1;
    });
  }
}
