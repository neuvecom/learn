// ポータルのページから共通キットとコースのレッスン一覧（course.json）を扱うための補助
import type { Course } from '../data/courses';

export interface Lesson {
    id: string;
    title: string;
    url: string;
}

export interface CourseProgress {
    lessons: Lesson[];
    done: Set<string>;
    /** 次に読むレッスン（全部終わっていれば null） */
    next: Lesson | null;
}

// public/kit/neuve-learn.js は Vite を通さずに配信するので、実行時の URL から読み込む
type Kit = typeof import('../../public/kit/neuve-learn.js');
let kitPromise: Promise<Kit> | undefined;
export function loadKit(): Promise<Kit> {
    const src = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/kit/neuve-learn.js`;
    kitPromise ??= import(/* @vite-ignore */ src);
    return kitPromise;
}

/** コースが公開している course.json を読む。まだ用意されていなければ null */
export async function fetchLessons(course: Course): Promise<Lesson[] | null> {
    try {
        const res = await fetch(new URL('course.json', course.url));
        if (!res.ok) return null;
        const data = await res.json();
        return (data.lessons as Lesson[]).map((lesson) => ({
            ...lesson,
            url: new URL(lesson.url, course.url).href,
        }));
    } catch {
        return null;
    }
}

export async function loadProgress(course: Course, lastLessonId?: string): Promise<CourseProgress | null> {
    const kit = await loadKit();
    const [lessons, done] = await Promise.all([fetchLessons(course), kit.getCompleted(course.id)]);
    if (!lessons) return null;
    // 最後に完了したレッスンの次から探し、なければ先頭から未完了のものを探す
    const start = Math.max(0, lessons.findIndex((l) => l.id === lastLessonId) + 1);
    const next =
        lessons.slice(start).find((l) => !done.has(l.id)) ?? lessons.find((l) => !done.has(l.id)) ?? null;
    return { lessons, done: new Set(lessons.filter((l) => done.has(l.id)).map((l) => l.id)), next };
}
