class SpeedTracker {
  constructor() {
    this.lastBytes = 0;
    this.lastTime = Date.now();
    this.currentSpeed = '0 B/s';
  }

  calculateSpeed(currentBytes) {
    const now = Date.now();
    const timeDiff = (now - this.lastTime) / 1000;
    const bytesDiff = currentBytes - this.lastBytes;

    if (timeDiff >= 1) {
      const speedBps = bytesDiff / timeDiff;
      this.currentSpeed = this.formatSpeed(speedBps);
      this.lastBytes = currentBytes;
      this.lastTime = now;
    }
    return this.currentSpeed;
  }

  formatSpeed(bps) {
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let speed = bps;
    let unitIndex = 0;

    while (speed >= 1024 && unitIndex < units.length - 1) {
      speed /= 1024;
      unitIndex++;
    }

    return `${speed.toFixed(2)} ${units[unitIndex]}`;
  }
}

export default SpeedTracker;
