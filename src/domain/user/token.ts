import { randomBytes } from "node:crypto";

/** Mirrors Redmine's Token.generate_token_value: a 40-char random hex string. */
export function generateToken(): string {
  return randomBytes(20).toString("hex");
}
