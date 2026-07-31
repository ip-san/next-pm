# next-pm

Redmine を Next.js（TypeScript / React / PostgreSQL / Drizzle ORM）で再実装するプロジェクト。

- 機能・ドメインモデルの正本: 本家 Redmine (`../redmine`)
- 副次参照: `../artisan-pm`（Laravel実装、`docs/parity-checklist.md` を機能パリティのチェックリストとして参照）
- 実装計画: `/Users/sesoko/.claude/plans/stateless-sleeping-wave.md`

## セットアップ

```bash
bun install
docker compose -f docker/compose.yaml -p next-pm up -d postgres
cp .env.example .env.local
bun run db:migrate   # applies the migrations already committed under drizzle/
bun run db:seed      # admin/roles/statuses/priorities/trackers/workflow — needed before /projects/new or /issues/new render usable options
bun run dev
```

初回ログイン: `admin` / `admin` (Redmineの既定管理者アカウントと同じ規約)。ログイン後にパスワードを変更すること。

スキーマ (`src/infrastructure/db/schema/*.ts`) を変更したときだけ `bun run db:generate` で新しいマイグレーションを生成する。

## テスト

```bash
bun test        # domain/ と application/ のユニットテスト
bun run lint
bunx tsc --noEmit
```

## アーキテクチャ

```
src/domain/          # 純粋TS。DB/Next依存なし
src/application/     # ユースケース。domainのportにのみ依存
src/infrastructure/  # Drizzle実装・メール/LDAP/SCMアダプタ
src/interface/       # Route Handler / Server Action の実装本体
src/app/             # Next.js App Router（薄い委譲層）
src/proxy.ts         # Cookie/CSRFトークン発行 (Next.js 16の "middleware" は "proxy" に改称された)
worker/              # 通知・バックグラウンドジョブ用の別プロセス
```

Next.js 16 では `middleware.ts`/`middleware()` は非推奨で `proxy.ts`/`proxy()` に改称されている。`src/` ディレクトリ構成のため配置場所も `src/proxy.ts` になる(プロジェクトルートでは検出されない)。
