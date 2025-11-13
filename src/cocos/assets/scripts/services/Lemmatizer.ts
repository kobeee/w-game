export function generateLemmas(wordUpper: string): string[] {
    const w = wordUpper.toUpperCase();
    const results: Set<string> = new Set([w]);

    // 简化的可逆规则集：s|es|ies|ed|ing|er|est
    // 1) 复数与三单
    if (w.endsWith('IES') && w.length > 3) {
        results.add(w.slice(0, -3) + 'Y'); // studies -> STUDY
    }
    if (w.endsWith('ES') && w.length > 2) {
        // buses -> BUS; boxes -> BOX
        results.add(w.slice(0, -2));
    }
    if (w.endsWith('S') && w.length > 1 && !w.endsWith('SS')) {
        results.add(w.slice(0, -1)); // cats -> CAT
    }

    // 2) 过去式/过去分词
    if (w.endsWith('IED') && w.length > 3) {
        results.add(w.slice(0, -3) + 'Y'); // tried -> TRY
    }
    if (w.endsWith('ED') && w.length > 2) {
        results.add(w.slice(0, -2)); // walked -> WALK
        // doubled consonant: stopped -> STOP (best-effort, do not try to detect)
    }

    // 3) 现在分词
    if (w.endsWith('ING') && w.length > 3) {
        results.add(w.slice(0, -3)); // running -> RUN (best-effort)
        if (w.endsWith('YING') && w.length > 4) {
            results.add(w.slice(0, -4) + 'IE'); // tying -> TIE（有限支持）
        }
    }

    // 4) 比较级/最高级
    if (w.endsWith('ER') && w.length > 2) {
        results.add(w.slice(0, -2)); // bigger -> BIG
    }
    if (w.endsWith('EST') && w.length > 3) {
        results.add(w.slice(0, -3)); // biggest -> BIG
    }

    return Array.from(results);
}


