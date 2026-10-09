"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { z } from "zod";
import { confirmTotpPairing, deactivateTwofa, startTotpPairing, TotpEncryptionKeyMissingError } from "@/application/twofa/pairing";
import { verifyCurrentPassword } from "@/application/auth/verify-current-password";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import { isTwofaActive } from "@/domain/user/entity";
import { evaluateLoginGate, mustActivateTwofa } from "@/domain/user/login-gate";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { loadTotpEncryptionKeyFromEnv } from "@/domain/twofa/encryption-key";
import { DrizzleTwofaBackupCodeRepository } from "@/infrastructure/db/repositories/twofa-backup-code-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { ldapAuthenticatorFromConfiguration } from "@/interface/http/ldap-authenticator";
import { verifyTwofaPendingToken } from "@/infrastructure/auth/twofa-pending-token";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { establishSession } from "@/interface/http/session";
import { TWOFA_PENDING_COOKIE_NAME } from "@/interface/http/twofa-pending-cookie";

const ACCOUNT_PATH = "/my/account";
const ISSUER = "next-pm";

export type StartTwofaPairingState = {
  error: string | null;
  pairing: { secretBase32: string; provisioningUri: string; qrDataUrl: string } | null;
};

// Both params are required by useActionState's action signature but unused — this action takes no input.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function startTwofaPairingAction(_prevState: StartTwofaPairingState, _formData: FormData): Promise<StartTwofaPairingState> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。", pairing: null };
  }
  // Re-pairing silently replaces the active secret, so a stolen session would be enough to
  // swap the second factor for the attacker's own. Redmine guards this with sudo mode (a
  // password re-prompt); next-pm has no sudo mode, so the route is simply closed — turning
  // 2FA off first already demands the current password (deactivateTwofaAction).
  if (isTwofaActive(user)) {
    return { error: "二段階認証は既に有効です。設定し直すには一度無効にしてください。", pairing: null };
  }

  const encryptionKey = loadTotpEncryptionKeyFromEnv(process.env);
  try {
    const { secretBase32, provisioningUri } = await startTotpPairing(
      { userRepository: new DrizzleUserRepository() },
      user.id,
      encryptionKey,
      ISSUER,
    );
    const qrDataUrl = await QRCode.toDataURL(provisioningUri);
    return { error: null, pairing: { secretBase32, provisioningUri, qrDataUrl } };
  } catch (error) {
    if (error instanceof TotpEncryptionKeyMissingError) {
      return { error: "サーバーにTOTP_ENCRYPTION_KEYが設定されていないため、二段階認証を設定できません。管理者に連絡してください。", pairing: null };
    }
    throw error;
  }
}

export type ConfirmTwofaPairingState = {
  error: string | null;
  backupCodes: string[] | null;
};

const confirmSchema = z.object({ code: z.string().min(1) });

export async function confirmTwofaPairingAction(
  _prevState: ConfirmTwofaPairingState,
  formData: FormData,
): Promise<ConfirmTwofaPairingState> {
  const parsed = confirmSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return { error: "確認コードを入力してください。", backupCodes: null };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。", backupCodes: null };
  }

  const encryptionKey = loadTotpEncryptionKeyFromEnv(process.env);
  const result = await confirmTotpPairing(
    { userRepository: new DrizzleUserRepository(), backupCodeRepository: new DrizzleTwofaBackupCodeRepository() },
    user.id,
    parsed.data.code,
    encryptionKey,
    Math.floor(Date.now() / 1000),
  );

  if (!result.ok) {
    const message = result.reason === "invalid_code" ? "確認コードが正しくありません。" : "設定がリセットされました。最初からやり直してください。";
    return { error: message, backupCodes: null };
  }

  revalidatePath(ACCOUNT_PATH);
  return { error: null, backupCodes: result.backupCodes };
}

export type DeactivateTwofaState = {
  error: string | null;
  ok: boolean;
};

const deactivateSchema = z.object({ password: z.string().min(1) });

export async function deactivateTwofaAction(
  _prevState: DeactivateTwofaState,
  formData: FormData,
): Promise<DeactivateTwofaState> {
  const parsed = deactivateSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { error: "現在のパスワードを入力してください。", ok: false };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。", ok: false };
  }

  // Redmine's Setting.twofa_required? / twofa_required_for_administrators? make the factor
  // mandatory; letting a user switch it off would put the account straight back into
  // "must activate" on the next login, and in the meantime leave it password-only.
  const { twofa } = await loadAuthSettings(new DrizzleSettingsRepository());
  if (mustActivateTwofa({ isAdmin: user.isAdmin, twofaScheme: null }, twofa)) {
    return { error: "このアカウントでは二段階認証が必須のため、無効にできません。", ok: false };
  }

  const passwordOk = await verifyCurrentPassword(
    { userRepository: new DrizzleUserRepository(), ldapAuthenticator: await ldapAuthenticatorFromConfiguration(process.env) },
    user.id,
    parsed.data.password,
  );
  if (!passwordOk) {
    return { error: "パスワードが正しくありません。", ok: false };
  }

  await deactivateTwofa(
    { userRepository: new DrizzleUserRepository(), backupCodeRepository: new DrizzleTwofaBackupCodeRepository() },
    user.id,
  );
  revalidatePath(ACCOUNT_PATH);
  return { error: null, ok: true };
}

/**
 * Forced-activation variant of the two pairing actions above, for the `twofa` setting's
 * "required" modes. Redmine handles this with a `check_twofa_activation` before_action that
 * lets the user in and then bounces every request to the setup page until they pair. next-pm
 * has no per-request filter with a pathname to exempt the setup page from, so the pairing
 * happens *before* the session exists instead, off the same short-lived pending token the
 * second-factor form uses. Same end state, no redirect loop to engineer around.
 */
/**
 * Resolves the pending login *and* re-checks that it is genuinely owed a first pairing.
 *
 * The second condition is load-bearing. The pending cookie is handed out after a correct
 * password alone, and startTotpPairing will happily overwrite an existing secret (Redmine's
 * init_pairing! does too). Without this check, a user who already has 2FA — whose pending
 * cookie exists because they were sent to the *code* form — could walk to the setup page
 * instead, pair their own authenticator and get a session: the second factor bypassed with
 * nothing but the password. evaluateLoginGate only answers "twofa_setup_required" for an
 * active account that has no scheme yet, which is exactly the one case setup may proceed.
 */
async function pendingSetupUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TWOFA_PENDING_COOKIE_NAME)?.value;
  const pending = token ? await verifyTwofaPendingToken(token) : null;
  if (!pending) return null;

  const user = await new DrizzleUserRepository().findById(pending.userId);
  if (!user) return null;

  const { twofa } = await loadAuthSettings(new DrizzleSettingsRepository());
  return evaluateLoginGate(user, twofa).kind === "twofa_setup_required" ? user.id : null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState's signature; this action takes no input
export async function startForcedTwofaPairingAction(_prevState: StartTwofaPairingState, _formData: FormData): Promise<StartTwofaPairingState> {
  const userId = await pendingSetupUserId();
  if (!userId) {
    return { error: "ログインからやり直してください。", pairing: null };
  }

  const encryptionKey = loadTotpEncryptionKeyFromEnv(process.env);
  try {
    const { secretBase32, provisioningUri } = await startTotpPairing(
      { userRepository: new DrizzleUserRepository() },
      userId,
      encryptionKey,
      ISSUER,
    );
    const qrDataUrl = await QRCode.toDataURL(provisioningUri);
    return { error: null, pairing: { secretBase32, provisioningUri, qrDataUrl } };
  } catch (error) {
    if (error instanceof TotpEncryptionKeyMissingError) {
      return { error: "サーバーにTOTP_ENCRYPTION_KEYが設定されていないため、二段階認証を設定できません。管理者に連絡してください。", pairing: null };
    }
    throw error;
  }
}

export async function confirmForcedTwofaPairingAction(
  _prevState: ConfirmTwofaPairingState,
  formData: FormData,
): Promise<ConfirmTwofaPairingState> {
  const parsed = confirmSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return { error: "確認コードを入力してください。", backupCodes: null };
  }

  // Same ownership + "is this login actually owed a first pairing" check as the start action,
  // re-run here because the two are separate requests.
  const setupUserId = await pendingSetupUserId();
  if (!setupUserId) {
    return { error: "ログインからやり直してください。", backupCodes: null };
  }
  const cookieStore = await cookies();
  const pendingToken = cookieStore.get(TWOFA_PENDING_COOKIE_NAME)?.value;
  const pending = pendingToken ? await verifyTwofaPendingToken(pendingToken) : null;
  if (!pending) {
    return { error: "ログインからやり直してください。", backupCodes: null };
  }

  const encryptionKey = loadTotpEncryptionKeyFromEnv(process.env);
  const result = await confirmTotpPairing(
    { userRepository: new DrizzleUserRepository(), backupCodeRepository: new DrizzleTwofaBackupCodeRepository() },
    setupUserId,
    parsed.data.code,
    encryptionKey,
    Math.floor(Date.now() / 1000),
  );

  if (!result.ok) {
    const message = result.reason === "invalid_code" ? "確認コードが正しくありません。" : "設定がリセットされました。最初からやり直してください。";
    return { error: message, backupCodes: null };
  }

  // The pairing *is* the second factor for this login, so no separate code entry follows.
  // setupUserId, not the raw cookie claim: it is the id the gate was actually evaluated for.
  await establishSession(setupUserId, { rememberMe: pending.rememberMe });
  return { error: null, backupCodes: result.backupCodes };
}
