/// <reference types="vite/client" />

declare module 'react-dom/client';

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

declare module 'jspdf' {
    export class jsPDF {
        constructor(options?: any);
        setFont(font: string, style?: string): void;
        setFontSize(size: number): void;
        text(text: string, x: number, y: number, options?: any): void;
        addPage(): void;
        save(filename: string): void;
        internal: {
            pageSize: {
                getWidth(): number;
                getHeight(): number;
            };
        };
    }
}

declare module '@supabase/supabase-js' {
    export function createClient(url: string, key: string): any;
}

declare module 'tesseract.js' {
    export namespace Tesseract {
        interface Bbox {
            x0: number;
            y0: number;
            x1: number;
            y1: number;
        }
    }
    const Tesseract: {
        recognize(image: string, langs?: string, options?: any): Promise<{
            data: {
                words: {
                    text: string;
                    bbox: Tesseract.Bbox;
                }[];
            };
        }>;
    };
    export default Tesseract;
}
