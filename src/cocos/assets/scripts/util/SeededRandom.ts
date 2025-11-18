/**
 * 伪随机数生成器（种子可控）
 * 提供确定性的随机数生成，确保相同种子产生相同序列
 */
export class SeededRandom {
    private seed: number;

    constructor(seed: string) {
        // 将字符串种子转换为数字
        this.seed = this.hashCode(seed);
    }

    /**
     * 字符串哈希函数
     */
    private hashCode(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    /**
     * 生成[0, 1)范围的伪随机数
     */
    public next(): number {
        const x = Math.sin(this.seed++) * 10000;
        return x - Math.floor(x);
    }

    /**
     * 生成[min, max)范围的整数
     */
    public nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min)) + min;
    }

    /**
     * 从数组中随机选择一个元素
     */
    public choice<T>(array: T[]): T {
        return array[this.nextInt(0, array.length)];
    }

    /**
     * 洗牌算法（Fisher-Yates）
     */
    public shuffle<T>(array: T[]): T[] {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = this.nextInt(0, i + 1);
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
}