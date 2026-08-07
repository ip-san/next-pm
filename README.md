# next-pm

next-pmは[Redmine](https://www.redmine.org/) — オープンソースのプロジェクト管理ツール — を、Next.js 16(App Router)・React 19・PostgreSQL・Drizzle ORMで再実装するプロジェクトです。目標はRedmineに似たアプリをゼロから作ることではなく、Redmineの実際の挙動(見た目上の機能一覧だけでなく、個別のビジネスルールまで)を再現することにあります。

- 機能・ドメインモデルの正本: 本家Redmine(`../redmine`)
- 副次参照: `../artisan-pm`(同じRedmine再実装のLaravel版。`docs/parity-checklist.md`を機能パリティのチェックリストとして参照している)

## 実装済みの機能

課題管理(トラッカー・ステータス・ワークフロー・フィールド必須/読取専用ルール・カスタムフィールド・関連・ウォッチャー)、ガントチャートとカレンダー、Wiki(版歴・マクロ・ページ名変更時のリダイレクト付き)、フォーラム、News、工数管理、複数種のSCMリポジトリ(Git/Subversion/Mercurial)のブラウジング/差分/blame閲覧とコミットメッセージ経由のチケット自動更新(`fixes #id`等)、保存済みクエリ、プロジェクト階層、ロールベースの権限、LDAP認証、二要素認証(TOTP+バックアップコード)、メール通知(課題の作成/更新、フォーラム投稿——Wiki編集とNews投稿は未通知)、REST API v1、PDF/CSV/ZIPエクスポート(課題・Wiki・ガント)、プロジェクト横断のアクティビティフィード・検索・Atomフィード、ブロック式にカスタマイズ可能なマイページ、管理画面からの一部アプリケーション設定変更。各機能がRedmine本家とどこまで一致しているかは`../artisan-pm/docs/parity-checklist.md`を参照。

## 技術スタック

| レイヤー | 採用技術 |
|---|---|
| フレームワーク | Next.js 16 (App Router)、React 19、TypeScript |
| ランタイム/パッケージマネージャ | Bun |
| データベース | PostgreSQL、Drizzle ORM |
| 認証 | 自前のJWTセッション(`jose`)、LDAP(`ldapts`)、2FA/TOTP |
| メール送信 | Nodemailer(SMTP)、`SMTP_HOST`未設定時はコンソール出力のみのfallback |
| PDF出力 | `@react-pdf/renderer` |
| バックグラウンド処理 | 自前の`jobs`テーブル+ポーリングworkerプロセス(`worker/index.ts`、Honoでヘルスチェックエンドポイントのみ提供) |
| フォーム/バリデーション | `react-hook-form` + `zod` |
| エラートラッキング | Sentry(`@sentry/nextjs`) |
| テスト | `bun test` |
| ローカル環境 | Docker Compose(PostgreSQLのみ。アプリ本体はホストで直接動かす) |

## セットアップ

```bash
bun install
docker compose -f docker/compose.yaml -p next-pm up -d postgres
cp .env.example .env.local
bun run db:migrate   # drizzle/ 配下に既にコミットされているマイグレーションを適用する
bun run db:seed      # admin/roles/statuses/priorities/trackers/workflow を投入
                      # — /projects/new や /issues/new が選択肢を描画できるようになるために必要
bun run dev
```

初回ログイン: `admin` / `admin`(Redmineの既定管理者アカウントと同じ規約)。ログイン後にパスワードを変更すること。

`.env.local`で設定が必要な主なもの:

- `JWT_SECRET` — セッション/2FA一時トークンの署名鍵。本番では必ず変更する。
- `TOTP_ENCRYPTION_KEY` — 64文字の16進数文字列(32バイト)。2FAのペアリングを開始する前に必須(`openssl rand -hex 32`で生成)。
- `SMTP_HOST`ほか — 未設定のままだとメールはコンソールに出力されるだけで実際には送信されない。
- `ATTACHMENTS_DIR` — 添付ファイルの保存先(既定`./storage/attachments`)。

スキーマ(`src/infrastructure/db/schema/*.ts`)を変更したときだけ`bun run db:generate`で新しいマイグレーションを生成する。

### 通知メールを実際に送るには

Server Action/Route Handlerは通知を`jobs`テーブルに積むだけで、実際のメール送信は別プロセスのworkerが5秒間隔のポーリングで行う(詳細は[`docs/design/notifications-and-jobs.md`](docs/design/notifications-and-jobs.md))。開発中に通知メールの送信結果を確認したい場合は、`dev`と並行してworkerも起動する:

```bash
bun run worker
```

workerはヘルスチェック用のHTTPサーバー(`/healthz`)もポート3001で立てる——他のローカルサービス(Docker Desktopなど)がそのポートを既に使っている場合は`WORKER_HEALTH_PORT`で変更する。

### リポジトリのブラウジング(SCM連携)を試すには

next-pmはGit/Subversion/Mercurialのいずれも、対応するCLIバイナリ(`git`/`svn`/`hg`)をシェルアウトして操作する——専用のライブラリやプラグインではなく、サーバーに実際にそのバイナリがインストールされている必要がある。接続するリポジトリはサーバー上の絶対パス(Git/Mercurial)またはURL(Subversion、`file://`/`http(s)://`/`svn(+ssh)://`)で指定する。

## テスト

```bash
bun test        # domain/ と application/ のユニットテスト
bun run lint
bunx tsc --noEmit
```

このリポジトリの規約として、テストは`domain/`(純粋関数)と`application/`(ユースケース、リポジトリはフェイクでモック)に集中させ、`infrastructure/`(実際のDB/外部CLIを操作するアダプタ)は基本的にユニットテストしない——代わりに実際のPostgreSQL/Git/SVN/Mercurialに対する使い捨てデータでの動作確認を機能追加のたびに行う。

## アーキテクチャ

```
src/domain/          # 純粋TS。DB/Next依存なし。型定義・認可判定・ワークフロー判定等の純粋関数・リポジトリのport(インターフェース)
src/application/     # ユースケース関数。domainのportにのみ依存(Drizzleを直接importしない)
src/infrastructure/  # domainのportのDrizzle実装、メール/LDAP/SCMアダプタ
src/interface/       # Server Actionの実装本体、セッション/CSRF検証などの横断ヘルパー
src/app/             # Next.js App Router(ページはServer Component、薄い委譲層)
src/proxy.ts         # CSRFトークンcookieの発行のみ(Next.js 16では"middleware"は"proxy"に改称された)
worker/              # 通知ジョブを処理する別プロセス(ポーリング、cron的な時刻トリガーは無い)
```

レイヤー全体の俯瞰図、ドメインモデル全体のER図、権限モデル、リクエストライフサイクル、課題のワークフロー、通知/バックグラウンドジョブのパイプラインは、Mermaid図付きで[`docs/design/`](docs/design/README.md)に詳しく書かれています。まずそこから読むのがおすすめです——このREADMEはセットアップと、以下に挙げる設計判断の要点にとどめています。

## 注目すべき設計判断

コードベース全体で繰り返し現れるパターンで、変更を加える前に知っておく価値があるもの:

- **認可判定は`can()`一関数に集約されている**。`domain/authorization/authorization-service.ts`がRedmineの`Project#allows_to?` → `User#allowed_to?` → `Role#allowed_to?`の判定順序をそのまま1つの純関数に落とし込んでおり、ページ・Server Action・Route Handlerはこれを呼ぶだけでロール解決ロジックを自前で持たない(詳細は[`docs/design/authorization.md`](docs/design/authorization.md))。
- **中央集権的な認証ミドルウェアは意図的に置いていない**。`src/proxy.ts`(Next.js 16の`middleware.ts`改称後の姿)はCSRFトークンcookieの発行のみを行い、ログイン強制は各ページ/Server Action/Route Handlerがその場で`currentUserFromCookies()`を呼んで判断する——共通ガードが無い分、新しい保護対象ページを追加するたびに認証チェックの書き忘れが無いか意識する必要がある。
- **「疑似ポリモーフィック」な列は、DB制約より将来の拡張性を優先している**。`watchers.watchableType`・`journals.journalizedType`・`custom_values.customizedType`・`attachments.containerType`・`scm_repositories.vendor`はいずれもDBレベルのenum制約を持たない`text`列で、TypeScript側の閉じたunion型だけが正——「今はIssueだけ」「今はgit/subversion/mercurialだけ」という値の集合を、後から型を書き換えるだけで広げられるようにするための選択(詳細は[`docs/design/domain-model.md`](docs/design/domain-model.md)の表記注意)。
- **通知は意図的にシンプル**。Redmineの`mail_notification`ティア(all/selected/only_my_events/...)や`Setting.notified_events`によるイベント単位のオプトインは実装していない——候補者プールをunionしてから一括フィルタする、という1本道のロジックのみ(詳細は[`docs/design/notifications-and-jobs.md`](docs/design/notifications-and-jobs.md))。Wiki編集・News投稿はこの通知パイプライン自体に接続されておらず、現状メールが送られない。
- **時刻トリガーの非同期処理(cron相当)は一つも存在しない**。SCMの自動フェッチも添付ファイルの定期GCも、next-pmでは「ユーザー操作の瞬間に同期的に行う」か「次にそのデータに触れた瞬間についでに行う」遅延実行のどちらかで済ませている——本当のスケジューラが必要な機能を追加する際は、`worker/`のポーリングループに`jobType`を足すだけでは実現できないことに注意。
- **マイページのブロック並べ替えはドラッグ&ドロップではなくボタン操作**。Redmine本家(および姉妹Laravel実装)はマウス専用のドラッグ&ドロップだが、next-pmは上下/列移動をそれぞれ独立したフォームのボタンにしている——キーボード操作でも欠けなく完結する。
- **SCMアダプタはRedmineの「サブクラス」ではなく、1つのport(`ScmBrowser`)+vendorごとの実装クラス**。`git`/`svn`/`hg`いずれも同じ`listTree`/`readFile`/`log`/`diff`/`blame`インターフェースを実装し、`infrastructure/scm/browser-for-vendor.ts`が`ScmRepository.vendor`の値に応じて実装を選ぶ——呼び出し側(ページ・ユースケース関数)はどのVCSかを意識しない。
