import { DICT_TIMEOUT_MS } from '../config/word-validate';

function withTimeout<T>(p: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
        p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
        if (signal) {
            signal.addEventListener('abort', () => {
                clearTimeout(t);
                reject(new Error('ABORTED'));
            }, { once: true });
        }
    });
}

// wiktionary 通道已停用，保留空实现以兼容调用方
export async function fetchWiktionaryZh(_wordUpper: string, _opts?: { timeout?: number, signal?: AbortSignal }): Promise<string | null> {
    return null;
}

export async function fetchDictionaryApi(wordUpper: string, opts?: { timeout?: number, signal?: AbortSignal }): Promise<{ status: number; firstDefinition?: string }> {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(wordUpper.toLowerCase())}`;
    const timeout = opts?.timeout ?? DICT_TIMEOUT_MS;
    const signal = opts?.signal;
    let lastErr: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const resp = await withTimeout(fetch(url, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit',
                headers: { 'Accept': 'application/json' },
                signal
            }), timeout, signal);
            if (resp.status === 200) {
                const data = await resp.json();
                const def = Array.isArray(data) && data[0]?.meanings?.[0]?.definitions?.[0]?.definition;
                console.info('[RemoteDict][dict-200]', { word: wordUpper, hasEn: !!def });
                return { status: 200, firstDefinition: typeof def === 'string' ? def : undefined };
            }
            if (resp.status === 404) {
                console.info('[RemoteDict][dict-404]', { word: wordUpper });
                return { status: 404 };
            }
            console.info('[RemoteDict][dict-status]', { word: wordUpper, status: resp.status });
            return { status: resp.status };
        } catch (e: any) {
            lastErr = e;
            // 轻退避
            await new Promise(r => setTimeout(r, 180));
        }
    }
    console.info('[RemoteDict][dict-ex]', { word: wordUpper, error: lastErr && (lastErr.message || String(lastErr)) });
    return { status: 0 };
}



