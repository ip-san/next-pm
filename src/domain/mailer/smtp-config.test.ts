import { describe, expect, it } from "bun:test";
import { loadSmtpConfigFromEnv } from "./smtp-config";

describe("loadSmtpConfigFromEnv", () => {
  it("returns null when SMTP_HOST is unset", () => {
    expect(loadSmtpConfigFromEnv({})).toBeNull();
  });

  it("returns null when SMTP_HOST is blank", () => {
    expect(loadSmtpConfigFromEnv({ SMTP_HOST: "  " })).toBeNull();
  });

  it("applies defaults when only SMTP_HOST is set", () => {
    expect(loadSmtpConfigFromEnv({ SMTP_HOST: "smtp.example.com" })).toEqual({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: null,
      from: "redmine@localhost",
    });
  });

  it("builds auth only when both user and password are present", () => {
    expect(loadSmtpConfigFromEnv({ SMTP_HOST: "smtp.example.com", SMTP_USER: "bot" })).toMatchObject({ auth: null });
    expect(
      loadSmtpConfigFromEnv({ SMTP_HOST: "smtp.example.com", SMTP_USER: "bot", SMTP_PASSWORD: "secret" }),
    ).toMatchObject({ auth: { user: "bot", pass: "secret" } });
  });

  it("falls back to SMTP_USER as the from address when SMTP_FROM is unset", () => {
    expect(
      loadSmtpConfigFromEnv({ SMTP_HOST: "smtp.example.com", SMTP_USER: "bot", SMTP_PASSWORD: "secret" }),
    ).toMatchObject({ from: "bot" });
  });

  it("prefers an explicit SMTP_FROM over SMTP_USER", () => {
    expect(
      loadSmtpConfigFromEnv({ SMTP_HOST: "smtp.example.com", SMTP_USER: "bot", SMTP_FROM: "noreply@example.com" }),
    ).toMatchObject({ from: "noreply@example.com" });
  });

  it("parses a custom port and treats SMTP_SECURE=1 as implicit TLS", () => {
    expect(loadSmtpConfigFromEnv({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "465", SMTP_SECURE: "1" })).toMatchObject({
      port: 465,
      secure: true,
    });
  });

  it("falls back to port 587 when SMTP_PORT is not a number", () => {
    expect(loadSmtpConfigFromEnv({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "not-a-number" })).toMatchObject({
      port: 587,
    });
  });
});
