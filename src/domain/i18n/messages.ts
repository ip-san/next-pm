import type { Locale } from "./locales";

/**
 * The interface's strings, by key. `ja` holds the text as it has always been; `en` must have every key, so a
 * missing translation is a type error, not a blank label. This first slice covers the navigation, sign-in and My
 * Page; the other screens keep their Japanese text until they are moved here.
 */
const JA = {
  "nav.projects": "プロジェクト",
  "nav.activity": "活動",
  "nav.issues": "チケット",
  "nav.timeEntries": "作業時間",
  "nav.news": "ニュース",
  "nav.search": "検索",
  "nav.admin": "管理",
  "nav.logout": "ログアウト",
  "nav.login": "ログイン",
  "login.loginId": "ログインID",
  "login.password": "パスワード",
  "login.rememberMe": "次回から自動的にログインする",
  "login.submit": "ログイン",
  "login.submitting": "ログイン中…",
  "login.lostPassword": "パスワードをお忘れですか？",
  "my.title": "マイページ",
  "my.addBlock": "ブロックを追加",
  "my.accountSettings": "アカウント設定",
} as const;

export type MessageKey = keyof typeof JA;

const EN: Record<MessageKey, string> = {
  "nav.projects": "Projects",
  "nav.activity": "Activity",
  "nav.issues": "Issues",
  "nav.timeEntries": "Time entries",
  "nav.news": "News",
  "nav.search": "Search",
  "nav.admin": "Administration",
  "nav.logout": "Sign out",
  "nav.login": "Sign in",
  "login.loginId": "Login",
  "login.password": "Password",
  "login.rememberMe": "Stay signed in on this browser",
  "login.submit": "Sign in",
  "login.submitting": "Signing in…",
  "login.lostPassword": "Lost password?",
  "my.title": "My page",
  "my.addBlock": "Add block",
  "my.accountSettings": "Account settings",
};

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { ja: JA, en: EN };

/** The text for a key in a locale. Every key exists in every locale (the type requires it). */
export function translate(locale: Locale, key: MessageKey): string {
  return MESSAGES[locale][key];
}
