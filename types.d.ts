declare module 'react';
declare module 'react/jsx-runtime';

declare module 'react-dom/client';
declare module 'tesseract.js';

declare module 'uuid' {
    export function v4(): string;
}

declare module 'ua-parser-js' {
    export class UAParser {
        constructor();
        getResult(): {
            browser: { name?: string; version?: string };
            os: { name?: string; version?: string };
            device: { model?: string; type?: string };
        };
    }
}

declare module 'pinyin-pro' {
    export function pinyin(text: string, options?: { toneType?: string }): string;
}

declare module 'openai' {
    export default class OpenAI {
        constructor(config: {
            baseURL?: string;
            apiKey: string;
            dangerouslyAllowBrowser?: boolean;
        });
        chat: {
            completions: {
                create(params: any): Promise<any>;
            };
        };
    }
}



declare module '@supabase/supabase-js' {
    export function createClient(url: string, key: string): any;
}
