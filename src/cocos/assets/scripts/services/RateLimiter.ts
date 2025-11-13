export class TokenBucket {
    private tokens: number;
    private lastRefill: number;

    constructor(
        private capacity: number,
        private refillPerSec: number
    ) {
        this.tokens = capacity;
        this.lastRefill = Date.now();
    }

    tryConsume(n: number = 1): boolean {
        this.refill();
        if (this.tokens >= n) {
            this.tokens -= n;
            return true;
        }
        return false;
    }

    private refill(): void {
        const now = Date.now();
        const elapsedSec = (now - this.lastRefill) / 1000;
        if (elapsedSec <= 0) return;
        const add = elapsedSec * this.refillPerSec;
        if (add > 0) {
            this.tokens = Math.min(this.capacity, this.tokens + add);
            this.lastRefill = now;
        }
    }
}


