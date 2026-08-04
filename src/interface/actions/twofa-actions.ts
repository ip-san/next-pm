"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { z } from "zod";
import { confirmTotpPairing, deactivateTwofa, startTotpPairing, TotpEncryptionKeyMissingError } from "@/application/twofa/pairing";
import { verifyCurrentPassword } from "@/application/auth/verify-current-password";
import { loadLdapConfigFromEnv } from "@/domain/ldap/config";
import { loadTotpEncryptionKeyFromEnv } from "@/domain/twofa/encryption-key";
import { DrizzleTwofaBackupCodeRepository } from "@/infrastructure/db/repositories/twofa-backup-code-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { LdaptsAuthenticator } from "@/infrastructure/ldap/ldapts-authenticator";
import { currentUserFromCookies } from "@/interface/http/current-user";

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

  const ldapConfig = loadLdapConfigFromEnv(process.env);
  const passwordOk = await verifyCurrentPassword(
    { userRepository: new DrizzleUserRepository(), ldapAuthenticator: ldapConfig ? new LdaptsAuthenticator(ldapConfig) : null },
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
