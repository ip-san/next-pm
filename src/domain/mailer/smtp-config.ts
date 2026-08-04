export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string } | null;
  from: string;
}

/**
 * Mirrors Redmine's configuration.yml email_delivery.smtp_settings, folded into env vars the
 * way LDAP config is (see domain/ldap/config.ts) — unset SMTP_HOST means "no SMTP configured",
 * which callers use to fall back to ConsoleMailer rather than failing to boot.
 */
export function loadSmtpConfigFromEnv(env: Record<string, string | undefined>): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) {
    return null;
  }

  const port = Number(env.SMTP_PORT ?? "587");
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASSWORD;

  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: env.SMTP_SECURE === "1",
    auth: user && pass ? { user, pass } : null,
    from: env.SMTP_FROM?.trim() || user || "redmine@localhost",
  };
}
