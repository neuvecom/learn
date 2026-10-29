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
    authDomain: 'how-to-use-vcv-rack-ja.firebaseapp.com',
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

/** レッスンの完了を記録する（done=false で取り消す）。未ログインなら false を返して何もしない */
export async function setCompleted(courseId, lessonId, done) {
    const user = await currentUser();
    if (!user) return false;
    const lessonRef = doc(lessonsRef(user.uid, courseId), toDocId(lessonId));
    if (done) {
        await setDoc(lessonRef, { completedAt: serverTimestamp() });
        await setDoc(doc(db, 'users', user.uid, 'courses', courseId), {
            lastLessonId: String(lessonId),
            updatedAt: serverTimestamp(),
        });
    } else {
        await deleteDoc(lessonRef);
    }
    return true;
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
    const missing = [...local].filter((id) => !remote.has(id));
    // 1 回のバッチは 500 件までなので分けて書き込む
    for (let i = 0; i < missing.length; i += 400) {
        const batch = writeBatch(db);
        missing.slice(i, i + 400).forEach((id) => {
            batch.set(doc(lessonsRef(user.uid, courseId), toDocId(id)), { completedAt: serverTimestamp() });
        });
        await batch.commit();
    }
    return new Set([...remote, ...local]);
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
            mypage.hidden = !user;
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
    setCompleted,
    syncCompleted,
    getCourseSummaries,
    logout,
};
window.neuveLearn = api;
window.dispatchEvent(new CustomEvent('neuve-learn:ready', { detail: api }));
