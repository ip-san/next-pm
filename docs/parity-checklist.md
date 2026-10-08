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
| クエリエンジン | 解消済み。`queries` に `type` / `column_names` / `group_by` / `sort_criteria` / `totalable_names` を追加し、フィルタ・表示列・グルーピング・ソート・合計・ページングを一体で持つようにした(`domain/query/`, `application/issues/list-project-issues.ts`, `infrastructure/db/repositories/issue-search-repository.ts`)。適用先は課題一覧(プロジェクト/横断)と工数一覧(プロジェクト/横断)。`queries.type` の STI でどちらの保存済みクエリかを分け、フィルタコンパイラ・ページング・ソート・列の検証は共有し、列カタログと読み取りモデルだけが別 |
| 課題の更新経路 | 解消済み。単票の編集フォーム・一括編集・一覧のコンテキストメニューからドメイン層の項目に到達できる。一括編集の日付のクリアのみ残る(単票で可能) |
| 画面のスコープ | 解消済み。本家と同じく「グローバル画面 + プロジェクト画面」の二層構造になった(`/issues`, `/time_entries`, `/activity`、加えて従来からの `/search`)。グローバル側の可視範囲は常に「その権限を持つプロジェクトの集合」をプロジェクトごとに解決して合成する(`listVisibleProjectContexts`)|
| 管理画面の CRUD | ユーザー/ロール/トラッカー/課題ステータス/カスタムフィールド/列挙項目の編集・削除・並べ替えを実装済み。残るのはボード(§8)と、列挙項目のプロジェクト単位の上書き編集 |
| 国際化 | 本家は約 50 言語のロケールファイル + ユーザーごとの言語設定。next-pm は文言がコンポーネントに直書きで i18n 基盤自体が無い |

### 0.2 優先度順の着手候補

| # | 項目 | 理由 | 参照 |
|---|---|---|---|
| ~~1~~ | ~~課題の単票編集フォーム~~ (対応済み) | ドメイン層が揃っているため UI + Server Action のみで済む割に、体感差が最大 | §1 |
| ~~2~~ | ~~クエリの表示列・ソート・グルーピング・合計・ページング~~ | 課題一覧について実装済み。残るは工数一覧・横断一覧への展開 | §2 |
| ~~3~~ | ~~横断画面(`/issues`, `/time_entries`, `/activity`)~~ (対応済み) | #2 の後なら一覧コンポーネントの再利用で済む | §13 |
| 4 | ~~管理画面の更新・削除~~ (実装済み) | マスタを一度でも間違えると DB を直接触るしかない現状の解消 | §6 |
| 5 | プライベート注記・注記の編集/削除 | `journals` にフラグ列追加 + 権限 3 種の追加が前提 | §1, §4 |
| 6 | ~~工数の編集・削除~~(対応済み) | 編集/削除・他ユーザー名義の記録・工数カスタムフィールド・CSV 入出力・REST の個別操作まで実装 | §9 |
| 7 | ~~アカウントのセルフ登録・有効化・自動ログイン~~ (対応済み) | 運用開始時に管理者が全ユーザーを手作りする必要がある | §5 |
| 8 | カスタムフィールドの書式追加と対象拡大 | `user`/`version`/複数選択が無く、実運用の型が表現できない | §1 |
| 9 | ~~課題のコピー・削除・親子の付け替え~~ (対応済み) | 本家の日常操作で頻度が高い | §1 |

### 0.3 意図的スコープ外(README「注目すべき設計判断」に記載済み)

これらは穴ではなく判断の結果。§15 に一覧。

---

## 1. 課題管理

| 機能 | 状態 | 備考 |
|---|---|---|
| 課題の作成 | done | トラッカー・優先度・担当(ユーザー/グループ)・カテゴリ・対象バージョン・親課題・日付・予定工数・進捗率・プライベート指定・カスタムフィールド値に対応(`issue-schemas.ts`)。カスタム値はトラッカーで絞り込み、既定値をプリセット、作成前に一括検証する |
| 課題の更新(ドメイン層) | done | ワークフロー遷移検証・必須/読取専用フィールド・ブロック中課題のクローズ拒否・precedes による後続日程の再計算まで実装(`application/issues/update-issue.ts`) |
| 課題の更新(UI) | done | 単票画面の `issue-edit-form.tsx` が件名・説明・トラッカー・ステータス・優先度・担当(ユーザー/グループ)・カテゴリ・対象バージョン・親課題・日付・予定工数・進捗率・プライベート・カスタム値・注記を 1 フォームで更新(`updateIssueFormAction` → `update-issue.ts`)。ワークフローの読取専用項目は入力欄を出さず送信もしない、必須項目は `*` 表示、ステータス選択肢は許可された遷移のみ。トラッカー/ステータスを変えると権限表示をブラウザ側で再計算する(サーバ側でも再判定)。進捗率は `issue_done_ratio` が `issue_field` のときのみ表示(本家 `Issue.use_field_for_done_ratio?` と同じくビューのみの制御) |
| 一括編集 | partial | ステータス・トラッカー・優先度・担当・カテゴリ・対象バージョン・開始日・期日・進捗率・カスタムフィールド・注記(非公開指定を含む)を一括で付与できる(`bulk-edit-actions.ts`、`bulk-edit-form.tsx`)。空欄は変更しない。日付は値の設定のみで、一括でのクリアは未対応(単票で行う)。実機検証はフォームから送信→アクション到達(入力検証の応答)まで。送信成功時の DB の変化は未検証 |
| コンテキストメニュー(一覧の右クリック) | done | 一覧の行を右クリックすると本家 `ContextMenusController#issues` 相当のメニューを表示(`issue-context-menu.tsx`)。ステータス/トラッカー/優先度/担当/対象バージョン/進捗率の即時変更と、一括編集・コピー・削除への導線。対象は選択中の行、未選択の行を右クリックした場合はその行のみ(本家と同じ)。即時変更は一括編集と同じ `bulkUpdateIssuesAction` を通すため、権限・ワークフロー・検証がまったく同じに効く。メニュー項目は権限のあるものだけを描画するが、サーバ側でも課題ごとに再判定する |
| 課題の削除 | done | `delete_issues` 権限 + 単票の確認画面(`issues/[id]/destroy`)と `DELETE /api/v1/issues/[id]`。本家 `IssuesController#destroy` に準拠し、子孫チケットを一緒に削除、記録済み工数は削除/紐付け解除/別チケットへ付け替えの 3 択(付け替え先は同一プロジェクト・可視・削除対象外に限定)。journal(明細・リアクション含む)・ウォッチャー・カスタム値・添付レコードを 1 トランザクションで削除し、添付の実ファイルはコミット後に削除する |
| 課題のコピー | done | `copy_issues` 権限 + 単票画面のコピーフォーム(`copy-issue-form.tsx` → `application/issues/copy-issue.ts`)。本家 `Issue#copy_from` / `after_create_from_copy` に準拠し、コピー先プロジェクト/トラッカーの選択、添付・子チケット・ウォッチャーの任意コピー、作成者をコピー実行者に差し替え、ステータスをコピー先トラッカーの初期値にリセット、カスタム値の引き継ぎ、`copied_to` 関連の作成(同一プロジェクト、または `cross_project_issue_relations` が有効なとき)まで行う。子チケットは可視なものだけを木構造のまま複製し、親を複製後の親に張り替え、open でないバージョンと非アクティブな担当者は外す |
| 別プロジェクトへの移動 | done | 単票画面の `move-issue-form.tsx` から移動先プロジェクト+トラッカーを選んで実行(`application/issues/move-issue.ts`)。本家 `Issue#project=` / `after_project_change` に準拠し、トラッカーの自動フォールバック・カテゴリの同名再マッチ・共有外バージョンの解除・親の解除・同一プロジェクトの子チケットの随伴(keep_tracker)・工数の付け替え・プロジェクトをまたぐ関連の削除(`cross_project_issue_relations` が無効な場合)まで行う。移動先の候補は `add_issues` 権限を持つプロジェクトのみ。**一括編集での移動は未対応**(従来の備考にあった「一括編集の projectId 経由」は誤りで、`bulk-edit-actions.ts` は他プロジェクトの課題をスキップする) |
| サブタスク(親子) | partial | 作成・更新の双方で `parentId` を設定でき、`manage_subtasks` 権限で可否を制御、付け替え時は自分自身/子孫を親にする循環を拒否する(`domain/issue/parent.ts`、本家 `Issue#validate_parent_issue`)。親課題の集計値は `parent_issue_dates` / `parent_issue_priority` / `parent_issue_done_ratio` 設定で子から算出(`domain/issue/rollup.ts` + `application/issues/recalculate-parents.ts`、本家 `Issue#recalculate_attributes_for`)、算出対象の項目は編集フォームで読み取り専用になる。一覧は本家 `issue_list` ヘルパーと同じ親子インデント表示(`domain/issue/tree.ts`、一覧に含まれる課題を基準に段付けする)。なお本家に予定工数のロールアップ設定は無く、`total_estimated_hours` は表示専用の合計値 |
| 課題の関連 | done | precedes/follows(遅延日数と後続の再スケジュール)・blocks/blocked・duplicates/duplicated(canonical のクローズで重複も自動クローズ)・relates・copied_to/copied_from の 9 種を定義、循環参照ガードあり(copied_to は課題のコピーで生成される) |
| 関連の権限分離 | done | `manage_issue_relations` で課題間の関連を制御。**従来の備考は誤り**: 本家の `manage_related_issues` は課題間の関連ではなくリポジトリモジュールの権限(`lib/redmine/preparation.rb` で `{:repositories => [:add_related_issue, :remove_related_issue]}`)で、コミット(changeset)と課題を手動で紐付けるためのもの。権限キーを登録し(`require` なし、本家どおり)、リビジョン画面から手動で紐付け・解除できる。紐付け・解除・関連一覧は、課題のプロジェクトごとの `view_issues` と非公開ルールを合わせて判定する(本家 `Issue#visible?`) |
| ウォッチャー | done | 追加/削除/自己トグル、作成・担当・コメント時の自動ウォッチ(`user_preferences.auto_watch_on`) |
| ウォッチャー一覧の閲覧権限 | done | `view_issue_watchers` でウォッチャー一覧の表示可否を制御(追加/削除権限とは独立)。REST にウォッチャー一覧の GET は無いため画面のみ |
| 注記(journal) | done | `add_issue_notes` 権限で注記のみの更新が可能(本家 `Issue#attachments_addable?` と同じく添付の追加も可、削除は編集権限が必要)(本家 `Issue#notes_addable?` と同じく編集権限とは独立。メール返信もこの権限で判定)。`edit_issue_notes` / `edit_own_issue_notes` による注記の編集に対応(本家 `Journal#editable_by?`)。読めないプライベート注記は編集もできない(本家が `Journal.visible` で絞るのと同じ)。`journals.updated_at` / `updated_by_id` を記録し履歴に「編集済み」を表示。本文を空にした注記は、変更履歴を持たない場合に限り削除する(本家は journals に destroy が無く空の行が残るだけで表示もされないため、見え方は同じ) |
| プライベート注記 | done | `journals.private_notes` 列 + `set_notes_private` / `view_private_notes` 権限。可視判定は本家 `Journal.visible_notes_condition` に準拠(公開 / 自分が書いた / 権限あり)で SQL 側に適用。注記が属性変更を伴う場合は本家 `split_private_notes` と同じく 2 件の journal に分割して変更履歴は公開のまま保つ。空の注記はプライベートにならない。通知もプライベート注記のときは権限保持者だけに本文を送り、他の宛先には汎用文のみ送る。`view_private_notes` / `set_notes_private` は本家同様メンバー専用で、非メンバー/匿名ロールには付与できない |
| プライベート課題 | done | `issues.is_private` と可視性判定(`domain/issue/visibility.ts`)に加え、`set_issues_private` / `set_own_issues_private`(own = 作成者)による設定可否の制御を実装。権限が無い場合は本家 `safe_attributes` と同じく送信値を黙って捨て、フォームにも項目を出さない |
| 変更履歴の記録 | done | `journal_details.property` は `attr` / `cf` / `relation` / `attachment` の 4 種。`attr` はプロジェクト・トラッカー・説明・親課題を含む(本家と同じ)。添付の追加/削除は本家の `Journal#journalize_attachment` と同じ形(`prop_key` = 添付 ID、ファイル名を追加時は `value`・削除時は `old_value`)で記録する。課題作成時に同時に添付したファイルは本家同様に履歴を作らない(その時点で journal が無い)。単票の履歴表示は本家 `details_to_strings` 相当に整形する(`domain/journal/detail-label.ts`): 属性名を日本語ラベルに、id を名称に解決し、添付は「ファイル foo.png を追加」、説明は「説明 を更新」と表示。解決に使う名称は画面がすでに表示した対象だけに限定し、未解決の id は短縮 id のまま出す(非公開プロジェクト名や閲覧できないチケット名が履歴から漏れないようにするため)。活動画面/Atom も注記が無い journal は同じ整形で要約を出す(フィードには閲覧者ごとの名称表がないため id は解決せず短縮 id のまま) |
| 添付ファイル | partial | 課題・Wiki・文書・プロジェクト・バージョンに添付可能。説明(description)は課題・Wiki・文書・ファイルのアップロード時に入力でき、`PATCH /api/v1/attachments/[id]` とファイル一覧から編集できる。課題・Wiki・文書の添付一覧は共通コンポーネント(`app/(dashboard)/projects/attachment-list.tsx`)で、画像はサムネイルをインライン表示する。注記への添付は無い |
| リアクション | done | journal への 👍(本家 6.1 の Reaction 相当) |
| CSV インポート | partial | 課題(`issue-import-actions.ts`)と工数(`time-entry-import-actions.ts`、`import_time_entries`)。課題の取り込みは本家 `IssueImport#authorized?` どおり `import_issues` と `add_issues` の両方を要求し、一覧のリンクも同じ条件で出す。既存ロールには `add_issues` を持つものに `import_issues` を付与(migration 0045)。工数のインポータ UI の整理は未着手 |
| カスタムフィールド: 書式 | partial | `string` / `text` / `int` / `float` / `date` / `bool` / `list` / `link` の 8 種。`link` は本家 `LinkFormat` に合わせ、値は文字列として保存し、課題詳細ではリンクとして表示する(scheme の無い値は http:// を付け、http / https 以外の scheme は通さない)。本家の URL パターン(`url_pattern`)は未対応。一覧の表示・絞り込みは文字列として扱う。本家の `user` / `version` / `enumeration` / `attachment` / key-value list / **複数選択** が無い |
| カスタムフィールド: 対象 | partial | `Issue` / `Project` / `TimeEntry`。User / Group / Version が無い |
| カスタムフィールド: 適用範囲 | partial | トラッカー単位の紐付け + プロジェクト設定での有効化。ロール別の可視/編集可否(本家の `visible` / `role_ids`)が無い |
| カスタムフィールド: 課題での値の入力 | done | 作成/更新フォームと REST API の双方から設定可能。7 書式それぞれの入力欄を `issues/custom-field-inputs.tsx` が描画し、トラッカーの紐付けで絞り込む。更新時は属性変更と同じ 1 件の journal に `property = 'cf'` の明細として記録(本家 Journal と同じ)。値の検証は課題行を書き換える前に行うため、不正値で中途半端な更新が残らない |
| カスタムフィールド: プロジェクトでの値の入力 | done | プロジェクト設定画面から編集可能 |
| カスタムフィールドによる絞り込み・表示列 | done | 課題一覧のフィルタ・表示列・ソート・グルーピング・合計すべてで `cf_<id>` を扱える(`domain/query/columns.ts`)。書式ごとの扱いは本家準拠 — 合計は `int`/`float` のみ、グルーピングは `text` と `float` を除く(本家 `FloatFormat` が `group_statement` を持たないため)。値の数値キャストは正規表現で保護してあり、非数値が混ざった行があっても一覧全体が落ちない |

## 2. クエリ・一覧・エクスポート

| 機能 | 状態 | 備考 |
|---|---|---|
| 保存済みクエリ | done | 作成・編集・削除・複製(`application/queries/`)、可視性(private/roles/public)、プロジェクト単位/グローバル(本家 `Query.global_or_on_project` — プロジェクト一覧は自分のものとグローバルの両方、横断一覧はグローバルのみを出す。グローバルな保存は `/issues` から行える)。権限は `save_queries` / `manage_public_queries` を追加。可否は本家 `Query#editable_by?` の移植(`domain/query/visibility.ts`)— private は所有者のみ、public/roles は `manage_public_queries` 保持者、グローバルな public は管理者のみ。`manage_public_queries` を持たない利用者の公開指定は本家同様エラーにせず private へ落とす |
| フィルタの適用 | done | 画面上でその場に条件を組み立てる UI(`issues/issue-query-form.tsx`)。演算子は本家 `Query.operators` のうち next-pm に対象列がある 31 種(等価/空/範囲/部分一致/前方後方一致/未完了・完了/相対日付 17 種)。`me` の展開、`o`/`c` のステータス集合展開も本家準拠。URL は本家と同じ `f[]` / `op[field]` / `v[field][]` / `c[]` / `t[]` / `group_by` / `sort` / `set_filter` |
| 表示列の選択 | done | `queries.column_names`。既定は本家 `Setting.issue_list_default_columns` と同じ 6 列。`spent_hours` は `view_time_entries` 保持者にのみ提示(本家 `IssueQuery#initialize_available_columns` 準拠) |
| グルーピング | done | `queries.group_by`。グループ見出しに件数と小計を表示。件数・小計はページではなく絞り込み結果全体に対して SQL で集計するため、グループがページ境界で分割されても正しい。グループの並び順は本家同様その列のソート式(ステータスなら `position`)に従う |
| ソート | done | `queries.sort_criteria`。列見出しクリックで多段ソート(本家同様 3 キーまで、クリックした列が先頭へ)。UUID 主キーには順序が無いため `id` 列のソートは `created_at` に対応付け、ページングが安定するよう常に `id` を最終キーに付ける |
| 合計行(予定工数/作業時間などの total) | done | 本家 `options[:totalable_names]` 相当を `queries.totalable_names` に保持。予定工数・作業時間・数値カスタムフィールドの合計を、全体とグループ単位の両方で SQL 集計。作業時間の列と合計は `view_time_entries` 保持者にのみ出し、本家 `TimeEntry.visible_condition` 相当(ロールの `time_entries_visibility` が `own` ならそのプロジェクトでは自分の分だけ数える)も効かせる。横断一覧ではこの判定がプロジェクトごとに異なるため、SQL 側で「`all` のプロジェクト、または `own` のプロジェクトで自分名義」という条件に展開する |
| ページネーション | done | 件数・行・グループ集計・合計すべて SQL 側で処理し、1 ページ分しかメモリに載せない。プライベート課題の可視性も `Array#filter` ではなく WHERE 句で効かせてあるため、件数と合計が可視範囲とずれない。ページサイズは本家 `Setting.per_page_options`(既定 `25,50,100`)。範囲外のページ番号は最終ページに丸める |
| CSV エクスポート | partial | 課題のみ(`/api/projects/[identifier]/issues/csv`)。工数・ユーザーの CSV が無い。一覧と同じ URL 契約・同じユースケースを使うため、選択した表示列・フィルタ・ソートをそのまま反映する(行数の上限は本家同様 `issues_export_limit`、既定 500) |
| PDF エクスポート | done | 課題一覧・Wiki・ガント |
| Atom フィード | done | プロジェクト活動(`/api/projects/[identifier]/activity/atom`)、横断活動(`/api/activity/atom`)、課題一覧のプロジェクト単位・横断の両方(`/api/projects/[identifier]/issues/atom`, `/api/issues/atom`)。課題フィードは一覧と同じ `f[]`/`query_id` を読むため、絞り込んだ一覧をそのまま購読できる。本家 `Issue` の `acts_as_event` に合わせ、並び順は作成日の降順・件名は `トラッカー #id (ステータス): 題名` |

## 3. プロジェクト

| 機能 | 状態 | 備考 |
|---|---|---|
| 作成・編集 | done | 名称/識別子/説明/公開設定/親プロジェクト |
| 階層(サブプロジェクト) | done | nested set(`lft`/`rgt`)で実装 |
| モジュールの有効/無効 | done | `enabled_modules` + 設定画面あり。`calendar` / `gantt` も権限レジストリに登録済みで、他モジュールと同じく個別に切り替えられる |
| ステータス(active/closed/archived) | done | ドメイン判定に加えて切り替え操作を実装。アーカイブ/解除は管理画面のプロジェクト一覧(本家同様 admin 限定)、閉鎖/再開はプロジェクト概要(`close_project`)。本家の連鎖規則もそのまま: アーカイブは配下全体、解除は自分と祖先のみ(配下は解除しない)、閉鎖/再開は配下の該当ステータスのみ。配下以外のチケットが配下のバージョンを使っている場合はアーカイブを拒否する |
| プロジェクトの削除 | done | `delete_project` を追加。本家 5.1 と同じく管理者以外でも権限があれば削除できる(ただし `Project#deletable?` の `leaf?` によりサブプロジェクトを持つ場合は管理者のみ)。識別子の入力で確認し、配下のサブプロジェクト・チケット・Wiki・工数・列挙項目の上書きと、ディスク上の添付ファイルまで連鎖削除する。nested set の穴も詰める |
| プロジェクトのコピー | done | `copyProjectAction` |
| 新規プロジェクト作成権限 | done | `add_project`(グローバル判定)と親プロジェクト側の `add_subprojects` で判定。非管理者が作成した場合は Setting `new_project_user_role_id` のロール(未設定なら最初の付与可能ロール)でメンバーに追加する |
| 公開設定の権限分離 | done | `select_project_publicity` / 既存の `select_project_modules` を作成時・設定更新時の双方で判定。権限が無い場合は本家の safe_attributes と同じく送信値を破棄する(チェックボックスを出さないだけでは、未チェックと区別が付かず非公開になってしまうため) |
| メンバー管理 | done | ユーザー/グループの追加・削除に加えて、メンバー一覧でロールをその場で変更できる(本家 `MembersController#update`)。グループ由来の行は本家の `Member#any_inherited_role?` と同じく編集も削除もできず、グループ側のロールを変えると配下の継承行も追従する。ロールの選択肢は本家 `Role.givable` に合わせ、builtin(非メンバー/匿名)を除外する |
| バージョン(ロードマップ) | done | 作成/更新/削除、共有範囲(sharing)、Wiki ページ紐付け、ロードマップ画面 |
| 課題カテゴリ | done | 作成/更新/削除 |
| プロジェクト単位の作業分類 | done | `manage_project_activities` を追加し、プロジェクト設定の「作業分類」タブで有効/無効を切り替える(本家 `ProjectEnumerationsController`)。システム側と異なる状態にしたときだけ `parent_id` 付きの子行を作り、同じ状態に戻したら工数を親へ戻してから子行を削除する。工数入力の選択肢は `Project#activities` 相当の実効リストを使う。本家が併せて上書きする活動のカスタムフィールド値は、next-pm の `customizedType` が Issue / Project のみのため対象外。**未対応**: 本家 `TimeEntry#validate_time_entry` の `activity_id` 包含チェック(`project.activities.include?`)が無く、無効化した分類の ID を直接送れば記録できてしまう。工数の入力経路(`log-time.ts` / `time-entry-actions.ts` / REST)は §9 の担当範囲のため手を付けていない |

## 4. ロールと権限

| 機能 | 状態 | 備考 |
|---|---|---|
| ロール定義 | done | 作成/編集/削除/複製/並べ替え、builtin ロールの編集画面あり。本家 `Role#setable_permissions` 準拠で、非メンバーには `:require => :member`、匿名にはさらに `:require => :loggedin` の権限を提示しない |
| 可視性設定 | done | `issues_visibility` と `time_entries_visibility` は読み取り側で効いている。`users_visibility` は本家 `Principal.visible`(`app/models/principal.rb`)どおり、管理者以外の閲覧者に対して、活動の作者フィルタ(`/activity?user_id=`)とメンバー追加のログインID 照会で強制する(見えない利用者は存在しない利用者と同じ扱い)。管理者は全員を見る。プロジェクト単位の候補(メンバー・フィルタ)は本家どおりプロジェクトのメンバーから作るため、規則の対象外 |
| ワークフロー(遷移) | done | ロール × トラッカー × 遷移元/先 |
| ワークフロー(フィールド権限) | done | 必須/読取専用(`workflow_field_permissions`) |
| 権限キーの網羅 | done | 本家 80 に対し next-pm は 80(`permission-registry.ts` 実数)。本家の `manage_categories` は next-pm では `manage_issue_categories`(命名の差異)。未登録のキーは無い。 |
| プロジェクトモジュール | done | 本家 10 と同数。`calendar` / `gantt` を追加し、`PROJECT_MODULES` を権限レジストリから一元化した |

### 4.1 未実装の権限キー(本家 `lib/redmine/preparation.rb` 比)

なし(本家の全キーを登録済み)

> 命名の差異(欠落ではない): next-pm の `manage_issue_categories` は本家の `manage_categories` に対応する。

> 本家の `:public => true`(ロールに関係なく全員に与えられる)は next-pm のレジストリに概念が無い。`view_project` を既存ロールへ明示的に seed しているのと同じ扱いで、`view_members` も builtin 2 ロールと Manager へ seed してある。本家よりわずかに厳しい(ロールから外せてしまう)点だけが差異。

## 5. ユーザー・認証・アカウント

| 機能 | 状態 | 備考 |
|---|---|---|
| ログイン/ログアウト | done | 自前 JWT セッション(`jose`)。JWT は `user_sessions` 行の id を持ち、セッションの実体はサーバ側にある(有効期限・無操作タイムアウト・パスワード変更時の全端末ログアウトのため)。ログイン経路はパスワード・LDAP・LDAP オンザフライ・2FA 通過後・自動ログインのすべてが `domain/user/login-gate.ts` の `evaluateLoginGate` を通る |
| 二要素認証 | done | TOTP + バックアップコード、ログイン時のゲート、設定 `twofa`(無効/任意/管理者に必須/全員に必須)による強制まで。**本家との差**: 本家は `check_twofa_activation` で先にログインさせてから毎リクエスト設定画面へ飛ばすが、next-pm のレイアウトはパスを知らないためリダイレクトループを作れない。代わりにセッション発行の**前**に `/login/twofa/setup` でペアリングさせる(到達状態は同じ)。設定で必須になっているアカウントは 2FA を無効化できない |
| パスワード変更 | done | セルフサービス。設定 `password_min_length` / `password_required_char_classes` を適用(本家 `User#validate_password_length` / `#validate_password_complexity`)。変更時に本家 `User#destroy_tokens` と同じく全セッションと自動ログイントークンを破棄し、操作した本人だけ再発行する |
| パスワード再設定 | done | メールトークン方式、Host ヘッダ注入対策済み(`interface/http/app-origin.ts`、有効化メールと共用)。設定 `lost_password` で無効化でき、送信アクション側でも検査する。再設定後は全セッションと自動ログイントークンを破棄 |
| 自動ログイン(remember me) | done | 設定 `autologin`(0/1/7/30/365 日)、`user_tokens` にハッシュのみ保存、ログアウト・パスワード変更・再設定で失効。**本家との差**: 本家は `user_setup` で毎リクエスト引き換えるが、Cookie を書けるのは Route Handler だけなので `proxy.ts` が「セッション Cookie 無し + 自動ログイン Cookie 有り」だけを検知して `/api/account/autologin?back=…` に渡す(DB は触らない)。ディープリンクでも動き、失敗時は必ず Cookie を消すのでループしない |
| セルフ登録 | done | 設定 `self_registration` の 4 モード(無効/メールで有効化/管理者が手動で有効化/自動)。モード判定はフォームの出し分けではなくユースケース内で行う(本家 `AccountController#register` の 1 行目と同じ)。`registered` 状態・有効化トークンのメール・管理者への有効化依頼メール・ユーザー一覧からの「有効化」まで。有効化リンクはログインさせず(本家も `signin_path` で終わる)、`registered` 以外のアカウントには効かないのでロック済みアカウントの解除には使えない |
| メールアドレスの確認 | done | **本家 6.x にトークンによる確認フローは存在しない**(ソースを確認: `email_verification` 設定も `EmailAddress` のトークン関連も無い)。本家が行うのは `EmailAddress` の `after_*_commit` によるセキュリティ通知と `destroy_tokens` で、next-pm もそれに合わせた: 変更時は**変更前**のアドレスへ、追加時は本人へ、削除時は削除されたアドレスへ、通知 ON/OFF 時はそのアドレスへ通知し、アドレスの変更・削除時はパスワード再設定トークンを破棄する |
| 複数メールアドレス | done | `email_addresses` テーブル(追加・削除・通知 ON/OFF、上限は設定 `max_additional_emails`)。**本家との差**: 本家は既定アドレスも同テーブルに `is_default` で持つが、next-pm は `users.mail` を既定アドレスのまま残し、このテーブルは追加分だけを持つ(`users.mail` は NOT NULL/UNIQUE でメールハンドラ・通知・REST API・seed が読むため)。代償として一意性が 2 テーブルに跨り DB 制約にできないので、登録・マイアカウント・管理画面・アドレス追加のすべてが両方を検査し、`findByMail` も両方を検索する(本家 `User.find_by_mail` → `having_mail` と同じく、追加アドレスでもパスワード再設定とメールハンドラの送信者照合が当たる)。通知は本家 `User#notified_mails` と同じく既定アドレス + `notify` が有効な追加アドレス全部に届く。有効化・パスワード再設定・管理者への有効化依頼・有効化完了のメールはトランザクションメールとしてアドレス直指定で送る(本家 `Mailer.deliver_register` 等と同じ。ユーザー ID 経由だと `registered` のアカウントや `mail_notification = none` の相手に届かない) |
| LDAP 認証 | partial | `.env` の `LDAP_URL` による単一接続。**管理画面の認証方式(auth_sources)登録・複数ソース・属性マッピング・オンザフライのアカウント作成が無い** |
| API キー | done | マイアカウント画面の表示・再生成(本家 `MyController#show_api_key` / `#reset_api_key`)。**これが入るまで `users.api_key` に値を書く経路が存在せず、REST API は事実上到達不能だった** |
| Atom キー | done | 初回フィード表示時の自動発行(`get-or-create-atom-key.ts`)に加え、マイアカウント画面からの再生成(本家 `MyController#reset_atom_key`) |
| ユーザー個人設定 | partial | 自動ウォッチ条件に加え、氏名・メールアドレス・言語・タイムゾーン・履歴の表示順・メール通知方式・メールアドレス非公開・自己通知不要をマイアカウント画面で編集できる。実際に効くのは**履歴の表示順**(課題単票の journal 並び、本家 `comments_sorting`)と**自己通知不要**(通知の配信時フィルタ、本家 `no_self_notified`、既定 true で従来の挙動と同じ)と**メール通知方式の `none`**。言語は i18n 基盤が無いため(§0.1)、メール通知方式の中間 3 択はプロジェクト単位の通知購読が無いため(§11)、メールアドレス非公開は管理画面以外に他人のアドレスを出す画面がまだ無いため、保存されるが未反映 |
| アバター | partial | 設定 `gravatar_enabled`(既定 OFF。有効にするとレンダリングのたびにアドレスのハッシュが gravatar.com に渡るため)。OFF のときはイニシャルを表示する。現状の表示箇所はマイアカウント画面のみで、課題の作成者・担当者やメンバー一覧にはまだ出していない |
| アカウントの自己削除 | done | 設定 `unsubscribe`(既定 OFF)+ マイアカウント画面の削除セクション。可否は本家 `User#own_account_deletable?` のとおり `Setting.unsubscribe?` かつ(管理者でない **または** 他に有効な管理者が居る)で、管理者も最後の一人でなければ退会できる。削除は本家 `User#remove_references_before_destroy` と同じく作成物を匿名ユーザーへ付け替えてから行う(`UserAdminRepository.reassignReferencesAndDelete`、管理画面 CRUD 側と共用)。管理画面の削除は本家 `UsersController#destroy` と同じく自分自身を拒否し、こちらが本家 `MyController#destroy` にあたる許可経路 |

## 6. 管理画面

| 機能 | 状態 | 備考 |
|---|---|---|
| ユーザー | done | 作成/編集(ログインID・氏名・メール・管理者・認証方式・パスワード設定)/ロック・ロック解除・有効化/削除/所属プロジェクト編集(本家 `principal_memberships`)。削除時は本家 `User#remove_references_before_destroy` 準拠で、作成物を匿名ユーザーへ引き継ぎ、担当は解除、非公開クエリのみ破棄。`registered` → `active` への「有効化」はセルフ登録の手動承認モードの受け口でもあり、本家 `Mailer.deliver_account_activated` と同じく本人へ通知メールを送る。パスワードは設定 `password_min_length` / `password_required_char_classes` を適用し、メールアドレスの重複は `email_addresses` の追加アドレスも含めて検査する |
| グループ | done | 作成/削除/メンバー増減 |
| ロール | done | 作成/編集/削除/複製、組み込みロール(非メンバー/匿名)の権限編集、並べ替え、ワークフローのコピー。削除は本家 `Role#check_deletable` 準拠で、組み込みロールと割り当て済みロールは拒否 |
| トラッカー | done | 作成/編集/削除/並べ替え/ワークフローのコピー/標準フィールドの無効化(本家 `core_fields`)。削除は本家 `Tracker#check_integrity` 準拠で、チケットが1件でもあれば拒否。無効化したフィールドは `createIssue` / `updateIssue` で本家 `safe_attribute_names` の `names -= disabled_core_fields` と同じく送信値を捨て(作成/編集/コピー/一括編集/REST/メールの全経路が同じ扱い)、作成・編集フォームでも項目自体を出さない |
| 課題ステータス | done | 作成/編集(名称・説明・完了フラグ・既定の進捗率)/削除/並べ替え。削除は本家 `IssueStatus#check_integrity` 準拠で、使用中のチケットまたは既定ステータスにしているトラッカーがあれば拒否 |
| ワークフロー | done | 遷移とフィールド権限の編集 |
| カスタムフィールド | done | 作成/編集/削除(入力済みの値ごと)/並べ替え。本家同様、保存後の形式(`field_format`)と対象(STI の型)は変更不可 |
| 列挙項目(優先度・作業分類・文書カテゴリ) | done | 作成/編集(名称・既定フラグ・有効フラグ)/削除/並べ替え。削除は本家 `EnumerationsController#destroy` 準拠で、使用中なら付け替え先(`reassign_to`)必須。プロジェクト単位の作業分類の上書きは §3 で対応済み |
| アプリケーション設定 | partial | 「全般」15 項目(添付上限・REST API 有効化・活動日数・フィード件数・0 時間工数の可否・進捗率の算出方式・プロジェクト間の関連許可・リポジトリログ表示件数・親チケットの日付/優先度/進捗率の算出方式・1 ページあたりの表示件数・エクスポート上限)+「認証」12 項目 +「プロジェクト」5 項目(`default_projects_public` / `default_projects_modules` / `default_projects_tracker_ids` / `sequential_project_identifiers` / `new_project_user_role_id`)+「リポジトリ」のコミットキーワード各種。認証タブは本家とほぼ同じ構成(`login_required` / `autologin` / `self_registration` / `password_min_length` / `password_required_char_classes` / `lost_password` / `twofa` / `unsubscribe` / `gravatar_enabled` / `session_lifetime` / `session_timeout` / `max_additional_emails`)。認証タブの既定値は本家の既定ではなく **next-pm の従来の挙動**に合わせてある(`self_registration` と `unsubscribe` は本家の既定と逆の OFF。既存環境でこの画面が出た瞬間に公開登録とアカウント削除が開くのを避けるため)。未対応は表示(日時書式、既定言語)・課題追跡(既定トラッカー、添付の既定)・メール通知の設定、および `password_max_age` / `show_custom_fields_on_registration` / `email_domains_allowed|denied` |
| 情報画面(環境情報) | partial | 本家 `AdminController#info` の 3 項目(既定の管理者パスワード、添付の保存先、マイグレーションの実行状況)を `/admin/info` で確認できる。環境は next-pm・Next.js・ランタイム・PostgreSQL・Git / Mercurial / Subversion の版。サムネイル・PDF 変換(本家の ImageMagick / Ghostscript / Pandoc)は next-pm に該当機能が無いため項目に入れていない |
| プラグイン一覧 | out-of-scope | プラグイン機構そのものが無い |

## 7. Wiki

| 機能 | 状態 | 備考 |
|---|---|---|
| 閲覧・編集・版歴・差分・注釈 | done | 注釈(blame)を追加(`wiki/[title]/annotate`、本家 `WikiAnnotate`)。各行を最初に導入したバージョンと著者を表示し、履歴の各行からたどれる |
| ページ名変更(リダイレクト付き) | done | 権限は本家と同じく `rename_wiki_pages` または `manage_wiki`(本家 `preparation.rb` は `wiki#rename` を両方に割り当てている)。保護ページは `protect_wiki_pages` が無いと改名できない |
| マクロ | done | テキストを返す `toc` / `include` / `child_pages`(`domain/wiki/macros.ts`)に加え、描画を伴う `collapse` / `thumbnail` / `issue` / `macro_list` / `recent_pages` を追加(`domain/wiki/macro-blocks.ts`)。本家 `MACROS_RE` と同じ記法(ブロック引数・`key=value` オプション・`!` によるエスケープ)を解釈する。ドメイン側はブロックの配列を返すだけで、HTML 文字列は組み立てない(描画は `wiki-content.tsx`)。`issue` は閲覧できないチケットを `#id` だけにフォールバックし件名を出さない、`thumbnail` はそのページ自身の添付のみを参照する。`hello_world` は不要なため未実装 |
| エクスポート | done | HTML / PDF / ZIP |
| 添付 | done | 追加は `edit_wiki_pages`、削除は本家と同じ専用権限 `delete_wiki_pages_attachments`(`acts_as_attachable :delete_permission`)。いずれも保護ページでは `protect_wiki_pages` が必要 |
| ページ削除 | done | `delete_wiki_pages` を追加し、確認画面(`wiki/[title]/destroy`)で本家 `WikiController#destroy` の 3 択(子をトップレベルへ/子も削除/別ページへ付け替え)を提供。REST の DELETE も同権限 + `?todo=` に対応(既定は本家と同じ nullify)。ページ削除時に添付・ウォッチャー・そのページ宛てリダイレクトも併せて削除する(本家 `delete_redirects` と acts_as_attachable/watchable の dependent destroy 相当) |
| 保護ページ | done | ページ画面の保護/解除トグル(`protect_wiki_pages`)。保護ページの編集・改名・添付の追加/削除は同権限が無いと拒否(本家 `WikiPage#editable_by?` を `domain/wiki/protection.ts` に再実装)。`Sidebar` は作成時に自動で保護(本家 `DEFAULT_PROTECTED_PAGES`) |
| 親子階層 | done | 目次(`wiki/index`、本家 `index` の親子ツリー)と日付順目次(`wiki/date_index`)、ページ画面のパンくず・子ページ一覧(`domain/wiki/hierarchy.ts`)。親ページの選択は編集フォーム(新規ページ)と改名フォームから行い、自分自身・子孫・他プロジェクトのページは拒否(本家 `WikiPage#validate_parent_title`)。本家の safe_attributes に合わせ、既存ページのタイトルと親の変更は `rename_wiki_pages` 保持者のみ(`manage_wiki` だけでは画面に入れても変更できない) |
| Wiki の開始ページ設定・Wiki 自体の削除 | done | プロジェクト設定に Wiki タブを追加(`manage_wiki`)。開始ページを保存すると `/projects/:id/wiki` の遷移先が変わる。開始ページを改名すると設定も追従し、`manage_wiki` 保持者は改名フォームのチェックボックスで別ページを開始ページにできる(本家 `WikiPage#update_wiki_start_page` / `is_start_page`)。Wiki の削除(本家 `WikisController#destroy`)は全ページ・版歴・添付・リダイレクトを削除し、開始ページを既定値へ戻す(本家 `Wiki.create_default` 相当) |
| ウォッチ | done | ページ単位のウォッチに加え、ウォッチャー一覧と他ユーザーの追加/削除を本家と同じ 3 権限(`view_wiki_page_watchers` / `add_wiki_page_watchers` / `delete_wiki_page_watchers`)で制御。追加できる相手は `view_wiki_pages` を持つプロジェクトメンバーのみ(本家 `Principal.assignable_watchers`) |
| 版歴の閲覧権限 | done | `view_wiki_edits` を追加し、履歴・差分ページと活動フィードの Wiki 更新(本家 `WikiContentVersion` の `acts_as_activity_provider`)を同権限で制御 |

## 8. フォーラム・News・文書・ファイル

| 機能 | 状態 | 備考 |
|---|---|---|
| フォーラム(トピック/返信) | done | 投稿・編集・削除、ウォッチ、引用返信(本家 `MessagesController#quote` と同じ `RE:` 付与と `> ` 引用)、添付(`acts_as_attachable` 既定どおり追加は `Message#editable_by?`、削除は `edit_messages`)、別ボードへのトピック移動(`edit_messages`。本家 `update_messages_board` と同じく返信も一緒に移る) |
| フォーラム(ボード自体の管理) | done | 作成・編集・削除・並べ替え・親フォーラム(`manage_boards`)。本家 `acts_as_tree :dependent => :nullify` と同じく、削除したボードの子ボードはプロジェクト直下へ繰り上がり、トピックと添付だけが消える。並び順は `acts_as_positioned :scope => [:project_id, :parent_id]` と同じく兄弟集合内で 1 始まりの連番 |
| トピックのロック/固定表示(sticky) | done | 本家 `Message#locked` / `sticky`。トピック編集時に `edit_messages` を持つ場合だけ設定できる(本家の条件付き `safe_attributes` と同じで `edit_own_messages` だけでは不可)。ロック中のトピックは返信フォームと引用リンクを出さず、`postMessage` も拒否する。一覧は sticky を先頭に固定(第二キーは本家の `COALESCE(last_reply_id, id)` 相当を持たないため作成日時) |
| トピックのウォッチャー管理 | done | `view_message_watchers` / `add_message_watchers` / `delete_message_watchers`。本家 `WatchersController#authorize_for_watchable_type` と同じく root トピックだけが対象で、追加できるのはプロジェクトメンバーのみ。本家 `watchers/_watchers.html.erb` と同じく「追加」操作と「一覧の表示」は別のゲートで、`add_message_watchers` だけのユーザーには追加フォームだけが出て名前の一覧は出ない |
| News | done | 作成・編集・削除・添付・コメント追加/削除・ウォッチ。編集/削除/添付/コメント削除はすべて `manage_news`(本家 preparation.rb は `comments#destroy` も `manage_news` 配下に置き、「自分のコメント」例外は無い)。コメント追加は `comment_news`。横断一覧 `/news` は本家 `NewsController#index`(プロジェクト無し)と同じく `view_news` を持つプロジェクトを新しい順に 10 件 |
| 文書(Documents) | done | 作成(`add_documents`)・編集(`edit_documents`、本家 `safe_attributes 'category_id', 'title', 'description'`)・削除(`delete_documents`)・添付。添付の追加は本家 preparation.rb が `documents#add_attachment` を `add_documents` と `edit_documents` の両方に載せているのに合わせてどちらでも可、削除は `acts_as_attachable :delete_permission => :delete_documents` のとおり `delete_documents`。一覧はカテゴリ/日付/タイトル/投稿者でグループ化(本家 `DocumentsController#index` の `sort_by`)。削除時は本家 `has_many :attachments, dependent: :destroy` と同じく添付レコードと実ファイルも消す(`application/documents/delete-document.ts`、画面と REST の両方が同じ経路) |
| ファイル(Files モジュール) | done | `/projects/[identifier]/files`。プロジェクト直下とバージョン単位のファイルを本家 `FilesController#index` と同じ区分け(プロジェクト → バージョンの逆順)で一覧し、ファイル名/日付/サイズ/DL 数でソート、ダイジェストと説明を表示する。追加・削除は `manage_files`、ダウンロードのたびに `attachments.downloads` を加算(本家と同じく Project/Version のみ)。ファイルを持つバージョンは `Version#deletable?` と同じく削除できない |

## 9. 工数管理

| 機能 | 状態 | 備考 |
|---|---|---|
| 工数の記録 | done | 課題単票の `log-time-form` と、チケット任意のプロジェクト単位フォーム(`time-entries/new`、本家 `timelog/new` 相当) |
| 工数の編集・削除 | done | 一覧・課題単票からの編集画面(`time-entries/[entryId]/edit`)と削除。`editable_by?`(visible かつ 自分の工数+`edit_own_time_entries` または `edit_time_entries`)を `domain/time-entry/visibility.ts` に実装。削除権限は本家同様に編集権限と同一 |
| 工数の可視性(ロール設定) | done | `time_entries_visibility` が `own` のロールは自分名義の工数しか見えない(`TimeEntry#visible?` 相当)。一覧・レポート・課題単票・CSV エクスポート・REST API(一覧/個別)・編集/削除のすべてが同じ述語(`interface/http/time-entry-access.ts` の `canAccessTimeEntry`)を通る。活動(`application/activity/list-project-activity.ts`)だけは Application 層から Interface 層を参照できないため、同じ 3 条件をインラインで適用している。課題一覧の `spent_hours` 列・ソート・合計も同じロール設定で絞る(`SpentHoursScope`、本家 `Issue.load_visible_spent_hours` 相当) |
| プロジェクトの工数一覧 | done | クエリエンジン駆動に置き換え(`domain/query/time-entry-columns.ts` の列カタログ、`time-entry-search.ts` の読み取りモデル、`application/time-entries/list-time-entries.ts`)。フィルタ・表示列・ソート・グルーピング・合計・ページング・保存済みクエリ(`queries.type = 'TimeEntryQuery'`)が横断一覧と同じ実装で動く。集計レポート(`./report`)は本家同様に別アクションのまま変更なし |
| 横断の工数一覧 | done | `/time_entries`。プロジェクト一覧と同じ `TimeEntryTable` / 同じユースケースで、スコープだけが「`view_time_entries` を持つ全プロジェクト」に変わる。可視性は本家 `TimeEntry.visible_condition` どおりプロジェクトごとの `time_entries_visibility` を OR で展開し、加えて next-pm 独自の「見えない課題に紐づく工数は出さない」規則(`canAccessTimeEntry`)も SQL 側で効かせる。編集可否は行のプロジェクトの `edit_time_entries` / `edit_own_time_entries` で判定 |
| 他ユーザー名義での記録 | done | `log_time_for_other_users`。対象は `TimeEntry#assignable_users`(= `log_time` を持つロールの有効なメンバー + 自分)に限定され、権限が無ければ選択欄自体を出さずサーバ側でも拒否 |
| 工数の一括編集 | missing | 本家 `TimelogController#bulk_edit` / `bulk_update` |
| 工数のカスタムフィールド | partial | 対象 `TimeEntry` のカスタムフィールドを管理画面から作成でき、記録・編集フォームと REST API から値を設定できる。ロール別の可視/編集可否は §1 と同じ制約 |
| 工数の CSV エクスポート・インポート | partial | 一覧と同じ表示列・フィルタ・ソートで出すクエリ駆動のエクスポート(`/api/time_entries/csv`、`/api/projects/[identifier]/time-entries/query-csv`)と、列構成がインポータと一致する固定形式のエクスポート(`/api/projects/[identifier]/time-entries/csv`)の2本立て。表示列は利用者が変えられるため、取り込みが当てにできる形式にはならない — だから置き換えずに併置している。インポート(`import_time_entries`、`time-entries/import`)は固定形式の側と対応する。本家の多段マッピングウィザードは対象外で、単一ステップのアップロード(課題インポートと同じ設計) |
| コミットメッセージからの工数記録 | done | `@2h` 記法(`commit_logtime_enabled`) |

## 10. リポジトリ(SCM)

| 機能 | 状態 | 備考 |
|---|---|---|
| Git / Subversion / Mercurial のブラウズ・差分・blame | done | CLI へのシェルアウト方式 |
| CVS / Bazaar / Filesystem | out-of-scope | 本家にはあるが対象外(artisan-pm 側でも同じ判断) |
| コミットメッセージ連携 | done | `fixes #id` 等での自動更新、参照キーワード、時間記録 |
| リビジョン一覧・詳細 | done | |
| 1 プロジェクトに複数リポジトリ | done | `scm_repositories` に `identifier` / `is_default` を追加し、unique 制約を `(project_id, identifier)` + 「1 プロジェクトに既定リポジトリは 1 つ」の部分 unique index に置き換えた。識別子の検証は本家 `Repository` と同じ(英小文字・数字・`-`・`_` のみ、数字だけは不可、255 文字まで、予約語 11 種 + next-pm 固有の `blame`、空文字も含めてプロジェクト内で一意、一度付けたら変更不可)。URL は既定リポジトリが `/projects/:id/repository`、それ以外が `/projects/:id/repository/:repositoryId`(本家の `identifier_param` と同じく識別子、無ければ ID)。プロジェクト設定に「リポジトリ」タブを追加し、追加・更新(識別子とメイン指定のみ。本家 `safe_attributes` と同じくパス・種類は作成時限定)・削除ができる。最初の 1 件は本家 `set_as_default?` と同じく強制的にメインになり、メインを外しても別のリポジトリが自動昇格しないのも本家どおり(表示は先頭のリポジトリにフォールバックする) |
| リポジトリの自動フェッチ | out-of-scope | cron 相当の仕組みを持たない設計判断(§15) |
| コミッターとユーザーの紐付け | done | 本家と同じく `changesets.user_id` 自体が紐付けの実体で、専用テーブルも `extra_info` も使わない。取り込み時に本家 `Repository#find_committer_user` と同じ順序で解決する(① そのコミッター文字列を持つ最新 changeset に既にユーザーが入っていればそれ、② `Name <email>` を分解してログイン一致、③ メール一致)。リポジトリ設定の「コミッタの紐付け」画面(本家 `RepositoriesController#committers`)で付け替えると、本家 `committer_ids=` と同じく そのリポジトリの既存 changeset を一括で書き換え、既存の journal・工数は書き換えない。以降の同期は①の経路で同じユーザーに解決される。コミットキーワードの工数記録は本家同様に紐付いたユーザー名義で行い、紐付かない場合は本家の `TimeEntry` 検証失敗と同じく記録をスキップする。**差分**: ログイン一致は完全一致のみ(本家は大文字小文字を無視するフォールバックを持つが、next-pm の `findByLogin` はログイン認証と共用のため緩めていない。大小が違うコミッターはこの画面で一度紐付ければ①の経路で固定される) |
| `commit_access` 権限 | done | 空の権限(本家 `preparation.rb` で `{}`)。本家の既定データでは Developer に付き、core はどこでも参照しない。Manager の seed に付与。既存ロールへの backfill は不要(挙動が無いため) |
| リポジトリ管理 WS(`/sys`) | partial | 本家 `SysController` の 3 エンドポイントを `GET /api/sys/projects`、`POST /api/sys/projects/:id/repository`、`GET\|POST /api/sys/fetch_changesets` で実装。`sys_api_enabled` = `1` と `sys_api_key` が一致する `key` パラメータを要求し、キーが空なら常に拒否(本家は空キーを許しうるため、より厳しくした)。一覧は有効なプロジェクトのうち repository モジュールを持つものと既定リポジトリ、作成は既定リポジトリが無いときだけ 201(あれば 409)、取り込みは対象プロジェクトの全リポジトリ。**未実装**: 管理画面での有効化とキー発行(現状は設定テーブルへ直接書く)。WS の `url` は絶対パス(Subversion は URL)を受け、キーの保持者を管理者と同じ信頼境界として扱う(本家と同じ) |

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
| issues | partial | GET / POST / PATCH(PUT エイリアス有り)/ DELETE。`GET /issues/:id?include=` は `children` / `relations` / `attachments` / `watchers` / `allowed_statuses` に対応(関連と子課題は相手課題の可視性で絞る。watchers は `view_issue_watchers` のときだけ。`allowed_statuses` は遷移表から。管理者は全件、本家 `new_statuses_allowed_to` どおり)。`changesets` は未対応。journals の更新は無い |
| projects | done | GET / POST / PUT / DELETE、`archive` / `unarchive` / `close` / `reopen`(本家 5.1 の API、POST / PUT 両対応で 204) |
| users | done | GET / POST / PUT / DELETE。PUT は部分更新(省略した項目は据え置き)、管理者のみ。Cookie 利用時は CSRF を確認する。DELETE は `lock` 指定で施錠、無指定で削除(本家 `UsersController#update` / `#destroy` と同じ)。PUT と管理画面の更新は `application/users/update-user.ts` を共有する。認証方式(auth source)は REST では変えない |
| memberships | done | 一覧・作成・PUT(ロール変更)・削除 |
| time_entries | done | 一覧・作成(`user_id` / `custom_field_values` 対応)・個別 GET / PUT / DELETE |
| versions / wiki / issue_categories / groups / relations | done | CRUD の主要部分は実装済み |
| news | done | `GET /api/v1/news`(`project_id` 無しなら本家の `GET /news.json` と同じ横断スコープ)・`POST`・`GET /api/v1/news/[id]`・`PUT`・`DELETE`。本家 `NewsController` の `accept_api_auth :index, :show, :create, :update, :destroy` と一致 |
| messages / documents | out-of-scope | 本家の `MessagesController` / `DocumentsController` / `CommentsController` には `accept_api_auth` も `*.api.rsb` も無く、REST API 自体が存在しない。next-pm が持つ `POST` / `DELETE` は本家に無い独自拡張なので、これ以上は広げない |
| trackers / issue_statuses / enumerations / custom_fields / roles / queries / search | done | 読み取り専用エンドポイント |
| attachments | done | `/api/attachments/[id]`(ダウンロード、API キー可)と `/api/attachments/[id]/thumbnail`、`/api/v1/uploads`、`/api/v1/attachments/[id]` の GET / PATCH(PUT エイリアス有り)/ DELETE |
| files | done | `GET /api/v1/projects/[identifier]/files`(バージョン情報・ダイジェスト・DL 数付き)と `POST`(`uploads` のトークンを `version_id` / `description` 付きで引き換え) |
| my/account | done | GET / PUT。PUT は本人のプロフィールと設定(`user`: 氏名・メール・言語・通知方式、`pref`: メール非公開・タイムゾーン・履歴の並び・自己通知)を部分更新する。画面と同じ `updateMyAccount` を使うので、メール変更の重複確認と通知も同じ。認証は API キーまたは Cookie(CSRF 確認あり) |
| OAuth2 プロバイダ | missing | 本家 `oauth2_applications` |

## 13. 横断機能

| 機能 | 状態 | 備考 |
|---|---|---|
| 横断検索 | partial | 全対象を横断して検索できる(`/search`)。対象種別の絞り込み・全語一致 / いずれか一致・タイトルのみ・未完了課題のみ・検索範囲(すべて / 自分のプロジェクト / サブプロジェクト含む / このプロジェクト)のオプションを本家 `SearchController` に合わせて実装した。権限は `search_project`(本家の public read)で、旧 `view_project` ゲートから移行する backfill を 0041 に入れた。残りは本家の対象種別のうち文書・ソースコード変更履歴・プロジェクトの検索(未実装) |
| プロジェクト活動 | done | `/projects/[identifier]/activity`、リポジトリのコミットも含む |
| 横断活動 | done | `/activity`。`list-project-activity` を可視プロジェクトごとに回してマージする実装で、イベント種別ごとの `view_*` 判定・プライベート注記/課題・工数の可視性はすべて既存の規則をそのまま通す(8 種それぞれ権限が違い、しかもプロジェクトごとにロールが違うので、1 本のクエリにまとめると規則が二重化する)。種別チェックボックス・日付ページング・`user_id` での絞り込み・Atom は本家と同じ。Atom は本家同様に日付の窓を持たず `feeds_limit` 件だけを返す |
| 横断課題一覧 | done | `/issues`。プロジェクト一覧と同じクエリエンジン・同じ URL 契約で、スコープだけが「`view_issues` を持つ全プロジェクト」に変わる。本家 `Issue.visible_condition(user)` と同じく可視性はプロジェクトごとに決まるため、`projectScopes`(プロジェクト単位の `issues_visibility` と `time_entries_visibility` の判定)を WHERE 句の OR に展開する。`project` 列・`project_id` フィルタ・グルーピングを追加(本家 `if project.nil?` 準拠。カテゴリはプロジェクト固有のためフィルタのみ外す)。CSV と Atom も同じ URL 契約で出力 |
| マイページ | partial | ブロック方式でカスタマイズ可(担当課題/報告課題/ウォッチ中/News/文書/作業時間)。本家にあってこちらに無いブロックは activity(活動)・calendar(カレンダー)・issue_query_selection(任意の保存済みクエリの結果) の 3 種(`../redmine/app/views/my/blocks/`) |
| ガントチャート | partial | 月単位のウィンドウ + PDF 出力。ズーム段階(日/週/月/四半期)、バージョン行・サブプロジェクト表示、PNG 出力が無い |
| カレンダー | done | 月グリッド |
| サマリーレポート | done | `/projects/[identifier]/reports` |

## 14. 表示・その他

| 機能 | 状態 | 備考 |
|---|---|---|
| Markdown 記法 | done | |
| Textile 記法 | missing | 本家は既定で両対応(旧データの互換用) |
| 本文プレビュー | missing(保留) | 本家 `PreviewsController` は Textile / Markdown を HTML にして返す。next-pm の説明文・コメントは記法を持たず、`whitespace-pre-wrap` の素のテキストとして表示している(`issues/[id]/page.tsx`)ため、プレビューの対象となる描画が無い。記法を入れる時(§4 の大項目「Textile 記法」)にあわせて作る |
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
