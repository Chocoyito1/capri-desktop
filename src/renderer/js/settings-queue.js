// Serialize preferences without dropping changes made while another save is pending.
export class SettingsQueue {
  constructor({ onResult, onError, onBusy }) {
    Object.assign(this, { onResult, onError, onBusy });
    this.pending = 0; this.tail = Promise.resolve();
  }
  run(task, options = {}) {
    this.pending++; this.onBusy(true);
    const job = this.tail.then(async () => {
      try { this.onResult(await task(), options); }
      catch (error) { this.onError(error); }
    });
    this.tail = job.catch(() => {});
    return job.finally(() => { this.pending--; this.onBusy(this.pending > 0); });
  }
}
