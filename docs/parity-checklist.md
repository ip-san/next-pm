# next-pm 機能パリティ・チェックリスト(Redmine 本家比)

`/Users/sesoko/Desktop/workspace/next-pm`(本アプリ)と `/Users/sesoko/Desktop/workspace/redmine`(参照元 Redmine 6.x 系)を突き合わせた機能パリティの追跡ドキュメント。初回スナップショット作成日: **2026-08-19**。

**姉妹プロジェクトの同名ファイルとは別物**: `../artisan-pm/docs/parity-checklist.md` は Laravel 実装の状態を記録したもので、ステータス欄は next-pm には当てはまらない。Redmine 側の機能インベントリとしてのみ参照価値がある。

**凡例**: `done` = 実装済み / `partial` = 部分実装(備考に不足点) / `missing` = 未実装 / `out-of-scope` = 意図的に対象外(README または本表に理由を明記)

**運用方針**: 機能を実装したら該当行のステータスを更新する。恒久的に対応しない項目は削除せず `out-of-scope` として理由を残す。

**この初回スナップショットの調査方法**: Redmine 側の正本として `lib/redmine/preparation.rb`(権限・プロジェクトモジュールの定義)、`app/controllers/`(機能の網羅リスト)、`db/schema.rb` 相当のテーブル構成を使用。next-pm 側は `src/app/` のルート、`src/interface/actions/` の Server Action、`src/infrastructure/db/schema/` のテーブル定義を突き合わせた。UI とドメイン層で実装度が食い違う箇所(例: 課題更新)は、その差分自体を備考に記録している。

---

## 0. サマリー

### 0.1 構造的な差分(単一機能の欠落ではなく設計レベルの差)

| 差分 | 内容 |
|---|---|
| 課題の識別子 | 本家は全体で一意の連番(`#123`)。next-pm は UUID の先頭 8 桁(`#eb0b2d1a`)を表示・参照の shorthand に使う。メール件名の返信検出(`domain/mail/parse-email.ts`)やコミットメッセージ走査(`domain/scm/keyword-scan.ts`)もこの表記に合わせてある。移行するなら全機能横断の変更になる |
| クエリエンジン | 解消済み。`queries` に `type` / `column_names` / `group_by` / `sort_criteria` / `totalable_names` を追加し、フィルタ・表示列・グルーピング・ソート・合計・ページングを一体で持つようにした(`domain/query/`, `application/issues/list-project-issues.ts`, `infrastructure/db/repositories/issue-search-repository.ts`)。現時点の適用先はプロジェクトの課題一覧のみで、工数一覧(§9)と横断一覧(§13)への再利用は未着手(`type` 列と `IssueSearchRepository` の分離はそのための下地) |
| 課題の更新経路 | ドメイン/ユースケース層(`application/issues/update-issue.ts`)は任意フィールドの更新・ワークフロー検証・journal 生成まで対応済みだが、UI から到達できるのはステータス/対象バージョン/注記のみ。**多くの「課題の未実装機能」は実際には UI 層だけの穴** |
| 画面のスコープ | 本家は「グローバル画面 + プロジェクト画面」の二層構造(`/issues`, `/time_entries`, `/activity`)。next-pm はプロジェクト配下のみで、横断は検索(`/search`)と REST API v1 に限られる |
| 管理画面の CRUD | `interface/actions/admin-actions.ts` は作成系のみ。マスタの編集・削除・並べ替えが全般的に無い |
| 国際化 | 本家は約 50 言語のロケールファイル + ユーザーごとの言語設定。next-pm は文言がコンポーネントに直書きで i18n 基盤自体が無い |

### 0.2 優先度順の着手候補

| # | 項目 | 理由 | 参照 |
|---|---|---|---|
| 1 | 課題の単票編集フォーム | ドメイン層が揃っているため UI + Server Action のみで済む割に、体感差が最大 | §1 |
| ~~2~~ | ~~クエリの表示列・ソート・グルーピング・合計・ページング~~ | 課題一覧について実装済み。残るは工数一覧・横断一覧への展開 | §2 |
| 3 | 横断画面(`/issues`, `/time_entries`, `/activity`) | #2 の後なら一覧コンポーネントの再利用で済む | §13 |
| 4 | 管理画面の更新・削除 | マスタを一度でも間違えると DB を直接触るしかない現状の解消 | §6 |
| 5 | プライベート注記・注記の編集/削除 | `journals` にフラグ列追加 + 権限 3 種の追加が前提 | §1, §4 |
| 6 | 工数の編集・削除 | `edit_time_entries` 権限だけあって操作が無く、権限が空振りしている | §9 |
| 7 | Files モジュール | 権限だけ登録済みで実体が無い(空モジュール状態) | §8 |
| 8 | アカウントのセルフ登録・有効化・自動ログイン | 運用開始時に管理者が全ユーザーを手作りする必要がある | §5 |
| 9 | カスタムフィールドの書式追加と対象拡大 | `user`/`version`/複数選択が無く、実運用の型が表現できない | §1 |
| 10 | 課題のコピー・削除・親子の付け替え | 本家の日常操作で頻度が高い | §1 |

### 0.3 意図的スコープ外(README「注目すべき設計判断」に記載済み)

これらは穴ではなく判断の結果。§15 に一覧。

---

## 1. 課題管理

| 機能 | 状態 | 備考 |
|---|---|---|
| 課題の作成 | partial | トラッカー・優先度・担当(ユーザー/グループ)・カテゴリ・対象バージョン・親課題・日付・予定工数・プライベート指定に対応(`issue-schemas.ts`)。カスタムフィールド値と進捗率は入力できない |
| 課題の更新(ドメイン層) | done | ワークフロー遷移検証・必須/読取専用フィールド・ブロック中課題のクローズ拒否・precedes による後続日程の再計算まで実装(`application/issues/update-issue.ts`) |
| 課題の更新(UI) | partial | 単票画面のフォームはステータス・対象バージョン・注記のみ(`issues/[id]/status-update-form.tsx`)。件名/説明/トラッカー/優先度/担当/カテゴリ/日付/予定工数/進捗率/親課題/カスタム値を画面から変更できない |
| 一括編集 | partial | ステータス・優先度・担当・進捗率・プロジェクトのみ(`bulk-edit-actions.ts`)。本家はトラッカー・バージョン・カテゴリ・日付・カスタムフィールド・注記の一括付与にも対応 |
| コンテキストメニュー(一覧の右クリック) | missing | 本家 `ContextMenusController` 相当 |
| 課題の削除 | missing | 権限 `delete_issues` ごと無い。REST API にも DELETE が無い |
| 課題のコピー | missing | 権限 `copy_issues` ごと無い |
| 別プロジェクトへの移動 | partial | 一括編集の `projectId` 経由でのみ可能。単票からの移動 UI は無い |
| サブタスク(親子) | partial | 作成時に `parentId` を設定でき、スキーマにも列がある。更新での付け替え UI・権限 `manage_subtasks`・親課題の集計値(進捗率/日付/工数のロールアップ)・一覧のツリー表示が無い |
| 課題の関連 | done | precedes/follows(遅延日数と後続の再スケジュール)・blocks/blocked・duplicates/duplicated(canonical のクローズで重複も自動クローズ)・relates・copied_to/copied_from の 9 種を定義、循環参照ガードあり(copied_* は課題のコピー機能が未実装のため実際には生成されない) |
| 関連の権限分離 | partial | `manage_issue_relations` のみ。本家の `manage_related_issues`(別プロジェクト側の課題に関連を張る権限)が無い |
| ウォッチャー | done | 追加/削除/自己トグル、作成・担当・コメント時の自動ウォッチ(`user_preferences.auto_watch_on`) |
| ウォッチャー一覧の閲覧権限 | missing | 本家の `view_issue_watchers` が無く、閲覧可否が追加権限と一体になっている |
| 注記(journal) | partial | 追加は更新フォーム経由で可能。**編集・削除ができない**(`add_issue_notes` / `edit_issue_notes` / `edit_own_issue_notes` 権限ごと無い) |
| プライベート注記 | missing | `journals` にフラグ列が無い。`set_notes_private` / `view_private_notes` も無い |
| プライベート課題 | partial | `issues.is_private` と可視性判定(`domain/issue/visibility.ts`)は実装済み。`set_issues_private` / `set_own_issues_private` 権限による設定可否の制御が無い |
| 変更履歴の記録 | partial | `journal_details.property` は `attr` / `cf` / `relation` の 3 種。本家にある添付ファイルの追加/削除履歴(`attachment`)が記録されない |
| 添付ファイル | partial | 課題・Wiki・文書に添付可能。**説明(description)列が無い**、サムネイル/画像プレビュー無し、注記への添付が無い |
| リアクション | done | journal への 👍(本家 6.1 の Reaction 相当) |
| CSV インポート | partial | 課題のみ(`issue-import-actions.ts`)。権限 `import_issues` は未定義、工数のインポート(`import_time_entries`)も無い |
| カスタムフィールド: 書式 | partial | `string` / `text` / `int` / `float` / `date` / `bool` / `list` の 7 種のみ。本家の `user` / `version` / `link` / `enumeration` / `attachment` / key-value list / **複数選択** が無い |
| カスタムフィールド: 対象 | partial | `Issue` と `Project` のみ。User / Group / TimeEntry / Version が無い |
| カスタムフィールド: 適用範囲 | partial | トラッカー単位の紐付け + プロジェクト設定での有効化。ロール別の可視/編集可否(本家の `visible` / `role_ids`)が無い |
| カスタムフィールド: 課題での値の入力 | partial | REST API(`POST /api/v1/issues`, `PATCH /api/v1/issues/[id]`)からのみ設定可能。**課題の作成/更新フォームに入力欄が無い**(`application/issues/set-custom-field-values.ts` は UI から呼ばれていない)。単票画面での表示は done |
| カスタムフィールド: プロジェクトでの値の入力 | done | プロジェクト設定画面から編集可能 |
| カスタムフィールドによる絞り込み・表示列 | done | 課題一覧のフィルタ・表示列・ソート・グルーピング・合計すべてで `cf_<id>` を扱える(`domain/query/columns.ts`)。書式ごとの扱いは本家準拠 — 合計は `int`/`float` のみ、グルーピングは `text` と `float` を除く(本家 `FloatFormat` が `group_statement` を持たないため)。値の数値キャストは正規表現で保護してあり、非数値が混ざった行があっても一覧全体が落ちない |

## 2. クエリ・一覧・エクスポート

| 機能 | 状態 | 備考 |
|---|---|---|
| 保存済みクエリ | done | 作成・編集・削除・複製(`application/queries/`)、可視性(private/roles/public)、プロジェクト単位/グローバル。権限は `save_queries` / `manage_public_queries` を追加。可否は本家 `Query#editable_by?` の移植(`domain/query/visibility.ts`)— private は所有者のみ、public/roles は `manage_public_queries` 保持者、グローバルな public は管理者のみ。`manage_public_queries` を持たない利用者の公開指定は本家同様エラーにせず private へ落とす |
| フィルタの適用 | done | 画面上でその場に条件を組み立てる UI(`issues/issue-query-form.tsx`)。演算子は本家 `Query.operators` のうち next-pm に対象列がある 31 種(等価/空/範囲/部分一致/前方後方一致/未完了・完了/相対日付 17 種)。`me` の展開、`o`/`c` のステータス集合展開も本家準拠。URL は本家と同じ `f[]` / `op[field]` / `v[field][]` / `c[]` / `t[]` / `group_by` / `sort` / `set_filter` |
| 表示列の選択 | done | `queries.column_names`。既定は本家 `Setting.issue_list_default_columns` と同じ 6 列。`spent_hours` は `view_time_entries` 保持者にのみ提示(本家 `IssueQuery#initialize_available_columns` 準拠) |
| グルーピング | done | `queries.group_by`。グループ見出しに件数と小計を表示。件数・小計はページではなく絞り込み結果全体に対して SQL で集計するため、グループがページ境界で分割されても正しい。グループの並び順は本家同様その列のソート式(ステータスなら `position`)に従う |
| ソート | done | `queries.sort_criteria`。列見出しクリックで多段ソート(本家同様 3 キーまで、クリックした列が先頭へ)。UUID 主キーには順序が無いため `id` 列のソートは `created_at` に対応付け、ページングが安定するよう常に `id` を最終キーに付ける |
| 合計行(予定工数/作業時間などの total) | done | 本家 `options[:totalable_names]` 相当を `queries.totalable_names` に保持。予定工数・作業時間・数値カスタムフィールドの合計を、全体とグループ単位の両方で SQL 集計 |
| ページネーション | done | 件数・行・グループ集計・合計すべて SQL 側で処理し、1 ページ分しかメモリに載せない。プライベート課題の可視性も `Array#filter` ではなく WHERE 句で効かせてあるため、件数と合計が可視範囲とずれない。ページサイズは本家 `Setting.per_page_options`(既定 `25,50,100`)。範囲外のページ番号は最終ページに丸める |
| CSV エクスポート | partial | 課題のみ(`/api/projects/[identifier]/issues/csv`)。工数・ユーザーの CSV が無い。一覧と同じ URL 契約・同じユースケースを使うため、選択した表示列・フィルタ・ソートをそのまま反映する(行数の上限は本家同様 `issues_export_limit`、既定 500) |
| PDF エクスポート | done | 課題一覧・Wiki・ガント |
| Atom フィード | partial | プロジェクト活動のみ(`/api/projects/[identifier]/activity/atom`)。課題一覧・横断活動のフィードが無い |

## 3. プロジェクト

| 機能 | 状態 | 備考 |
|---|---|---|
| 作成・編集 | done | 名称/識別子/説明/公開設定/親プロジェクト |
| 階層(サブプロジェクト) | done | nested set(`lft`/`rgt`)で実装 |
| モジュールの有効/無効 | partial | `enabled_modules` + 設定画面あり。ただし `calendar` / `gantt` モジュールが権限レジストリに未登録で、この 2 つは常時有効扱い |
| ステータス(active/closed/archived) | partial | ドメイン判定は実装済み(読み取り専用権限のみ closed で許可)。**アーカイブ/クローズを切り替える管理 UI が無い** |
| プロジェクトの削除 | missing | 権限 `delete_project` ごと無い |
| プロジェクトのコピー | done | `copyProjectAction` |
| 新規プロジェクト作成権限 | missing | 本家の `add_project`(非管理者にプロジェクト作成を許可)が無い |
| 公開設定の権限分離 | missing | 本家の `select_project_publicity` が無い |
| メンバー管理 | partial | ユーザー/グループの追加・削除。**既存メンバーのロール変更ができない**(一度削除して再追加が必要) |
| バージョン(ロードマップ) | done | 作成/更新/削除、共有範囲(sharing)、Wiki ページ紐付け、ロードマップ画面 |
| 課題カテゴリ | done | 作成/更新/削除 |
| プロジェクト単位の作業分類 | partial | `enumerations` に `project_id` / `parent_id` 列はあるが、上書きを編集する UI が無い。権限 `manage_project_activities` も未定義 |

## 4. ロールと権限

| 機能 | 状態 | 備考 |
|---|---|---|
| ロール定義 | partial | 作成と権限付与のみ。編集・削除・複製、builtin ロール(非メンバー/匿名)の編集画面が無い |
| 可視性設定 | done | `issues_visibility` / `time_entries_visibility` / `users_visibility` |
| ワークフロー(遷移) | done | ロール × トラッカー × 遷移元/先 |
| ワークフロー(フィールド権限) | done | 必須/読取専用(`workflow_field_permissions`) |
| 権限キーの網羅 | partial | 本家 約 80 に対し next-pm は 45。下表参照 |
| プロジェクトモジュール | partial | 本家 10 に対し 8。`calendar` / `gantt` が未登録 |

### 4.1 未実装の権限キー(本家 `lib/redmine/preparation.rb` 比)

`add_issue_notes`, `add_message_watchers`, `add_project`, `add_wiki_page_watchers`, `commit_access`, `copy_issues`, `delete_issues`, `delete_message_watchers`, `delete_project`, `delete_wiki_pages`, `delete_wiki_pages_attachments`, `edit_issue_notes`, `edit_own_issue_notes`, `import_issues`, `import_time_entries`, `log_time_for_other_users`, `manage_project_activities`, `manage_related_issues`, `manage_subtasks`, `protect_wiki_pages`, `rename_wiki_pages`, `search_project`, `select_project_publicity`, `set_issues_private`, `set_notes_private`, `set_own_issues_private`, `use_webhooks`, `view_calendar`, `view_gantt`, `view_issue_watchers`, `view_members`, `view_message_watchers`, `view_private_notes`, `view_wiki_edits`, `view_wiki_page_watchers`

> 命名の差異(欠落ではない): next-pm の `manage_issue_categories` は本家の `manage_categories` に対応する。

## 5. ユーザー・認証・アカウント

| 機能 | 状態 | 備考 |
|---|---|---|
| ログイン/ログアウト | done | 自前 JWT セッション(`jose`) |
| 二要素認証 | partial | TOTP + バックアップコード、ログインフローのゲートまで。管理者による「2FA 必須化」設定が無い |
| パスワード変更 | done | セルフサービス |
| パスワード再設定 | done | メールトークン方式、Host ヘッダ注入対策済み |
| 自動ログイン(remember me) | missing | |
| セルフ登録 | missing | 本家の `self_registration`(即時/メール確認/管理者承認の 3 モード)が無く、ユーザーは管理者が作るしかない |
| メールアドレスの確認 | missing | |
| 複数メールアドレス | missing | 本家の `email_addresses` テーブル相当が無い |
| LDAP 認証 | partial | `.env` の `LDAP_URL` による単一接続。**管理画面の認証方式(auth_sources)登録・複数ソース・属性マッピング・オンザフライのアカウント作成が無い** |
| API キー | partial | `users.api_key` 列と認証は実装済み。マイアカウント画面での表示・再生成が無い |
| Atom キー | partial | 同上(`get-or-create-atom-key.ts` で発行はされる) |
| ユーザー個人設定 | partial | 自動ウォッチ条件のみ(`user_preferences.auto_watch_on`)。言語・タイムゾーン・メール通知方式・コメント表示順・メールアドレス非公開が無い |
| アバター | missing | Gravatar 連携なし |
| アカウントの自己削除 | missing | |

## 6. 管理画面

| 機能 | 状態 | 備考 |
|---|---|---|
| ユーザー | partial | 作成のみ。編集・ロック/有効化・削除・所属プロジェクト編集(本家 `principal_memberships`)が無い |
| グループ | done | 作成/削除/メンバー増減 |
| ロール | partial | 作成と権限更新のみ。編集/削除/複製が無い |
| トラッカー | partial | 作成のみ。編集/削除/並べ替え/複製、標準フィールドの無効化(本家 `core_fields`)が無い |
| 課題ステータス | partial | 作成のみ。編集/削除/並べ替えが無い |
| ワークフロー | done | 遷移とフィールド権限の編集 |
| カスタムフィールド | partial | 作成のみ。編集/削除/並べ替えが無い |
| 列挙項目(優先度・作業分類・文書カテゴリ) | partial | 作成のみ。編集/削除/並べ替え、プロジェクト単位の上書き編集が無い |
| アプリケーション設定 | partial | 10 項目のみ(添付上限・REST API 有効化・活動日数・フィード件数・進捗率の算出方式・プロジェクト間の関連許可・リポジトリログ表示件数・コミットキーワード各種)。本家は 100 前後の設定を持ち、認証(`login_required`, セッション有効期限)・表示(日時書式、既定言語)・課題追跡(既定トラッカー、添付の既定)・メール通知の設定が未対応 |
| 情報画面(環境情報) | missing | 本家 `/admin/info` |
| プラグイン一覧 | out-of-scope | プラグイン機構そのものが無い |

## 7. Wiki

| 機能 | 状態 | 備考 |
|---|---|---|
| 閲覧・編集・版歴・差分 | done | |
| ページ名変更(リダイレクト付き) | done | 権限は `manage_wiki` に統合。本家の `rename_wiki_pages` は独立権限 |
| マクロ | partial | `toc` / `include` / `child_pages` の 3 種のみ(`domain/wiki/macros.ts`)。本家の `collapse` / `thumbnail` / `issue` / `macro_list` 等が無い |
| エクスポート | done | HTML / PDF / ZIP |
| 添付 | done | |
| ページ削除 | partial | REST API(`DELETE /api/v1/projects/[identifier]/wiki/[title]`)にはあるが **UI に無い**。権限 `delete_wiki_pages` も未定義 |
| 保護ページ | partial | `wiki_pages.is_protected` 列はあるが切り替え UI と `protect_wiki_pages` 権限が無い |
| 親子階層 | partial | `parent_id` 列はあるが設定 UI・目次表示が無い |
| Wiki の開始ページ設定・Wiki 自体の削除 | missing | 本家 `WikisController` |
| ウォッチ | done | ページ単位のウォッチ |
| 版歴の閲覧権限 | missing | 本家の `view_wiki_edits` が無い |

## 8. フォーラム・News・文書・ファイル

| 機能 | 状態 | 備考 |
|---|---|---|
| フォーラム(トピック/返信) | done | 投稿・編集・削除、ウォッチ |
| フォーラム(ボード自体の管理) | partial | 作成のみ(`board-actions.ts` は `createBoardAction` だけ)。編集・削除・並べ替えが無い |
| トピックのロック/固定表示(sticky) | missing | 本家 `Message#locked` / `sticky` |
| News | partial | 作成・削除・コメント追加・ウォッチ。**編集とコメント削除が無い** |
| 文書(Documents) | partial | 作成・削除・添付。**編集ができない**(`edit_documents` 権限だけが存在する) |
| ファイル(Files モジュール) | missing | 権限 `view_files` / `manage_files` は登録済みだが、**ルート・UI・テーブルが存在しない空モジュール**。本家はバージョンに紐付くファイルリリースとダウンロード数を持つ |

## 9. 工数管理

| 機能 | 状態 | 備考 |
|---|---|---|
| 工数の記録 | done | 課題単票の `log-time-form` から |
| 工数の編集・削除 | missing | `edit_time_entries` / `edit_own_time_entries` 権限だけが存在し、対応する操作が無い |
| プロジェクトの工数一覧 | partial | 一覧と集計レポートあり。フィルタ・列選択・ソートは未適用 — §2 のクエリエンジンは `queries.type = 'TimeEntryQuery'` を見込んだ作りになっているが、工数側の列カタログと読み取りモデルはまだ無い |
| 横断の工数一覧 | missing | 本家 `/time_entries` |
| 他ユーザー名義での記録 | missing | `log_time_for_other_users` |
| 工数のカスタムフィールド | missing | |
| 工数の CSV エクスポート・インポート | missing | |
| コミットメッセージからの工数記録 | done | `@2h` 記法(`commit_logtime_enabled`) |

## 10. リポジトリ(SCM)

| 機能 | 状態 | 備考 |
|---|---|---|
| Git / Subversion / Mercurial のブラウズ・差分・blame | done | CLI へのシェルアウト方式 |
| CVS / Bazaar / Filesystem | out-of-scope | 本家にはあるが対象外(artisan-pm 側でも同じ判断) |
| コミットメッセージ連携 | done | `fixes #id` 等での自動更新、参照キーワード、時間記録 |
| リビジョン一覧・詳細 | done | |
| 1 プロジェクトに複数リポジトリ | missing | `scm_repositories` に `project_id` の unique 制約があり 1 対 1。本家は identifier 付きで複数登録できる |
| リポジトリの自動フェッチ | out-of-scope | cron 相当の仕組みを持たない設計判断(§15) |
| コミッターとユーザーの紐付け | missing | `changesets.committer_identity` は文字列のまま。本家は `users` へのマッピングを持つ |
| `commit_access` 権限(WS 経由の認可) | missing | 本家 `SysController` によるリポジトリ認証連携ごと無い |

## 11. 通知・メール

| 機能 | 状態 | 備考 |
|---|---|---|
| 課題の作成・更新の通知 | done | jobs テーブル + worker ポーリング |
| フォーラム投稿 / Wiki 編集 / News 投稿・コメントの通知 | done | |
| 通知先の決定 | partial | 候補プールを union して一括フィルタする一本道。本家の `mail_notification` ティア(all / selected / only_my_events 等)と `notified_events` によるイベント別オプトインは対象外(§15) |
| 受信メールからの課題作成・返信 | partial | 単一パートの text/plain のみ。添付・To/Cc からのウォッチャー・`Status:` 等のキーワード抽出・未知の送信者からのアカウント作成・サブアドレスによるプロジェクト振り分けが未対応(`api/mail_handler/route.ts` の冒頭コメントに明記) |
| リマインダーメール | missing | 本家は rake タスク + cron。next-pm には時刻トリガーが無い(§15) |
| Webhook | missing | 本家 6.1 の `use_webhooks` |

## 12. REST API v1

| 機能 | 状態 | 備考 |
|---|---|---|
| 認証 | done | API キー、`rest_api_enabled` 設定で全体を無効化可能 |
| ページネーション封筒 | done | |
| issues | partial | GET / POST / PATCH(PUT エイリアス有り)。**DELETE が無い**。journals の更新、`include=` パラメータ各種も無い |
| projects | partial | GET / POST / PUT。DELETE・アーカイブ操作が無い |
| users | partial | GET / POST。PUT / DELETE が無い |
| memberships | partial | 一覧・作成・削除。PUT(ロール変更)が無い |
| time_entries | partial | 一覧・作成のみ。個別 GET / PUT / DELETE が無い |
| versions / wiki / issue_categories / groups / relations | done | CRUD の主要部分は実装済み |
| news | partial | 一覧・作成・取得・削除。**PUT(更新)が無い**(本家 API は更新に対応) |
| messages / documents | partial | 作成と削除のみ。個別の取得・更新が無い |
| trackers / issue_statuses / enumerations / custom_fields / roles / queries / search | done | 読み取り専用エンドポイント |
| attachments | partial | `/api/attachments/[id]` でのダウンロードと `/api/v1/uploads` はあるが、メタデータ取得(GET)・更新(PATCH)・削除(DELETE)が無い |
| files | missing | Files モジュールごと無い(§8) |
| my/account | partial | GET のみ。PUT が無い |
| OAuth2 プロバイダ | missing | 本家 `oauth2_applications` |

## 13. 横断機能

| 機能 | 状態 | 備考 |
|---|---|---|
| 横断検索 | partial | 全対象を横断して検索できる(`/search`)が、対象種別の絞り込み・タイトルのみ検索・未完了課題のみ等のオプションが無い。権限 `search_project` も未定義 |
| プロジェクト活動 | done | `/projects/[identifier]/activity`、リポジトリのコミットも含む |
| 横断活動 | missing | 本家 `/activity` |
| 横断課題一覧 | missing | 本家 `/issues` |
| マイページ | partial | ブロック方式でカスタマイズ可(担当課題/報告課題/ウォッチ中/News/文書/作業時間)。本家にあってこちらに無いブロックは activity(活動)・calendar(カレンダー)・issue_query_selection(任意の保存済みクエリの結果) の 3 種(`../redmine/app/views/my/blocks/`) |
| ガントチャート | partial | 月単位のウィンドウ + PDF 出力。ズーム段階(日/週/月/四半期)、バージョン行・サブプロジェクト表示、PNG 出力が無い |
| カレンダー | done | 月グリッド |
| サマリーレポート | done | `/projects/[identifier]/reports` |

## 14. 表示・その他

| 機能 | 状態 | 備考 |
|---|---|---|
| Markdown 記法 | done | |
| Textile 記法 | missing | 本家は既定で両対応(旧データの互換用) |
| 本文プレビュー | missing | 本家 `PreviewsController` |
| 国際化(i18n) | missing | 文言が直書き。ユーザー別言語設定も無い |
| テーマ切り替え | missing | |
| 添付画像のサムネイル/インライン表示 | missing | |
| キーボード操作 | done | マイページのブロック移動をボタン化するなど、本家より意図的にアクセシブルにしている箇所がある(§15) |

## 15. 意図的に対象外とした項目

| 項目 | 理由 |
|---|---|
| 時刻トリガーの非同期処理(cron 相当) | README「注目すべき設計判断」参照。SCM の自動フェッチ・添付の定期 GC・リマインダーメールはいずれも「操作時に同期実行」か「次に触れた時の遅延実行」で代替している。本物のスケジューラが要る機能を足す場合は `worker/` のポーリングループに `jobType` を追加するだけでは実現できない |
| 通知の `mail_notification` ティアとイベント別オプトイン | README 記載。候補者プールを union して一括フィルタする一本道のロジックのみを持つ |
| マイページのドラッグ&ドロップ | README 記載。上下/列移動を独立したフォームのボタンにしてキーボードだけで完結させる判断 |
| CVS / Bazaar / Filesystem の SCM アダプタ | 大型据え置き(artisan-pm 側と同じ判断) |
| プラグイン機構 | Rails の Engine 前提の仕組みで、移植の枠を超える |
