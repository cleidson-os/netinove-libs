export class OperationQueue {
  private pending: Promise<unknown> = Promise.resolve();

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const job = this.pending.then(operation);
    this.pending = job.then(
      () => undefined,
      () => undefined
    );
    return job;
  }
}
