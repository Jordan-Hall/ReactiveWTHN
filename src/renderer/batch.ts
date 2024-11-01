export class BatchScheduler {
  private static instance: BatchScheduler;
  private pending = new Set<() => void>();
  private isFlushing = false;
  private isScheduled = false;

  private constructor() {}

  static getInstance(): BatchScheduler {
    if (!BatchScheduler.instance) {
      BatchScheduler.instance = new BatchScheduler();
    }
    return BatchScheduler.instance;
  }

  schedule(update: () => void): void {
    this.pending.add(update);
    
    if (!this.isScheduled && !this.isFlushing) {
      this.isScheduled = true;
      queueMicrotask(() => this.flush());
    }
  }

  flush(): void {
    if (this.isFlushing || this.pending.size === 0) return;
    
    this.isFlushing = true;
    this.isScheduled = false;

    const updates = Array.from(this.pending);
    this.pending.clear();

    for (const update of updates) {
      try {
        update();
      } catch (error) {
        console.error('Error during batch update:', error);
      }
    }

    this.isFlushing = false;

    if (this.pending.size > 0) {
      this.isScheduled = true;
      queueMicrotask(() => this.flush());
    }
  }
}