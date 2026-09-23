export interface InteractionTimelineEvent {
  timestamp: number;
  label: string;
}

/** Debug-only rolling event log for finding the layer where an interaction stopped. */
export class InteractionEventTimeline {
  private readonly events: InteractionTimelineEvent[] = [];

  push(timestamp: number, label: string) {
    const last = this.events[this.events.length - 1];
    if (last?.label === label && timestamp - last.timestamp < 120) return;
    this.events.push({ timestamp, label });
    this.prune(timestamp);
  }

  lines(timestamp: number) {
    this.prune(timestamp);
    return this.events.slice(-12).map((event) => `${(event.timestamp / 1000).toFixed(3)}  ${event.label}`);
  }

  private prune(timestamp: number) {
    while (this.events.length && timestamp - this.events[0].timestamp > 10_000) this.events.shift();
  }
}
