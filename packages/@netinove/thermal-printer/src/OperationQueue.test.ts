import { OperationQueue } from './OperationQueue';

describe('OperationQueue', () => {
  it('runs operations sequentially', async () => {
    const queue = new OperationQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.enqueue(async () => {
      events.push('first:start');
      await firstGate;
      events.push('first:end');
    });
    const second = queue.enqueue(async () => {
      events.push('second');
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  it('continues after an operation fails', async () => {
    const queue = new OperationQueue();
    const failed = queue.enqueue(async () => {
      throw new Error('failed');
    });
    const next = queue.enqueue(async () => 'completed');

    await expect(failed).rejects.toThrow('failed');
    await expect(next).resolves.toBe('completed');
  });
});
