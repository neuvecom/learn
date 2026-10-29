// neuve 学習コース共通キット
// 各コースのページから <script type="module" src="https://neuve.com/learn/kit/neuve-learn.js"> で読み込む。
// - Google / メールリンクのログイン状態を全コースで共有する（同じ neuve.com ドメインなので自動で共有される）
// - レッスンの完了状況を Firestore に保存し、端末をまたいで同期する
// - <neuve-auth> と <neuve-lesson-done> の 2 つの Web コンポーネントを提供する
//
// ここの Firebase 設定値はブラウザに公開される前提の値で、秘密情報ではない。
// データの保護は Firestore のセキュリティルール（how-to-use-vcv-rack-ja/firestore.rules）で行う。
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    getFirestore,
    serverTimestamp,
    setDoc,
    writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: 'AIzaSyDhRoHgKeMiJbVf5Hy_2i2z68csyUl4sU8',
    // Google ログイン画面に「auth.neuve.com に移動」と出すため、Firebase Hosting のカスタムドメインを使う
    authDomain: 'auth.neuve.com',
    projectId: 'how-to-use-vcv-rack-ja',
    storageBucket: 'how-to-use-vcv-rack-ja.firebasestorage.app',
    messagingSenderId: '615978577733',
    appId: '1:615978577733:web:e816279e7f4b8b253f582c',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = 'ja';
export const db = getFirestore(app);

// ポータル（このファイルの 1 つ上の階層）の URL
export const portalUrl = new URL('../', import.meta.url).href;
export const mypageUrl = new URL('mypage/', portalUrl).href;

/** ログインページの URL。ログイン後は next（同じオリジンのページ）へ戻る */
export function loginUrl(next = location.href) {
    const url = new URL('login/', portalUrl);
    url.searchParams.set('next', next);
    return url.href;
}

/** Firestore のドキュメント ID に使えるよう「/」を置き換える */
export function toDocId(lessonId) {
    return String(lessonId).replaceAll('/', '__');
}

/** ドキュメント ID からレッスン ID に戻す */
export function fromDocId(docId) {
    return docId.replaceAll('__', '/');
}

const lessonsRef = (uid, courseId) => collection(db, 'users', uid, 'courses', courseId, 'lessons');

/** ログイン状態の変化を購読する。戻り値は購読解除の関数 */
export function onUser(callback) {
    return onAuthStateChanged(auth, callback);
}

/** ログインが確定するまで待って、現在のユーザー（未ログインなら null）を返す */
export function currentUser() {
    return auth.authStateReady().then(() => auth.currentUser);
}

/** 指定コースの完了済みレッスン ID の Set を返す（未ログインなら空） */
export async function getCompleted(courseId) {
    const user = await currentUser();
    if (!user) return new Set();
    const snapshot = await getDocs(lessonsRef(user.uid, courseId));
    return new Set(snapshot.docs.map((d) => fromDocId(d.id)));
}

/**
 * 指定コースの完了記録を Map（レッスン ID → 記録）で返す（未ログインなら空）。
 * 記録の local には、コース側が保存した端末の値（localStorage の文字列）が入っていることがある
 */
export async function getCompletedRecords(courseId) {
    const user = await currentUser();
    if (!user) return new Map();
    const snapshot = await getDocs(lessonsRef(user.uid, courseId));
    return new Map(snapshot.docs.map((d) => [fromDocId(d.id), d.data()]));
}

/** local（端末に保存していた値）は 4000 文字までの文字列だけ記録する */
function lessonData(local) {
    const data = { completedAt: serverTimestamp() };
    if (typeof local === 'string' && local.length <= 4000) data.local = local;
    return data;
}

/**
 * レッスンの完了を記録する（done=false で取り消す）。未ログインなら false を返して何もしない。
 * local に端末の保存値を渡すと、別の端末で同じ値を復元できる
 */
export async function setCompleted(courseId, lessonId, done, local) {
    const user = await currentUser();
    if (!user) return false;
    const lessonRef = doc(lessonsRef(user.uid, courseId), toDocId(lessonId));
    if (done) {
        await setDoc(lessonRef, lessonData(local));
        await setDoc(doc(db, 'users', user.uid, 'courses', courseId), {
            lastLessonId: String(lessonId),
            updatedAt: serverTimestamp(),
        });
    } else {
        await deleteDoc(lessonRef);
    }
    return true;
}

/** まとめて書き込む（1 回のバッチは 500 件までなので分ける） */
async function writeLessons(uid, courseId, entries) {
    for (let i = 0; i < entries.length; i += 400) {
        const batch = writeBatch(db);
        entries.slice(i, i + 400).forEach(([id, local]) => {
            batch.set(doc(lessonsRef(uid, courseId), toDocId(id)), lessonData(local));
        });
        await batch.commit();
    }
}

/**
 * 端末に保存済みの完了レッスン（localStorage など）とサーバーの記録を突き合わせる。
 * 端末にしかないものはサーバーへ書き込み、両方を合わせた Set を返す（どちらの記録も消さない）。
 * 未ログインなら localIds をそのまま返す。
 */
export async function syncCompleted(courseId, localIds = []) {
    const local = new Set([...localIds].map(String));
    const user = await currentUser();
    if (!user) return local;
    const remote = await getCompleted(courseId);
    await writeLessons(
        user.uid,
        courseId,
        [...local].filter((id) => !remote.has(id)).map((id) => [id, undefined])
    );
    return new Set([...remote, ...local]);
}

/**
 * localStorage にレッスンごとのキー（prefix + レッスン ID）で進捗を保存しているコース向けの同期。
 * - ログイン中は、端末にしかない記録をサーバーへ上げ、サーバーにしかない記録を端末へ書き戻す
 * - 以後 localStorage にそのキーが書かれる・消されるたびに、サーバーへも反映する
 * isDone(value) で「完了」とみなす値を判定する（既定はキーがあれば完了）。
 * 端末へ書き戻したときは window に neuve-learn:synced イベント（detail: { course, restored }）を発行する。
 */
export function mirrorLocalStorage({ course, prefix, isDone = () => true }) {
    const done = (value) => {
        try {
            return value != null && isDone(value);
        } catch {
            return false;
        }
    };

    // 以後の書き込み・削除をサーバーへ反映する
    const { setItem, removeItem } = Storage.prototype;
    Storage.prototype.setItem = function (key, value) {
        setItem.call(this, key, value);
        if (this === localStorage && String(key).startsWith(prefix)) {
            const id = String(key).slice(prefix.length);
            setCompleted(course, id, done(String(value)), String(value)).catch((error) => console.error(error));
        }
    };
    Storage.prototype.removeItem = function (key) {
        removeItem.call(this, key);
        if (this === localStorage && String(key).startsWith(prefix)) {
            setCompleted(course, String(key).slice(prefix.length), false).catch((error) => console.error(error));
        }
    };

    // ログインしたら突き合わせる
    return onUser(async (user) => {
        if (!user) return;
        try {
            const local = new Map();
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith(prefix)) {
                    const value = localStorage.getItem(key);
                    if (done(value)) local.set(key.slice(prefix.length), value);
                }
            }
            const remote = await getCompletedRecords(course);
            await writeLessons(
                user.uid,
                course,
                [...local].filter(([id]) => !remote.has(id))
            );
            const restored = [];
            remote.forEach((record, id) => {
                if (!local.has(id) && typeof record.local === 'string') {
                    setItem.call(localStorage, prefix + id, record.local);
                    restored.push(id);
                }
            });
            if (restored.length > 0) {
                window.dispatchEvent(new CustomEvent('neuve-learn:synced', { detail: { course, restored } }));
            }
        } catch (error) {
            console.error('進捗の同期に失敗しました', error);
        }
    });
}

/** マイページ用: コースごとの最終学習レッスン（{ [courseId]: { lastLessonId, updatedAt } }） */
export async function getCourseSummaries() {
    const user = await currentUser();
    if (!user) return {};
    const snapshot = await getDocs(collection(db, 'users', user.uid, 'courses'));
    return Object.fromEntries(snapshot.docs.map((d) => [d.id, d.data()]));
}

export async function logout() {
    await signOut(auth);
}

// ---------------------------------------------------------------------------
// <neuve-auth> … ヘッダーなどに置くログイン状態の表示
//   未ログイン: 「ログイン」 / ログイン中: 「マイページ」「ログアウト」
//   色は CSS カスタムプロパティ --neuve-auth-color / --neuve-auth-hover で貼り先から変えられる
//   hide-mypage 属性を付けると「マイページ」を出さない（ポータルのようにナビに別途あるとき）
// ---------------------------------------------------------------------------
class NeuveAuth extends HTMLElement {
    connectedCallback() {
        if (this.shadowRoot) return;
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <style>
                :host { display: inline-flex; align-items: center; gap: 0.75rem; font: inherit; white-space: nowrap; }
                [hidden] { display: none !important; }
                a, button {
                    color: var(--neuve-auth-color, inherit); text-decoration: none; background: none;
                    border: none; padding: 0; font: inherit; cursor: pointer;
                }
                a:hover, button:hover { color: var(--neuve-auth-hover, inherit); text-decoration: underline; }
            </style>
            <a part="login" data-login hidden>ログイン</a>
            <a part="mypage" data-mypage hidden>マイページ</a>
            <button part="logout" type="button" data-logout hidden>ログアウト</button>
        `;
        const login = root.querySelector('[data-login]');
        const mypage = root.querySelector('[data-mypage]');
        const logoutButton = root.querySelector('[data-logout]');
        mypage.href = mypageUrl;
        login.addEventListener('click', () => {
            login.href = loginUrl();
        });
        login.href = loginUrl();
        logoutButton.addEventListener('click', async () => {
            await logout();
        });
        this._unsubscribe = onUser((user) => {
            login.hidden = Boolean(user);
            mypage.hidden = !user || this.hasAttribute('hide-mypage');
            logoutButton.hidden = !user;
        });
    }

    disconnectedCallback() {
        this._unsubscribe?.();
    }
}

// ---------------------------------------------------------------------------
// <neuve-lesson-done course="korg-gadget" lesson="stage1/lesson-1-1">
//   レッスン末尾に置く「完了にする」ボタン。未ログイン時はログインへの案内を出す。
//   状態が変わると change イベント（detail: { course, lesson, done }）を発行する。
// ---------------------------------------------------------------------------
class NeuveLessonDone extends HTMLElement {
    connectedCallback() {
        if (this.shadowRoot) return;
        const course = this.getAttribute('course');
        const lesson = this.getAttribute('lesson');
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <style>
                :host {
                    display: block; margin: 2rem 0; padding: 1rem 1.25rem; font: inherit;
                    border: 1px solid var(--neuve-border, rgba(128, 128, 128, 0.35)); border-radius: 0.5rem;
                }
                [hidden] { display: none !important; }
                p { margin: 0; }
                .row { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
                a { color: var(--neuve-accent, #e8710a); }
                button {
                    padding: 0.5rem 1rem; border-radius: 999rem; font: inherit; font-weight: 600; cursor: pointer;
                    border: 1px solid var(--neuve-accent, #e8710a); background: var(--neuve-accent, #e8710a);
                    color: var(--neuve-on-accent, #fff);
                }
                button.done { background: transparent; color: var(--neuve-accent, #e8710a); }
                button:disabled { opacity: 0.6; cursor: wait; }
            </style>
            <p data-signed-out hidden><a data-login>ログイン</a>すると、このレッスンの完了を記録して、どの端末からでも続きから学べます。</p>
            <div class="row" data-signed-in hidden>
                <button type="button" data-toggle>このレッスンを完了にする</button>
                <span data-message aria-live="polite"></span>
            </div>
        `;
        const signedOut = root.querySelector('[data-signed-out]');
        const signedIn = root.querySelector('[data-signed-in]');
        const button = root.querySelector('[data-toggle]');
        const message = root.querySelector('[data-message]');
        root.querySelector('[data-login]').href = loginUrl();
        let done = false;

        const render = () => {
            button.textContent = done ? '完了を取り消す' : 'このレッスンを完了にする';
            button.classList.toggle('done', done);
            message.textContent = done ? '✓ 完了済み' : '';
        };

        this._unsubscribe = onUser(async (user) => {
            signedOut.hidden = Boolean(user);
            signedIn.hidden = !user;
            if (!user) return;
            try {
                done = (await getCompleted(course)).has(lesson);
                render();
            } catch (error) {
                console.error(error);
                message.textContent = '進捗を読み込めませんでした。';
            }
        });

        button.addEventListener('click', async () => {
            button.disabled = true;
            try {
                await setCompleted(course, lesson, !done);
                done = !done;
                render();
                this.dispatchEvent(new CustomEvent('change', { detail: { course, lesson, done }, bubbles: true }));
            } catch (error) {
                console.error(error);
                message.textContent = '保存できませんでした。時間をおいて再度お試しください。';
            } finally {
                button.disabled = false;
            }
        });
    }

    disconnectedCallback() {
        this._unsubscribe?.();
    }
}

if (!customElements.get('neuve-auth')) customElements.define('neuve-auth', NeuveAuth);
if (!customElements.get('neuve-lesson-done')) customElements.define('neuve-lesson-done', NeuveLessonDone);

// モジュールを使わないページ（Jekyll や Docusaurus のインラインスクリプト）からも使えるようにする
const api = {
    auth,
    db,
    portalUrl,
    mypageUrl,
    loginUrl,
    onUser,
    currentUser,
    getCompleted,
    getCompletedRecords,
    setCompleted,
    syncCompleted,
    mirrorLocalStorage,
    getCourseSummaries,
    logout,
};
window.neuveLearn = api;
window.dispatchEvent(new CustomEvent('neuve-learn:ready', { detail: api }));
