# neuve 学習コース ポータル

https://neuve.com/learn/ で公開している、neuve の学習コース共通ポータルです。

- **コース一覧（LP）**: 全コースを紹介し、ログイン中は各コースの進み具合と「続きから」を表示
- **ログイン**（`/learn/login/`）: Google アカウント、またはメールリンク（パスワード不要）
- **マイページ**（`/learn/mypage/`）: 受講中コースの進捗・次に読むレッスン・レッスン一覧と、これから始められるコース
- **共通キット**（`/learn/kit/neuve-learn.js`）: 各コースが読み込むスクリプト。ログイン状態の共有とレッスン完了の同期を担う

## 仕組み

- 認証とデータは Firebase（プロジェクト `how-to-use-vcv-rack-ja`）の Authentication と Cloud Firestore
- コースはすべて neuve.com 配下にあるため、Firebase のログイン状態（ブラウザのオリジン単位で保存）が全コースで共有される
- 進捗は `users/{uid}/courses/{courseId}/lessons/{lessonId}`、最後に完了したレッスンは `users/{uid}/courses/{courseId}` に保存
- セキュリティルールは [how-to-use-vcv-rack-ja の `firestore.rules`](https://github.com/neuvecom/how-to-use-vcv-rack-ja/blob/main/firestore.rules) で全コース共通に管理
- 各コースはビルド時に `course.json`（レッスン一覧）を公開し、マイページがそれを読んで進捗率を出す

```json
{ "id": "vcv-rack", "title": "ゼロからの VCV Rack", "lessons": [{ "id": "basics/install", "title": "インストールと初期設定", "url": "basics/install/" }] }
```

## コースへの組み込み方

```html
<script type="module" src="https://neuve.com/learn/kit/neuve-learn.js"></script>

<!-- ヘッダー: コース一覧（ポータルへ戻る）/ ログイン / マイページ・ログアウト -->
<neuve-auth></neuve-auth>

<!-- レッスン末尾: 完了ボタン（未ログイン時はログインへの案内） -->
<neuve-lesson-done course="korg-gadget" lesson="stage1/lesson-1-1"></neuve-lesson-done>
```

既に独自の進捗 UI（localStorage）を持つコースは、`window.neuveLearn`（または ES モジュールの import）の API で同期します。

| API | 内容 |
| --- | --- |
| `onUser(callback)` | ログイン状態の変化を購読 |
| `getCompleted(courseId)` | 完了済みレッスン ID の Set |
| `setCompleted(courseId, lessonId, done)` | 完了の記録・取り消し |
| `syncCompleted(courseId, localIds)` | 端末の記録とサーバーの記録を合わせる（どちらも消さない） |
| `mirrorLocalStorage({ course, prefix, isDone })` | レッスンごとに localStorage へ保存しているコース向け。端末とサーバーを双方向に同期し、以後の保存もサーバーへ反映 |
| `loginUrl(next)` / `mypageUrl` | ポータルのログイン・マイページ URL |

色は CSS カスタムプロパティ（`--neuve-auth-color`・`--neuve-auth-hover`・`--neuve-accent`・`--neuve-on-accent`・`--neuve-border`）で貼り先から変えられます。

## コースを追加するとき

1. `src/data/courses.ts` にコースを追加
2. 進捗を記録するなら、`firestore.rules` の `isCourse` にコース ID を追加して公開
3. コース側で `course.json` を書き出し、キットを組み込む

## 開発

```bash
npm install
npm run dev      # http://localhost:4321/learn/
npm run build
```

`main` へのマージで GitHub Actions が GitHub Pages にデプロイします（Settings → Pages → Source を「GitHub Actions」に設定）。
