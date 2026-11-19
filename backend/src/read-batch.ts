// Readers that arrive before the SELECT starts may share its snapshot. Readers
// arriving after dispatch need a fresh SELECT to see newly committed changes.
export class ReadBatch {
  private readonly queued = new Map<string, Promise<unknown>>();

  read<T>(key: string, load: () => Promise<T>): Promise<T> {
    const waiting = this.queued.get(key);
    if (waiting) return waiting as Promise<T>;
    const result = new Promise<T>((resolve, reject) => {
      setImmediate(() => {
        this.queued.delete(key);
        Promise.resolve().then(load).then(resolve, reject);
      });
    });
    this.queued.set(key, result);
    return result;
  }
}
