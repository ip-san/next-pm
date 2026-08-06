# リクエストライフサイクル

## ミドルウェア相当の層

next-pmには**Next.js 16の`proxy.ts`(旧`middleware.ts`)以外に、中央集権的な認証ミドルウェアは存在しない**。認証チェックは各ページ(Server Component)・各Server Action・各Route Handlerが個別に、その場で行う。

```mermaid
flowchart TB
    Req["HTTPリクエスト"] --> Proxy["src/proxy.ts<br/>(旧middleware.ts)<br/>CSRFトークンcookieの発行のみ"]
    Proxy --> Route{"リクエスト種別"}
    Route -->|"ページ表示(GET)"| Page["app/**/page.tsx<br/>(Server Component)"]
    Route -->|"フォーム送信"| Action["interface/actions/*.ts<br/>(Server Action)"]
    Route -->|"REST API / Webhook等"| Handler["app/api/**/route.ts<br/>(Route Handler)"]

    Page --> AuthCheck1["currentUserFromCookies()を<br/>その場で呼ぶ<br/>(無ければnotFound/redirect)"]
    Action --> AuthCheck2["同上"]
    Handler --> AuthCheck3["currentUserFromAuthorizationHeader()<br/>を先に試し、無ければCookie"]
```

- `src/proxy.ts`がやっていることは1つだけ: リクエストに`next_pm_csrf`cookieが無ければ発行する(ダブルサブミット方式のCSRF対策用)。**未ログインをリダイレクトする機能は無い**。
- 「保護されたページ」は`page.tsx`の中で`const user = await currentUserFromCookies(); if (!user) redirect("/login")`のようなチェックを個別に書く——共通ガードの仕組みは無く、書き忘れれば素通りする(レビュー観点として明示しておく価値がある)。

## セッション/認証の実体

```mermaid
flowchart LR
    Cookie["next_pm_session cookie<br/>(SESSION_COOKIE_NAME)"] --> Verify["verifySessionToken()<br/>(jose, HS256, 7日TTL)"]
    Verify --> PurposeCheck{"JWTのpurposeクレームが<br/>'session'か?"}
    PurposeCheck -->|No| Reject["無効(nullを返す)"]
    PurposeCheck -->|Yes| Lookup["DrizzleUserRepository.findById"]

    AuthHeader["Authorization: Bearer &lt;apiKey&gt;<br/>またはBasic認証(ユーザー名=apiKey)"] --> ApiLookup["DrizzleUserRepository.findByApiKey"]
```

- `purpose: "session"`というクレームは意図的な作り込み——2FA未完了状態を表す一時トークン(同じくJWT、`userId`クレームを持つ)と、同じ`JWT_SECRET`で署名されていても**構造的に区別**するためのガード。`purpose`が一致しないトークンは即座に無効。
- REST API(`app/api/v1/**`)は`Authorization`ヘッダのAPIキーを先に試し、無ければCookieにフォールバックする`resolveUser()`をルートごとに定義している(共通ヘルパーではなく各route.tsが同じ形を繰り返す)。

## CSRF検証

`interface/http/csrf.ts`の`verifyCsrf()`はダブルサブミットcookie方式(`next_pm_csrf`cookie値と`x-csrf-token`ヘッダを比較)。**呼ばれるのはRoute Handler(`app/api/**/route.ts`)だけ**——Server Action(`interface/actions/*.ts`)からは一度も呼ばれない。Server ActionはNext.js自体が同一オリジン検証を組み込みで行うため、二重にCSRF検証を積む必要が無いという判断。

Route Handler内でも、**Cookie経由で認証された場合のみ**CSRF検証を行う(`viaCookie`フラグで分岐) — APIキー/Basic認証はブラウザの暗黙的な資格情報を伴わないため、CSRFの対象外(Redmine本家のトークン認証時の`protect_from_forgery`スキップと同じ理屈)。

## 4層構成の実際の呼び出しチェーン

READMEに書かれている`domain → application → infrastructure → interface → app`という層構成が、実コードでどこまで徹底されているかを確認した:

```mermaid
flowchart LR
    subgraph Write["書き込み系(徹底されている)"]
        AppPage1["app/.../page.tsx<br/>(フォームを描画)"] --> Action1["interface/actions/issue-actions.ts<br/>createIssueFormAction"]
        Action1 --> UseCase1["application/issues/create-issue.ts<br/>createIssue()"]
        UseCase1 --> Repo1["infrastructure/db/repositories/<br/>issue-repository.ts"]
        Repo1 --> Domain1["domain/issue/entity.ts<br/>(型のみ)"]
    end

    subgraph ReadSimple["単純な詳細読み取り(application層を飛ばす例)"]
        AppPage2["app/.../issues/[id]/page.tsx"] -.->|"直接呼ぶ"| Repo2["15個程度のDrizzleリポジトリを<br/>その場でnewして呼ぶ"]
        AppPage2 -.-> Domain2["can() / isPrivateIssueVisible() /<br/>allowedNewStatusIds() を<br/>ページの中で直接呼ぶ"]
    end

    subgraph ReadAgg["横断集計読み取り(application層を経由する例)"]
        AppPage3["app/.../activity/page.tsx"] --> UseCase3["application/activity/<br/>list-project-activity.ts"]
        UseCase3 --> Repo3["9個のリポジトリを<br/>fan-outして集約"]
    end
```

- **書き込みは例外なくServer Action → application層のユースケース関数**という経路を通る。
- **1画面ぶんの単純な詳細表示**(例: 課題詳細ページ)は、application層を経由せずページ(Server Component)がリポジトリ・ドメイン純関数を直接呼ぶことが多い——「単一エンティティ+その周辺情報をそのまま並べるだけ」の読み取りは薄いページ実装で済ませる、という次善の判断。
- **複数のリポジトリを横断して合成する読み取り**(アクティビティフィード、検索、マイページ、管理設定画面)は`application/`配下に専用の関数を置く——artisan-pmの「Serviceを必ず経由する」ほど厳格ではないが、「非自明な集約ロジックはapplication層に置く」という一貫性は保たれている。

## 例: ステータス更新→通知エンキューまでのフルパス

```mermaid
sequenceDiagram
    participant U as ユーザー(ブラウザ)
    participant A as updateIssueStatusAction
    participant Use as application/issues/update-issue.ts
    participant WF as WorkflowRepository
    participant FP as WorkflowFieldPermissionRepository
    participant Repo as IssueRepository
    participant J as JournalRepository
    participant N as enqueueNotification()
    participant Jobs as jobsテーブル

    U->>A: フォーム送信(FormData)
    A->>A: zodでパース、失敗ならエラーを返して終了
    A->>A: currentUserFromCookies()
    A->>Repo: findById(issueId) / findById(projectId)
    A->>A: isPrivateIssueVisible() で非公開課題の可視性チェック
    A->>A: can({permission: "edit_issues"}) OR<br/>(本人 AND can({permission: "edit_own_issues"}))
    A->>Use: updateIssue(repos, input)
    Use->>Use: before = issueRepository.findById(id)(再取得)
    Use->>WF: listForTracker(...) — ステータス変更がある場合のみ
    Use->>Use: canTransitionTo() — 不可ならWorkflowTransitionDeniedError
    Use->>FP: listForTracker(...)
    Use->>Use: readonly除去 → required検証
    Use->>Repo: update(id, lockVersion, changes)
    Use->>J: diffIssueChanges()の結果、または notes が非空ならJournal作成
    Use-->>A: 更新後のIssue
    A->>A: 担当者(グループなら展開)・非公開可視性フィルタ済みメンバー・<br/>ウォッチャーを集める
    A->>N: enqueueNotification({recipientGroups, excludeUserId: 自分, subject, body})
    N->>Jobs: (受信者が1人以上いれば) INSERT INTO jobs
    A->>A: revalidatePath(該当ページ)
    A-->>U: 画面が最新化される(メール送信自体はここでは起きない)
```

実際にメールが送られるまでの後半(ワーカーがジョブを拾ってから)は[`notifications-and-jobs.md`](notifications-and-jobs.md)を参照。

## REST API(`/api/v1/**`)の特徴

ダッシュボードページと同じ`resolveActor`/`can()`/リポジトリのパターンを踏襲しつつ、次の点が異なる:

- 認証はAPIキー(`Authorization`ヘッダ)優先、Cookieはフォールバック。
- 応答は`NextResponse.json(...)`(JSXではない)。
- 書き込み系は、Cookie認証の場合のみCSRF検証を通す。
- 使うユースケース関数はダッシュボードのServer Actionと**同じもの**(例: `POST /api/v1/issues`も`application/issues/create-issue.ts`の`createIssue()`を呼ぶ)——ロジックの二重実装を避けている。

## Server ComponentでもRoute HandlerでもないHTTPレスポンス

Livewireに相当する「部分HTML差分更新」という制約がNext.jsには無いため、next-pmではPDF/Atom/CSV/添付ファイルのような特殊なレスポンスも**同じ`app/api/**/route.ts`という置き場所**に素直に共存している(Laravel版のように別Controller層を作る必要が無い):

| 用途 | パス |
|---|---|
| 添付ファイルダウンロード | `app/api/attachments/[id]/route.ts` |
| プロジェクトアクティビティAtomフィード | `app/api/projects/[identifier]/activity/atom/route.ts` |
| 課題CSVエクスポート | `app/api/projects/[identifier]/issues/csv/route.ts` |
| 課題PDFエクスポート | `app/api/projects/[identifier]/issues/pdf/route.tsx`(`@react-pdf/renderer`) |
| ガントチャートPDF | `app/api/projects/[identifier]/gantt/pdf/route.tsx`(HTML版と同じレイアウト計算を共有) |
| Wikiエクスポート(HTML/PDF/ZIP) | `app/api/projects/[identifier]/wiki/export/{html,pdf,zip}/route.ts` |
| 受信メール処理(課題の自動作成・返信) | `app/api/mail_handler/route.ts` |

- `activity/atom/route.ts`だけは認証方式がさらに特殊——CookieかAPIキーに加えて、クエリ文字列に埋め込む専用の`atomKey`トークンも受け付ける(フィードリーダーはCookieもカスタムヘッダも送れないため)。一般のAPIキーとは意図的に別のトークンにしてあり、クエリ文字列がログ/ブラウザ履歴/Refererに漏れても影響範囲をフィード閲覧のみに限定している。`Referrer-Policy: no-referrer`も同じ理由でセットされる。
- 添付ファイルダウンロードは画像やHTMLであっても常に`Content-Disposition: attachment`を強制する——同一オリジンでの保存型XSSを防ぐため。
- 受信メール処理(`mail_handler`)はCookie/APIキーのどちらでもなく、`timingSafeEqual`による共有シークレット比較(`MAIL_HANDLER_API_KEY`)——環境変数が未設定ならエンドポイント自体が無効化される。
