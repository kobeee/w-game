import { LocalDictionary } from './LocalDictionary';
import { generateLemmas } from './Lemmatizer';

export type LocalLookupResult = {
    hit: boolean;
    zhDefinition?: string;
};

export async function localLookupWithLemmatize(dict: LocalDictionary, wordUpper: string): Promise<LocalLookupResult> {
    const candidates = generateLemmas(wordUpper.toUpperCase());
    for (const cand of candidates) {
        const r = dict.get(cand);
        if (r.valid) {
            return {
                hit: true,
                zhDefinition: r.definition || undefined
            };
        }
    }
    return { hit: false };
}


