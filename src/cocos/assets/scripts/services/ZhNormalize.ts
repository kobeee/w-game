function splitCandidates(raw: string): string[] {
    // 常见分隔符：逗号/顿号/分号/斜杠
    return raw
        .split(/[，、,;；/]/)
        .map(s => s.trim())
        .filter(Boolean);
}

export function normalizeZh(input: string | string[]): string {
    const list = Array.isArray(input) ? input : splitCandidates(input);
    const cleaned: string[] = [];
    for (const item of list) {
        let t = item;
        // 移除括注/引号/连字符等
        t = t.replace(/[“”"']/g, '');
        t = t.replace(/[()（）【】［］\[\]{}]/g, '');
        t = t.replace(/[~\-—–]/g, ' ');
        // 去除英文与多余空白
        t = t.replace(/[A-Za-z]/g, '').replace(/\s+/g, ' ').trim();
        if (t) cleaned.push(t);
    }
    // 去重
    const unique = Array.from(new Set(cleaned));
    // 裁剪总长度 <=25 字，尽量按词边界
    const out: string[] = [];
    let total = 0;
    for (const w of unique) {
        const len = w.length;
        if (out.length >= 3) break;
        if (total + len + (out.length > 0 ? 1 : 0) > 25) break;
        out.push(w);
        total += len + (out.length > 1 ? 1 : 0);
    }
    return out.join('、');
}


