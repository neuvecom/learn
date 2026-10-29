// ポータルに並べるコースの一覧
// progress: true のコースは、公開 URL 直下の course.json（レッスン一覧）を読んでマイページに進捗を出す
export interface Course {
    id: string;
    title: string;
    summary: string;
    url: string;
    tags: string[];
    progress: boolean;
}

export const courses: Course[] = [
    {
        id: 'analytics',
        title: 'GA4 のトリセツ',
        summary: 'Google アナリティクス 4 の使い方・数値の見方・活用法をゼロから体系的に学ぶ。',
        url: 'https://neuve.com/how-to-use-analytics/',
        tags: ['Web 解析', '入門〜実践'],
        progress: true,
    },
    {
        id: 'github',
        title: 'GitHub 完全ガイド',
        summary: 'GitHub の基本から応用、AI 活用までを網羅的に解説する完全ガイド。',
        url: 'https://neuve.com/how-to-use-github/',
        tags: ['開発', '入門〜応用'],
        progress: true,
    },
    {
        id: 'claude-code',
        title: 'Claude Code ベストプラクティス',
        summary: 'Claude Code を効果的に使うためのベストプラクティスを日本語で解説。',
        url: 'https://neuve.com/how-to-use-claude-code/',
        tags: ['AI', '開発'],
        progress: true,
    },
    {
        id: 'vcv-rack',
        title: 'ゼロからの VCV Rack',
        summary: 'DTM がまったく初めての人でもわかる、VCV Rack の日本語ハウツー。',
        url: 'https://neuve.com/how-to-use-vcv-rack-ja/',
        tags: ['音楽', 'モジュラーシンセ'],
        progress: true,
    },
    {
        id: 'korg-gadget',
        title: 'KORG Gadget 学習サイト',
        summary: 'Nintendo Switch 版 KORG Gadget で始める、完全初心者向けの音楽制作チュートリアル。',
        url: 'https://neuve.com/LearnKORGGadget/',
        tags: ['音楽', 'DTM 入門'],
        progress: true,
    },
    {
        id: 'sxc-1',
        title: 'CASIO SXC-1 を遊び倒す',
        summary: 'ポータブル・サンプラー SXC-1 の操作・仕様・遊び方をまとめた非公式ノート。',
        url: 'https://neuve.com/sxc-1-playbook/',
        tags: ['音楽', 'サンプラー'],
        progress: false,
    },
];

// base を考慮したサイト内リンクを作る
export function url(path = ''): string {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    return `${base}/${path.replace(/^\//, '')}`;
}
