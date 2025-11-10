export interface ValidateResult {
    valid: boolean;
    definition?: string;
    source: 'local' | 'cache' | 'gemini' | 'offline';
    latency: number;
    error?: string;
}

export interface WordStat {
    word: string;
    valid: boolean;
    scoreDelta: number;
    definition?: string;
    clearedAtMs: number;
}

export type GameEndReason = 'SLOTS_FILLED' | 'NO_TILES' | 'MANUAL';

export interface GameResult {
    score: number;
    durationMs: number;
    wordsCleared: WordStat[];
    longestWordLen: number;
}




