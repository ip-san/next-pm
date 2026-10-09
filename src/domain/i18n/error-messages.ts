import type { Locale } from "./locales";

/**
 * English for the messages the server produces: validation and permission errors from the domain, application and
 * action layers, and the few result lines the actions return. Unlike messages.ts, this table is keyed by the Japanese
 * text itself. Those messages are built deep in code that has no locale, and many tests assert the Japanese wording,
 * so the producers keep writing Japanese and the text is translated where it leaves the server (localizeMessage).
 *
 * A message with values in it is listed as a template: each `${…}` of the source becomes {0}, {1}, … in order.
 * error-messages.test.ts walks the source and fails when a Japanese literal has no entry here.
 */
export const ERROR_MESSAGES_EN: Record<string, string> = {
  "移動先のフォーラムが見つかりません。": "The target forum was not found.",
  "返信先のトピックが見つかりません。": "The topic you are replying to was not found.",
  "このトピックはロックされています。": "This topic is locked.",
  "使用中の項目です。付け替え先を選択してください。": "This value is in use. Choose a value to reassign it to.",
  "LDAP認証のアカウントはパスワードを変更できません。": "An LDAP account can't change its password here.",
  "現在のパスワードが正しくありません。": "The current password is incorrect.",
  "LDAP認証のアカウントはパスワードをリセットできません。管理者にお問い合わせください。": "An LDAP account can't reset its password here. Contact your administrator.",
  "リンクが無効か、有効期限が切れています。もう一度パスワード再設定をお試しください。": "The link is invalid or has expired. Request a new password reset.",
  "LDAPのパスワードを保存するには、サーバーにTOTP_ENCRYPTION_KEYの設定が必要です。": "Saving the LDAP password needs TOTP_ENCRYPTION_KEY to be set on the server.",
  "同じ名前の認証元が既にあります。": "An authentication source with this name already exists.",
  "名前は1〜60文字で入力してください。": "Name must be 1 to 60 characters.",
  "説明は255文字以内で入力してください。": "Description must be 255 characters or fewer.",
  "Wikiページ名は255文字以内で入力してください。": "Wiki page name must be 255 characters or fewer.",
  "不正な共有設定です。": "Sharing is not valid.",
  "同じ名前のバージョンが既に存在します。": "A version with this name already exists.",
  "このバージョンに割り当てられたチケットがあるため削除できません。": "This version can't be deleted because issues are assigned to it.",
  "このバージョンにファイルが登録されているため削除できません。": "This version can't be deleted because files are attached to it.",
  "不正なステータスです。": "Status is not valid.",
  "クエリが見つかりません。": "The query was not found.",
  "このクエリを削除する権限がありません。": "You are not allowed to delete this query.",
  "このクエリを編集する権限がありません。": "You are not allowed to edit this query.",
  "クエリ名は1〜255文字で入力してください。": "Query name must be 1 to 255 characters.",
  "ロールを指定するクエリでは、1つ以上のロールを選んでください。": "Choose at least one role for a query shared with roles.",
  "フィルタの内容が不正です。": "The filters are not valid.",
  "クエリを保存する権限がありません。": "You are not allowed to save queries.",
  "組み込みロールは削除できません。": "A built-in role can't be deleted.",
  "このロールが割り当てられたメンバーがいるため削除できません。": "This role can't be deleted because members hold it.",
  "このトラッカーのチケットがあるため削除できません。": "This tracker can't be deleted because issues use it.",
  "コメントを入力してください。": "Enter a comment.",
  "このアカウントは削除できません。": "This account can't be deleted.",
  "追加できるメールアドレスは{0}件までです。": "You can add up to {0} email addresses.",
  "メールアドレスが見つかりません。": "The email address was not found.",
  "アカウントの登録は受け付けていません。": "Registration is closed.",
  "このステータスのチケットがあるため削除できません。": "This status can't be deleted because issues use it.",
  "既定のステータスとして使用しているトラッカーがあるため削除できません。": "This status can't be deleted because a tracker uses it as its default.",
  "自分自身のアカウントはこの画面から削除できません。": "You can't delete your own account from this page.",
  "匿名ユーザーは削除できません。": "The anonymous user can't be deleted.",
  "自分自身のアカウントはロックできません。": "You can't lock your own account.",
  "パスワードは8文字以上で入力してください。": "Password must be at least 8 characters.",
  "内部認証に切り替えるにはパスワードを設定してください。": "Set a password to switch to internal authentication.",
  "親フォーラムが見つかりません。": "The parent forum was not found.",
  "この親フォーラムは指定できません。": "This forum can't be the parent.",
  "リビジョンが見つかりません。": "The revision was not found.",
  "リポジトリのパスを入力してください。": "Enter the repository path.",
  "Subversionリポジトリの場合、URL（file://, http(s)://, svn(+ssh)://）を入力してください。": "For a Subversion repository, enter a URL (file://, http(s)://, svn(+ssh)://).",
  "絶対パスを入力してください。": "Enter an absolute path.",
  "識別子は255文字以内で入力してください。": "Identifier must be 255 characters or fewer.",
  "識別子は英小文字・数字・ハイフン・アンダースコアのみ、数字だけの文字列は不可です。": "Identifier may contain only lowercase letters, digits, dashes and underscores, and can't be digits only.",
  "この識別子はリポジトリのURLで予約されているため使用できません。": "This identifier is reserved in repository URLs.",
  "識別子を持たないリポジトリは、1プロジェクトにつき1つまでです。": "A project can have only one repository without an identifier.",
  "この識別子のリポジトリは既に存在します。": "A repository with this identifier already exists.",
  "作業時間は0以上の数値を入力してください。": "Hours must be a number of 0 or more.",
  "作業時間は0より大きい数値を入力してください。": "Hours must be a number greater than 0.",
  "作業分類が不正です。": "Activity is not valid.",
  "チケットを自分自身に関連付けることはできません。": "An issue can't be related to itself.",
  "関連付け先のチケットが見つかりません。": "The related issue was not found.",
  "異なるプロジェクトのチケットは関連付けられません。": "Issues in different projects can't be related.",
  "親子関係にあるチケット同士は関連付けられません。": "An issue can't be related to its parent or child.",
  "循環した関連は作成できません。": "This relation would create a circular dependency.",
  "この関連は既に登録されています。": "This relation already exists.",
  "不正な入力が指定されました。": "The input is not valid.",
  "名前は1〜30文字で入力してください。": "Name must be 1 to 30 characters.",
  "説明は1〜255文字で入力してください。": "Description must be 1 to 255 characters.",
  "ホストはホスト名かIPアドレスで入力してください(スキームやパスは不要です)。": "Enter the host as a host name or IP address, without a scheme or path.",
  "ポートは1〜65535の整数で入力してください。": "Port must be a whole number from 1 to 65535.",
  "ログイン属性を入力してください。": "Enter the login attribute.",
  "フィルタはLDAPフィルタの形式(括弧で囲む)で入力してください。": "Enter the filter as an LDAP filter, in parentheses.",
  "\"{0}\"は必須項目です。": "\"{0}\" cannot be blank.",
  "整数を入力してください。": "Enter a whole number.",
  "数値を入力してください。": "Enter a number.",
  "true/falseの値を指定してください。": "Enter true or false.",
  "\"{0}\"は許可された値ではありません。": "\"{0}\" is not included in the list.",
  "候補から選択してください。": "Choose from the list.",
  "件名は1〜255文字で入力してください。": "Subject must be 1 to 255 characters.",
  "本文を入力してください。": "Enter the content.",
  "アカウントはまだ有効化されていません。": "Your account has not been activated yet.",
  "アカウントはロックされています。": "Your account is locked.",
  "環境変数で設定されたLDAP認証元がないため、その認証方式は選択できません。": "That authentication mode can't be chosen because no LDAP source is set in the environment.",
  "選択された認証方式が見つかりません。": "The selected authentication mode was not found.",
  "大文字": "uppercase letters",
  "小文字": "lowercase letters",
  "数字": "digits",
  "記号": "special characters",
  "パスワードは{0}文字以上で入力してください。": "Password must be at least {0} characters.",
  "パスワードには{0}を含めてください。": "Password must contain {0}.",
  "パスワードにログインIDや氏名、メールアドレスは使用できません。": "Password can't contain your login, name or email address.",
  "タイトルは1〜255文字で入力してください。": "Title must be 1 to 255 characters.",
  "カテゴリを選択してください。": "Choose a category.",
  "タイトルは1〜60文字で入力してください。": "Title must be 1 to 60 characters.",
  "概要は255文字以内で入力してください。": "Summary must be 255 characters or fewer.",
  "パスは相対パスで指定してください。": "Enter a relative path.",
  "不正なパスです。": "The path is not valid.",
  "不正なリビジョンです。": "The revision is not valid.",
  "認証元が見つかりません。": "The authentication source was not found.",
  "この認証元で作られたユーザーがいるため削除できません。": "This source can't be deleted because users authenticate with it.",
  "入力内容を確認してください。": "Check your input.",
  "トラッカーまたはロールが見つかりません。": "The tracker or role was not found.",
  "不正な遷移が指定されました。": "A transition is not valid.",
  "対象トラッカーを1つ以上選択してください。": "Choose at least one tracker.",
  "ユーザー・バージョン・列挙の形式はチケットのカスタムフィールドだけに指定できます。": "The user, version and key/value list formats are only available for issue custom fields.",
  "ユーザー・バージョン・列挙の形式には既定値を指定できません。": "The user, version and key/value list formats can't have a default value.",
  "存在しないトラッカーが指定されました。": "A tracker that doesn't exist was given.",
  "複数の値は、リスト・列挙・ユーザー・バージョンの形式だけに指定できます。": "Multiple values are only available for the list, key/value list, user and version formats.",
  "存在しないロールが指定されました。": "A role that doesn't exist was given.",
  "リスト・列挙の形式には選択肢を1つ以上指定してください。": "Enter at least one possible value for a list or key/value list.",
  "同じ選択肢を2つ以上指定できません。": "A possible value can't be given twice.",
  "カスタムフィールドが見つかりません。": "The custom field was not found.",
  "並べ替えの指定が不正です。": "The ordering is not valid.",
  "項目が見つかりません。": "The value was not found.",
  "付け替え先の項目が不正です。": "The value to reassign to is not valid.",
  "ログインしてください。": "Sign in first.",
  "コメントが見つかりません。": "The comment was not found.",
  "このコメントを編集する権限がありません。": "You are not allowed to edit this comment.",
  "チケットが見つかりません。": "The issue was not found.",
  "プロジェクトが見つかりません。": "The project was not found.",
  "この操作を行う権限がありません。": "You are not authorized to perform this action.",
  "対象のチケットが見つかりません。": "The issues were not found.",
  "遅延日数は数値で入力してください。": "The delay must be a number of days.",
  "関連が見つかりません。": "The relation was not found.",
  "不正なブロックです。": "The block is not valid.",
  "保存済みクエリのブロックは3つまでです。": "You can add up to 3 saved query blocks.",
  "不正な操作です。": "The action is not valid.",
  "日数は整数で入力してください。": "Days must be a whole number.",
  "クエリを選んでください。": "Choose a query.",
  "そのクエリは選べません。": "That query can't be chosen.",
  "リポジトリが見つかりません。": "The repository was not found.",
  "チケットが不正です。": "The issue is not valid.",
  "{0}件のコミットを取り込みました（うち、自動クローズ {1}件、工数記録 {2}件）。": "Fetched {0} commits ({1} closed issues, {2} time entries).",
  "ロールを1つ以上選択してください。": "Choose at least one role.",
  "指定されたログインIDのユーザーが見つかりません。": "No user has that login.",
  "既にこのプロジェクトのメンバーです。": "Already a member of this project.",
  "指定されたグループが見つかりません。": "The group was not found.",
  "このグループは既にこのプロジェクトのメンバーです。": "This group is already a member of this project.",
  "メンバーが見つかりません。": "The member was not found.",
  "カスタムフィールドの入力内容を確認してください。": "Check the custom field values.",
  "バージョンが見つかりません。": "The version was not found.",
  "進捗率は0から100の数値で入力してください。": "% Done must be a number from 0 to 100.",
  "変更内容またはコメントを指定してください。": "Enter a change or a comment.",
  "{0}件更新しました（{1}件はスキップされました）。": "Updated {0} ({1} skipped).",
  "{0}件更新しました。": "Updated {0}.",
  "指定されたユーザーはこのプロジェクトのメンバーではありません。": "That user is not a member of this project.",
  "ニュースが見つかりません。": "The news was not found.",
  "トピックが見つかりません。": "The topic was not found.",
  "フォーラムが見つかりません。": "The forum was not found.",
  "Wikiページが見つかりません。": "The wiki page was not found.",
  "指定されたユーザーはこのプロジェクトの Wiki を閲覧できません。": "That user can't view this project's wiki.",
  "トラッカーが見つかりません。": "The tracker was not found.",
  "優先度が見つかりません。": "The priority was not found.",
  "担当者が見つかりません。": "The assignee was not found.",
  "カテゴリが見つかりません。": "The category was not found.",
  "親チケットが見つかりません。": "The parent issue was not found.",
  "予定工数は0以上の数値で入力してください。": "Estimated time must be a number of 0 or more.",
  "進捗率は0〜100の整数で入力してください。": "% Done must be a whole number from 0 to 100.",
  "このステータスでは必須項目が未入力です。入力内容を確認してください。": "Required fields for this status are blank. Check your input.",
  "自分自身または子孫のチケットを親に指定することはできません。": "An issue can't have itself or a descendant as its parent.",
  "他の変更と競合しました。ページを再読み込みして再度お試しください。": "Someone else changed this in the meantime. Reload the page and try again.",
  "そのステータスには変更できません。": "You can't change to that status.",
  "このステータスでは必須項目が未入力のため変更できません。": "This status can't be set because required fields are blank.",
  "このチケットは未完了の「ブロック」関連があるためクローズできません。": "This issue can't be closed because an open issue blocks it.",
  "移動先のプロジェクトが見つかりません。": "The target project was not found.",
  "移動先のプロジェクトにトラッカーが割り当てられていません。": "The target project has no trackers.",
  "工数の付け替え先チケットを選択してください。": "Choose an issue to reassign the spent time to.",
  "削除対象のチケットに工数を付け替えることはできません。": "Spent time can't be reassigned to an issue being deleted.",
  "付け替え先のチケットが見つかりません。": "The issue to reassign to was not found.",
  "コピー先のプロジェクトが見つかりません。": "The target project was not found.",
  "コピー先のワークフローで必須の項目が未入力のためコピーできません。": "The issue can't be copied because fields required by the target workflow are blank.",
  "CSVファイルを選択してください。": "Choose a CSV file.",
  "CSVにデータがありません。": "The CSV has no data.",
  "必須列が見つかりません: {0}": "Required columns are missing: {0}",
  "{0}行目: spent_onはYYYY-MM-DD形式で入力してください。": "Row {0}: spent_on must be in YYYY-MM-DD format.",
  "{0}行目: hoursが数値ではありません。": "Row {0}: hours is not a number.",
  "{0}行目: 作業分類「{1}」が見つかりません。": "Row {0}: activity \"{1}\" was not found.",
  "{0}行目: ユーザー「{1}」名義で工数を記録できません。": "Row {0}: time can't be logged for user \"{1}\".",
  "{0}行目: チケット「{1}」が見つかりません。": "Row {0}: issue \"{1}\" was not found.",
  "{0}行目: {1}": "Row {0}: {1}",
  "カスタムフィールドの値が不正です。": "A custom field value is not valid.",
  "作成に失敗しました。": "Could not be created.",
  "既定のステータスを選択してください。": "Choose a default status.",
  "既定のステータスが見つかりません。": "The default status was not found.",
  "コピー元のトラッカーを選択してください。": "Choose a tracker to copy from.",
  "ログインIDとパスワードを入力してください。": "Enter your login and password.",
  "ログインIDまたはパスワードが正しくありません。": "Invalid user or password.",
  "このアカウントではログインできません。": "This account can't sign in.",
  "確認コードを入力してください。": "Enter the code.",
  "確認コードが正しくありません。": "The code is incorrect.",
  "現在のパスワードと新しいパスワードを入力してください。": "Enter your current and new passwords.",
  "メールアドレスを入力してください。": "Enter an email address.",
  "パスワードの再設定は無効になっています。管理者にお問い合わせください。": "Password reset is disabled. Contact your administrator.",
  "新しいパスワードを入力してください。": "Enter a new password.",
  "ファイルを選択してください。": "Choose a file.",
  "ファイルが見つかりません。": "The file was not found.",
  "件名を入力してください。": "Enter a subject.",
  "正しいメールアドレスを入力してください。": "Enter a valid email address.",
  "LDAP認証のユーザーにはパスワードを設定できません。": "A password can't be set for an LDAP user.",
  "そのログインIDは既に使用されています。": "That login is already taken.",
  "そのメールアドレスは既に使用されています。": "That email address is already taken.",
  "ユーザーが見つかりません。": "The user was not found.",
  "プロジェクトを選択してください。": "Choose a project.",
  "メンバーシップが見つかりません。": "The membership was not found.",
  "グループから継承したメンバーシップは編集できません。": "A membership inherited from a group can't be edited.",
  "グループから継承したメンバーシップは削除できません。": "A membership inherited from a group can't be deleted.",
  "このページは保護されています。": "This page is protected.",
  "子ページの移動先として選べないページです。": "That page can't take the child pages.",
  "開始ページを入力してください。": "Enter a start page.",
  "開始ページ名に使用できない文字が含まれています。": "The start page name contains characters that aren't allowed.",
  "削除を確認するチェックボックスをオンにしてください。": "Tick the box to confirm the deletion.",
  "半角英数字・ハイフン・アンダースコアのみ使用できます": "Only letters, digits, dashes and underscores are allowed",
  "プロジェクトを作成できませんでした。": "The project could not be created.",
  "プロジェクトをコピーできませんでした。": "The project could not be copied.",
  "このプロジェクトのバージョンを使用しているチケットが配下以外のプロジェクトにあるため、アーカイブできません。": "This project can't be archived because issues outside it use its versions.",
  "識別子が一致しません。削除するには識別子を正確に入力してください。": "The identifier doesn't match. Type the identifier exactly to delete the project.",
  "名を入力してください。": "Enter a first name.",
  "姓を入力してください。": "Enter a last name.",
  "DELETE と入力してください。": "Type DELETE.",
  "指定された担当者はこのプロジェクトのメンバーではありません。": "That assignee is not a member of this project.",
  "既定の進捗率は0〜100の整数で入力してください。": "Default % done must be a whole number from 0 to 100.",
  "ステータスが見つかりません。": "The status was not found.",
  "ドキュメントが見つかりません。": "The document was not found.",
  "添付ファイルが見つかりません。": "The attachment was not found.",
  "投稿が見つかりません。": "The message was not found.",
  "お知らせが見つかりません。": "The announcement was not found.",
  "URLの形式が正しくありません。": "The URL is not valid.",
  "URLは http:// または https:// で始めてください。": "The URL must start with http:// or https://.",
  "このポート番号は使用できません。": "This port can't be used.",
  "URLにホスト名が含まれていません。": "The URL has no host name.",
  "このアドレスには送信できません。": "Requests can't be sent to this address.",
  "URLを入力してください。": "Enter a URL.",
  "URLが長すぎます。": "The URL is too long.",
  "シークレットは255文字以内で入力してください。": "Secret must be 255 characters or fewer.",
  "Webhookは管理者によって無効化されています。": "Webhooks are disabled by the administrator.",
  "対象のプロジェクトを1つ以上選択してください。": "Choose at least one project.",
  "通知するイベントを1つ以上選択してください。": "Choose at least one event.",
  "Webhookが見つかりません。": "The webhook was not found.",
  "正の数を入力してください。": "Enter a positive number.",
  "正の整数を入力してください。": "Enter a positive whole number.",
  "APIキーは255文字以内で入力してください。": "API key must be 255 characters or fewer.",
  "タイトルを入力してください。": "Enter a title.",
  "親ページとして指定できないページです。": "That page can't be the parent page.",
  "「{0}」という名前のページは既に存在します。": "A page named \"{0}\" already exists.",
  "不明な権限が指定されました: {0}": "Unknown permission: {0}",
  "このロールには設定できない権限です: {0}": "This role can't have the permission: {0}",
  "ロールが見つかりません。": "The role was not found.",
  "コピー元のロールが見つかりません。": "The role to copy from was not found.",
  "工数が見つかりません。": "The time entry was not found.",
  "カスタムフィールドの値を確認してください。": "Check the custom field values.",
  "指定したユーザー名義で工数を記録する権限がありません。": "You are not allowed to log time for that user.",
  "工数を選択してください。": "Choose time entries.",
  "時間は0より大きい値を入力してください。": "Hours must be greater than 0.",
  "日付はYYYY-MM-DD形式で入力してください。": "Date must be in YYYY-MM-DD format.",
  "変更する項目を1つ以上入力してください。": "Enter at least one change.",
  "{0}件を更新しました。{1}件は更新できませんでした。": "Updated {0}. {1} could not be updated.",
  "{0}件を更新しました。": "Updated {0}.",
  "更新できる工数がありませんでした。": "There were no time entries you could update.",
  "パスワードを入力してください。": "Enter a password.",
  "{0}行目: subjectが空です。": "Row {0}: subject is blank.",
  "{0}行目: トラッカー「{1}」が見つかりません。": "Row {0}: tracker \"{1}\" was not found.",
  "{0}行目: 優先度「{1}」が見つかりません。": "Row {0}: priority \"{1}\" was not found.",
  "{0}行目: 担当者「{1}」が見つかりません。": "Row {0}: assignee \"{1}\" was not found.",
  "{0}行目: カテゴリ「{1}」が見つかりません。": "Row {0}: category \"{1}\" was not found.",
  "{0}行目: バージョン「{1}」が見つかりません。": "Row {0}: version \"{1}\" was not found.",
  "{0}行目: このステータスでは必須項目が未入力です。": "Row {0}: required fields for this status are blank.",
  "{0}行目: 「{1}」にこのプロジェクトで使用できない値が指定されています。": "Row {0}: \"{1}\" has a value this project can't use.",
  "二段階認証は既に有効です。設定し直すには一度無効にしてください。": "Two-factor authentication is already on. Turn it off first to set it up again.",
  "サーバーにTOTP_ENCRYPTION_KEYが設定されていないため、二段階認証を設定できません。管理者に連絡してください。": "Two-factor authentication can't be set up because TOTP_ENCRYPTION_KEY is not set on the server. Contact your administrator.",
  "設定がリセットされました。最初からやり直してください。": "The setup was reset. Start again.",
  "現在のパスワードを入力してください。": "Enter your current password.",
  "このアカウントでは二段階認証が必須のため、無効にできません。": "Two-factor authentication is required for this account and can't be turned off.",
  "パスワードが正しくありません。": "The password is incorrect.",
  "ログインからやり直してください。": "Sign in again.",
};

interface Template {
  pattern: RegExp;
  fixedLength: number;
  english: string;
}

const PLACEHOLDER = /\{(\d+)\}/g;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The entries with placeholders, as anchored patterns whose groups capture the values in placeholder order. */
const TEMPLATES: Template[] = Object.entries(ERROR_MESSAGES_EN)
  .filter(([japanese]) => /\{\d+\}/.test(japanese))
  .map(([japanese, english]) => {
    const parts = japanese.split(/\{\d+\}/);
    const order = [...japanese.matchAll(PLACEHOLDER)].map((match) => Number(match[1]));
    // The English refers to capture positions, so a template whose placeholders appear out of order still fills right.
    const remapped = english.replace(PLACEHOLDER, (_, index: string) => `{${order.indexOf(Number(index))}}`);
    return {
      pattern: new RegExp(`^${parts.map(escapeRegExp).join("([\\s\\S]*?)")}$`),
      fixedLength: parts.join("").length,
      english: remapped,
    };
  })
  // More fixed text first, so "{0}行目: {1}" is only tried after the specific row messages.
  .sort((a, b) => b.fixedLength - a.fixedLength);

/** A value inserted into a message, such as the joined character classes of the password policy. */
function localizeValue(value: string): string {
  if (value in ERROR_MESSAGES_EN) return ERROR_MESSAGES_EN[value];
  const parts = value.split("・");
  if (parts.length > 1 && parts.every((part) => part in ERROR_MESSAGES_EN)) {
    return parts.map((part) => ERROR_MESSAGES_EN[part]).join(", ");
  }
  return localizeSentence(value) ?? value;
}

function localizeSentence(text: string): string | null {
  if (text in ERROR_MESSAGES_EN) return ERROR_MESSAGES_EN[text];
  for (const template of TEMPLATES) {
    const match = template.pattern.exec(text);
    if (match) {
      return template.english.replace(PLACEHOLDER, (_, index: string) => localizeValue(match[Number(index) + 1] ?? ""));
    }
  }
  return null;
}

/**
 * The message in `locale`. Japanese is returned as it is. Otherwise the whole text is looked up, then each sentence of
 * a message that joins several (the password policy lists every rule that failed). Text with no entry, such as a
 * message that is already English, comes back unchanged, so translating twice is harmless.
 */
export function localizeMessage(locale: Locale, text: string): string {
  if (locale === "ja") return text;
  const whole = localizeSentence(text);
  if (whole !== null) return whole;
  const sentences = text.split(/(?<=。) /);
  if (sentences.length > 1) return sentences.map((sentence) => localizeSentence(sentence) ?? sentence).join(" ");
  return text;
}
