
export class Timer {

  private constructor(
    private startTime: bigint,
    private endTime?: bigint,
  ) {}

  static start(): Timer {
    let timer: Timer, startTime: bigint;
    startTime = process.hrtime.bigint();
    timer = new Timer(startTime);
    return timer;
  }

  stop(): number {
    let endTime: bigint, deltaMs: number;
    endTime = process.hrtime.bigint();
    this.endTime = endTime;
    deltaMs = Timer.getDeltaMs(this.startTime, this.endTime);
    return deltaMs;
  }
  currentMs(): number {
    return Timer.getDeltaMs(this.startTime, process.hrtime.bigint());
  }
  reset() {
    this.startTime = process.hrtime.bigint();
  }

  static getDeltaMs(start: bigint, end: bigint): number {
    return Number((end - start) / BigInt(1e3)) / 1e3;
  }
}
