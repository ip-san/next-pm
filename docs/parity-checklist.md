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
| クエリエンジン | 本家 `Query` はフィルタ・表示列・グルーピング・ソート・合計・ページングを一体で持つ。next-pm の `queries` テーブルは `filters` のみで、他の 5 要素が存在しない。課題一覧・工数一覧・横断一覧すべてがこの制約を受けている |
| 課題の更新経路 | 解消済み。単票の編集フォームからドメイン層の全項目(トラッカー・親課題・カスタム値を含む)に到達できるようになった。残る穴は一括編集の対応項目(§1)とコンテキストメニュー |
| 画面のスコープ | 本家は「グローバル画面 + プロジェクト画面」の二層構造(`/issues`, `/time_entries`, `/activity`)。next-pm はプロジェクト配下のみで、横断は検索(`/search`)と REST API v1 に限られる |
| 管理画面の CRUD | `interface/actions/admin-actions.ts` は作成系のみ。マスタの編集・削除・並べ替えが全般的に無い |
| 国際化 | 本家は約 50 言語のロケールファイル + ユーザーごとの言語設定。next-pm は文言がコンポーネントに直書きで i18n 基盤自体が無い |

### 0.2 優先度順の着手候補

| # | 項目 | 理由 | 参照 |
|---|---|---|---|
| 1 | ~~課題の単票編集フォーム~~ (対応済み) | ドメイン層が揃っているため UI + Server Action のみで済む割に、体感差が最大 | §1 |
| 2 | クエリの表示列・ソート・グルーピング・合計・ページング | 一覧系すべての基盤。ここが無いと課題数が増えた時点で実用に耐えない | §2 |
| 3 | 横断画面(`/issues`, `/time_entries`, `/activity`) | #2 の後なら一覧コンポーネントの再利用で済む | §13 |
| 4 | 管理画面の更新・削除 | マスタを一度でも間違えると DB を直接触るしかない現状の解消 | §6 |
| 5 | プライベート注記・注記の編集/削除 | `journals` にフラグ列追加 + 権限 3 種の追加が前提 | §1, §4 |
| 6 | 工数の編集・削除 | `edit_time_entries` 権限だけあって操作が無く、権限が空振りしている | §9 |
| 7 | アカウントのセルフ登録・有効化・自動ログイン | 運用開始時に管理者が全ユーザーを手作りする必要がある | §5 |
| 8 | カスタムフィールドの書式追加と対象拡大 | `user`/`version`/複数選択が無く、実運用の型が表現できない | §1 |
| 9 | 課題のコピー・削除・親子の付け替え | 本家の日常操作で頻度が高い | §1 |

### 0.3 意図的スコープ外(README「注目すべき設計判断」に記載済み)

これらは穴ではなく判断の結果。§15 に一覧。

---

## 1. 課題管理

| 機能 | 状態 | 備考 |
|---|---|---|
| 課題の作成 | done | トラッカー・優先度・担当(ユーザー/グループ)・カテゴリ・対象バージョン・親課題・日付・予定工数・進捗率・プライベート指定・カスタムフィールド値に対応(`issue-schemas.ts`)。カスタム値はトラッカーで絞り込み、既定値をプリセット、作成前に一括検証する |
| 課題の更新(ドメイン層) | done | ワークフロー遷移検証・必須/読取専用フィールド・ブロック中課題のクローズ拒否・precedes による後続日程の再計算まで実装(`application/issues/update-issue.ts`) |
| 課題の更新(UI) | done | 単票画面の `issue-edit-form.tsx` が件名・説明・トラッカー・ステータス・優先度・担当(ユーザー/グループ)・カテゴリ・対象バージョン・親課題・日付・予定工数・進捗率・プライベート・カスタム値・注記を 1 フォームで更新(`updateIssueFormAction` → `update-issue.ts`)。ワークフローの読取専用項目は入力欄を出さず送信もしない、必須項目は `*` 表示、ステータス選択肢は許可された遷移のみ。トラッカー/ステータスを変えると権限表示をブラウザ側で再計算する(サーバ側でも再判定)。進捗率は `issue_done_ratio` が `issue_field` のときのみ表示(本家 `Issue.use_field_for_done_ratio?` と同じくビューのみの制御) |
| 一括編集 | partial | ステータス・優先度・担当・進捗率・プロジェクトのみ(`bulk-edit-actions.ts`)。本家はトラッカー・バージョン・カテゴリ・日付・カスタムフィールド・注記の一括付与にも対応 |
| コンテキストメニュー(一覧の右クリック) | missing | 本家 `ContextMenusController` 相当 |
| 課題の削除 | missing | 権限 `delete_issues` ごと無い。REST API にも DELETE が無い |
| 課題のコピー | missing | 権限 `copy_issues` ごと無い |
| 別プロジェクトへの移動 | done | 単票画面の `move-issue-form.tsx` から移動先プロジェクト+トラッカーを選んで実行(`application/issues/move-issue.ts`)。本家 `Issue#project=` / `after_project_change` に準拠し、トラッカーの自動フォールバック・カテゴリの同名再マッチ・共有外バージョンの解除・親の解除・同一プロジェクトの子チケットの随伴(keep_tracker)・工数の付け替え・プロジェクトをまたぐ関連の削除(`cross_project_issue_relations` が無効な場合)まで行う。移動先の候補は `add_issues` 権限を持つプロジェクトのみ。**一括編集での移動は未対応**(従来の備考にあった「一括編集の projectId 経由」は誤りで、`bulk-edit-actions.ts` は他プロジェクトの課題をスキップする) |
| サブタスク(親子) | partial | 作成・更新の双方で `parentId` を設定でき、`manage_subtasks` 権限で可否を制御、付け替え時は自分自身/子孫を親にする循環を拒否する(`domain/issue/parent.ts`、本家 `Issue#validate_parent_issue`)。親課題の集計値(進捗率/日付/工数のロールアップ)・一覧のツリー表示が無い |
| 課題の関連 | done | precedes/follows(遅延日数と後続の再スケジュール)・blocks/blocked・duplicates/duplicated(canonical のクローズで重複も自動クローズ)・relates・copied_to/copied_from の 9 種を定義、循環参照ガードあり(copied_* は課題のコピー機能が未実装のため実際には生成されない) |
| 関連の権限分離 | partial | `manage_issue_relations` のみ。本家の `manage_related_issues`(別プロジェクト側の課題に関連を張る権限)が無い |
| ウォッチャー | done | 追加/削除/自己トグル、作成・担当・コメント時の自動ウォッチ(`user_preferences.auto_watch_on`) |
| ウォッチャー一覧の閲覧権限 | missing | 本家の `view_issue_watchers` が無く、閲覧可否が追加権限と一体になっている |
| 注記(journal) | partial | 追加は更新フォーム経由で可能。**編集・削除ができない**(`add_issue_notes` / `edit_issue_notes` / `edit_own_issue_notes` 権限ごと無い) |
| プライベート注記 | missing | `journals` にフラグ列が無い。`set_notes_private` / `view_private_notes` も無い |
| プライベート課題 | done | `issues.is_private` と可視性判定(`domain/issue/visibility.ts`)に加え、`set_issues_private` / `set_own_issues_private`(own = 作成者)による設定可否の制御を実装。権限が無い場合は本家 `safe_attributes` と同じく送信値を黙って捨て、フォームにも項目を出さない |
| 変更履歴の記録 | done | `journal_details.property` は `attr` / `cf` / `relation` / `attachment` の 4 種。`attr` はトラッカー・説明・親課題を含む(本家と同じ)。添付の追加/削除は本家の `Journal#journalize_attachment` と同じ形(`prop_key` = 添付 ID、ファイル名を追加時は `value`・削除時は `old_value`)で記録する。課題作成時に同時に添付したファイルは本家同様に履歴を作らない(その時点で journal が無い)。単票の履歴表示は属性名をそのまま出すため、添付行は添付 ID が見えたままになっている |
| 添付ファイル | partial | 課題・Wiki・文書・プロジェクト・バージョンに添付可能。説明(description)は課題・Wiki・文書・ファイルのアップロード時に入力でき、`PATCH /api/v1/attachments/[id]` とファイル一覧から編集できる。課題・Wiki・文書の添付一覧は共通コンポーネント(`app/(dashboard)/projects/attachment-list.tsx`)で、画像はサムネイルをインライン表示する。注記への添付は無い |
| リアクション | done | journal への 👍(本家 6.1 の Reaction 相当) |
| CSV インポート | partial | 課題のみ(`issue-import-actions.ts`)。権限 `import_issues` は未定義、工数のインポート(`import_time_entries`)も無い |
| カスタムフィールド: 書式 | partial | `string` / `text` / `int` / `float` / `date` / `bool` / `list` の 7 種のみ。本家の `user` / `version` / `link` / `enumeration` / `attachment` / key-value list / **複数選択** が無い |
| カスタムフィールド: 対象 | partial | `Issue` と `Project` のみ。User / Group / TimeEntry / Version が無い |
| カスタムフィールド: 適用範囲 | partial | トラッカー単位の紐付け + プロジェクト設定での有効化。ロール別の可視/編集可否(本家の `visible` / `role_ids`)が無い |
| カスタムフィールド: 課題での値の入力 | done | 作成/更新フォームと REST API の双方から設定可能。7 書式それぞれの入力欄を `issues/custom-field-inputs.tsx` が描画し、トラッカーの紐付けで絞り込む。更新時は属性変更と同じ 1 件の journal に `property = 'cf'` の明細として記録(本家 Journal と同じ)。値の検証は課題行を書き換える前に行うため、不正値で中途半端な更新が残らない |
| カスタムフィールド: プロジェクトでの値の入力 | done | プロジェクト設定画面から編集可能 |
| カスタムフィールドによる絞り込み・表示列 | missing | §2 のクエリエンジン側の制約 |

## 2. クエリ・一覧・エクスポート

| 機能 | 状態 | 備考 |
|---|---|---|
| 保存済みクエリ | partial | 作成(`saveQueryAction`)と適用、可視性(private/roles/public)、プロジェクト単位/グローバルまで。**編集・削除・複製が無い**。権限 `save_queries` / `manage_public_queries` も未定義 |
| フィルタの適用 | partial | 保存済みクエリの `filters` と `?status_id=` のショートカットのみ。**画面上でその場に条件を組み立てる UI が無い**(`issues/page.tsx`) |
| 表示列の選択 | missing | `queries` テーブルに `column_names` 相当が無い |
| グルーピング | missing | `group_by` 相当が無い |
| ソート | missing | `sort_criteria` 相当が無い |
| 合計行(予定工数/作業時間などの total) | missing | |
| ページネーション | missing | 一覧は全件をメモリ上で可視性フィルタして描画している |
| CSV エクスポート | partial | 課題のみ(`/api/projects/[identifier]/issues/csv`)。工数・ユーザーの CSV が無い。表示列の選択も §2 の制約により不可 |
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
| 権限キーの網羅 | partial | 本家 約 80 に対し next-pm は 47(`use_webhooks` を追加)。下表参照 |
| プロジェクトモジュール | partial | 本家 10 に対し 8。`calendar` / `gantt` が未登録 |

### 4.1 未実装の権限キー(本家 `lib/redmine/preparation.rb` 比)

`add_issue_notes`, `add_message_watchers`, `add_project`, `add_wiki_page_watchers`, `commit_access`, `copy_issues`, `delete_issues`, `delete_message_watchers`, `delete_project`, `delete_wiki_pages`, `delete_wiki_pages_attachments`, `edit_issue_notes`, `edit_own_issue_notes`, `import_issues`, `import_time_entries`, `log_time_for_other_users`, `manage_project_activities`, `manage_public_queries`, `manage_related_issues`, `protect_wiki_pages`, `rename_wiki_pages`, `save_queries`, `search_project`, `select_project_publicity`, `set_notes_private`, `view_calendar`, `view_gantt`, `view_issue_watchers`, `view_members`, `view_message_watchers`, `view_private_notes`, `view_wiki_edits`, `view_wiki_page_watchers`

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
| ファイル(Files モジュール) | done | `/projects/[identifier]/files`。プロジェクト直下とバージョン単位のファイルを本家 `FilesController#index` と同じ区分け(プロジェクト → バージョンの逆順)で一覧し、ファイル名/日付/サイズ/DL 数でソート、ダイジェストと説明を表示する。追加・削除は `manage_files`、ダウンロードのたびに `attachments.downloads` を加算(本家と同じく Project/Version のみ)。ファイルを持つバージョンは `Version#deletable?` と同じく削除できない |

## 9. 工数管理

| 機能 | 状態 | 備考 |
|---|---|---|
| 工数の記録 | done | 課題単票の `log-time-form` から |
| 工数の編集・削除 | missing | `edit_time_entries` / `edit_own_time_entries` 権限だけが存在し、対応する操作が無い |
| プロジェクトの工数一覧 | partial | 一覧と集計レポートあり。フィルタ・列選択・ソートは §2 の制約 |
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
| 受信メールからの課題作成・返信 | done | `interface/http/mail-handler.ts` が本家 `MailHandler#receive`/`#dispatch` に対応。MIME のマルチパート(text/plain 優先、`mail_handler_preferred_body_part` で html 優先に切替、html は本文をテキスト化)・base64/quoted-printable・パートごとの charset(ISO-2022-JP / Shift_JIS 含む)・RFC 2047 の件名・RFC 2231 の添付ファイル名を `domain/mail/mime.ts` で解釈する。添付の保存(`attachment_max_size` と `mail_handler_excluded_filenames` を尊重)、To/Cc のユーザーをウォッチャーに追加(`add_issue_watchers` 権限が必要)、本文のキーワード抽出(Project/Tracker/Status/Priority/Category/Assignee/Fixed version/Start date/Due date/Done ratio/Estimated hours/プライベート/カスタムフィールド、`allow_override` に挙げた項目のみ・英語名と日本語ラベルの両方を受け付ける)、`mail_handler_body_delimiters` と `mail_handler_enable_regex_delimiters` による署名・引用の切り落とし、`redmine+project@` のサブアドレス振り分け、フォーラム投稿への返信(`[... msg1a2b3c4d]`)、`no_permission_check` / `no_account_notice` / `no_notification` / `default_group`、`mail_handler_api_enabled` と `mail_handler_api_key`(管理画面の「受信メール」セクション)に対応。書き込みはすべて `createIssue` / `updateIssue` / `postMessage` を通すため、ワークフロー・必須項目・属性の割当可否は UI や REST API と同じ経路で検証される。**本家との差**: (1) `unknown_user=accept` は非対応(本家は匿名ユーザーのレコードに紐づけるが next-pm には匿名「ロール」しか無く `issues.author_id` は実在ユーザーへの FK)。422 を返して黙って降格しない。(2) `unknown_user=create` は生成パスワードの平文送付ではなくパスワード再設定リンクを送る(通知本文は `jobs.payload` に保存されるため)。(3) 返信の宛先判定は件名トークンのみ(本家は自分が付けた `Message-ID` でも判定するが、Mailer ポートにヘッダを設定する口が無い)。この件名トークンを機能させるため、課題とフォーラムの通知件名を `[プロジェクト #eb0b2d1a]` / `[プロジェクト - msg1a2b3c4d]` に変更した(`domain/mail/subject.ts`)。(4) ニュースへの返信は未対応(本家も `Message-ID` 経由のみ) |
| リマインダーメール | partial | 本家 `Mailer.reminders`(`rake redmine:send_reminders`)の選定ロジックを `application/jobs/send-reminders.ts` に移植: アクティブなプロジェクトの未完了・担当者あり・期日が N 日以内のチケットを担当者ごとにまとめ、グループ担当はメンバーに展開し、受信者自身の可視性で絞ってからメールする。**時刻トリガーは無いまま**(§15)で、管理 > 設定の「リマインダーメール」から `reminders` ジョブを登録する手動実行。外部スケジューラから叩く場合もこの Server Action(または `jobs` への直接 INSERT)を呼ぶ |
| Webhook | done | 本家 6.1 の `use_webhooks` 相当。ユーザーごとの Webhook を `/my/webhooks` で CRUD(URL・シークレット・有効/無効・イベント・対象プロジェクト)、権限 `use_webhooks` と設定 `webhooks_enabled` の両方で制御する。イベントは `issue.created` / `issue.updated` / `news.created` / `wiki_page.updated` の4種(本家は Issue/News/WikiPage/TimeEntry/Version × created/updated/deleted。**提供するのは実際に発火させているものだけ**にしてある)。発火箇所は本家のモデルコールバックに対して next-pm は呼び出し側で、チケットは単票フォーム・REST API の POST/PATCH・受信メール、ニュースは作成アクションと REST API、Wiki は編集アクションと REST API。**未配線**: 一括編集・プロジェクト間移動・CSV インポート・コミットフックによるチケット更新。ペイロードは `{type, timestamp, data}` で発火時に確定させ、所有者が見られるかどうか(プライベートチケットの可視性 + 発火時点の `use_webhooks`)を Webhook ごとに判定してからジョブに積む。配信はジョブワーカー経由で、シークレットがあれば本家と同じ `X-Redmine-Signature-256: sha256=<hex>` を付ける。再試行はワーカー既定のバックオフに乗せ、5xx・タイムアウト・通信エラーのみ再試行(4xx・リダイレクト・ブロックされたアドレスは再試行しない。本家は再試行しない)。SSRF 対策として `http`/`https` 以外と WHATWG の bad ports を拒否し、ホスト名を自分で名前解決して **解決後のアドレス** を検査(ループバック・リンクローカル・マルチキャスト・RFC1918・CGNAT・ULA・IPv4射影 IPv6 を遮断。本家は RFC1918 を遮断せず設定ファイル頼み)、検査を通ったアドレスに直接接続するため DNS リバインディングの隙が無く、リダイレクトは一切追わない |

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
| attachments | done | `/api/attachments/[id]`(ダウンロード、API キー可)と `/api/attachments/[id]/thumbnail`、`/api/v1/uploads`、`/api/v1/attachments/[id]` の GET / PATCH(PUT エイリアス有り)/ DELETE |
| files | done | `GET /api/v1/projects/[identifier]/files`(バージョン情報・ダイジェスト・DL 数付き)と `POST`(`uploads` のトークンを `version_id` / `description` 付きで引き換え) |
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
| 添付画像のサムネイル/インライン表示 | done | 課題・Wiki・文書の添付一覧で表示。`/api/attachments/[id]/thumbnail` が sharp で PNG に再エンコードして返す(本家の `Redmine::Thumbnail.convert_available?` と同じく、使えない環境ではサムネイル無しに縮退)。本家 `Redmine::Thumbnail.generate` と同じくレンダラに渡す前に**ファイル先頭のバイト列から実フォーマットを判定**し、許可したラスタ形式以外(SVG/HTML 等)は宣言された content-type が `image/png` でも 404。サイズは 50 刻み・最大 800 に丸め、40 メガピクセル超の入力はデコードしない。元のバイト列は常に `Content-Disposition: attachment` のままなので SVG/HTML はインライン描画されない |
| キーボード操作 | done | マイページのブロック移動をボタン化するなど、本家より意図的にアクセシブルにしている箇所がある(§15) |

## 15. 意図的に対象外とした項目

| 項目 | 理由 |
|---|---|
| 時刻トリガーの非同期処理(cron 相当) | README「注目すべき設計判断」参照。SCM の自動フェッチ・添付の定期 GC は「操作時に同期実行」か「次に触れた時の遅延実行」で代替している。リマインダーメールは §11 のとおり送信ロジック自体は実装済みで、管理画面のボタン(= `reminders` ジョブの登録)で随時実行する形にしてある。**定時に自動で走らせる仕組みは依然として無い**ため、毎朝送りたい場合は外部の cron からこの操作を叩く必要がある |
| 通知の `mail_notification` ティアとイベント別オプトイン | README 記載。候補者プールを union して一括フィルタする一本道のロジックのみを持つ |
| マイページのドラッグ&ドロップ | README 記載。上下/列移動を独立したフォームのボタンにしてキーボードだけで完結させる判断 |
| CVS / Bazaar / Filesystem の SCM アダプタ | 大型据え置き(artisan-pm 側と同じ判断) |
| プラグイン機構 | Rails の Engine 前提の仕組みで、移植の枠を超える |
