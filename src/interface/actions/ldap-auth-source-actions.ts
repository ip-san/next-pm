"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LdapAuthSourceError, saveLdapAuthSource } from "@/application/ldap/save-ldap-auth-source";
import type { LdapAuthSourceInput } from "@/domain/ldap/auth-source";
import { decryptSecret } from "@/domain/crypto/symmetric";
import { ldapConfigFromAuthSource } from "@/domain/ldap/config";
import { loadTotpEncryptionKeyFromEnv } from "@/domain/twofa/encryption-key";
import { LdaptsAuthenticator } from "@/infrastructure/ldap/ldapts-authenticator";
import { DrizzleLdapAuthSourceRepository } from "@/infrastructure/db/repositories/ldap-auth-source-repository";
import { requireAdmin } from "@/interface/http/require-admin";
import { localizeError } from "@/interface/http/localize-error";

export type LdapAuthSourceActionState = {
  error: string | null;
  /** A success message, for the connection test. */
  notice?: string | null;
};

const idSchema = z.string().uuid();

/** Reads the form. The password field is blank to keep the stored one; `clearPassword` removes it. */
function inputFrom(formData: FormData): LdapAuthSourceInput {
  const password = (formData.get("password") ?? "").toString();
  const clearPassword = formData.get("clearPassword") === "on";
  return {
    name: (formData.get("name") ?? "").toString(),
    host: (formData.get("host") ?? "").toString(),
    port: Number(formData.get("port") ?? "389"),
    account: (formData.get("account") ?? "").toString(),
    password: clearPassword ? "" : password.length > 0 ? password : null,
    baseDn: (formData.get("baseDn") ?? "").toString(),
    attrLogin: (formData.get("attrLogin") ?? "uid").toString(),
    attrFirstname: (formData.get("attrFirstname") ?? "givenName").toString(),
    attrLastname: (formData.get("attrLastname") ?? "sn").toString(),
    attrMail: (formData.get("attrMail") ?? "mail").toString(),
    tls: formData.get("tls") === "on",
    verifyPeer: formData.get("verifyPeer") === "on",
    onthefly: formData.get("onthefly") === "on",
    filter: (formData.get("filter") ?? "").toString(),
  };
}

async function save(formData: FormData, existingId: string | null): Promise<LdapAuthSourceActionState> {
  const authError = await requireAdmin();
  if (authError) return { error: await localizeError(authError) };
  try {
    await saveLdapAuthSource(
      new DrizzleLdapAuthSourceRepository(),
      loadTotpEncryptionKeyFromEnv(process.env),
      inputFrom(formData),
      existingId,
    );
  } catch (error) {
    if (error instanceof LdapAuthSourceError) return { error: await localizeError(error.message) };
    throw error;
  }
  revalidatePath("/admin/ldap-auth-sources");
  return { error: null };
}

export async function createLdapAuthSourceAction(_prev: LdapAuthSourceActionState, formData: FormData): Promise<LdapAuthSourceActionState> {
  return save(formData, null);
}

export async function updateLdapAuthSourceAction(_prev: LdapAuthSourceActionState, formData: FormData): Promise<LdapAuthSourceActionState> {
  const id = idSchema.safeParse(formData.get("ldapAuthSourceId"));
  if (!id.success) return { error: await localizeError("認証元が見つかりません。") };
  return save(formData, id.data);
}

export async function deleteLdapAuthSourceAction(_prev: LdapAuthSourceActionState, formData: FormData): Promise<LdapAuthSourceActionState> {
  const authError = await requireAdmin();
  if (authError) return { error: await localizeError(authError) };
  const id = idSchema.safeParse(formData.get("ldapAuthSourceId"));
  if (!id.success) return { error: await localizeError("認証元が見つかりません。") };
  const repository = new DrizzleLdapAuthSourceRepository();
  // Accounts keep the source that created them (Redmine's auth_source_id), so a source with accounts stays.
  if ((await repository.countUsers(id.data)) > 0) {
    return { error: await localizeError("この認証元で作られたユーザーがいるため削除できません。") };
  }
  await repository.delete(id.data);
  revalidatePath("/admin/ldap-auth-sources");
  return { error: null };
}

/**
 * Redmine's AuthSourcesController#test_connection: connects to the source with its stored settings and reports
 * "Successful connection" or "Unable to connect (reason)". A stored password that can't be decrypted is reported
 * rather than tried without it.
 */
export async function testLdapAuthSourceConnectionAction(
  _prev: LdapAuthSourceActionState,
  formData: FormData,
): Promise<LdapAuthSourceActionState> {
  const authError = await requireAdmin();
  if (authError) return { error: await localizeError(authError), notice: null };
  const id = idSchema.safeParse(formData.get("ldapAuthSourceId"));
  if (!id.success) return { error: await localizeError("認証元が見つかりません。"), notice: null };
  const found = await new DrizzleLdapAuthSourceRepository().findWithEncryptedPassword(id.data);
  if (!found) return { error: await localizeError("認証元が見つかりません。"), notice: null };

  let password: string | null = null;
  if (found.encryptedPassword !== null) {
    const key = loadTotpEncryptionKeyFromEnv(process.env);
    try {
      if (key === null) throw new Error("TOTP_ENCRYPTION_KEY is not set");
      password = decryptSecret(found.encryptedPassword, key);
    } catch {
      const reason = "保存したパスワードを復号できません";
      return { error: await localizeError(`接続できません。 (${reason})`), notice: null };
    }
  }
  try {
    await new LdaptsAuthenticator(ldapConfigFromAuthSource(found.source, password)).testConnection();
  } catch (error) {
    const reason = error instanceof Error && error.message ? error.message : String(error);
    return { error: await localizeError(`接続できません。 (${reason})`), notice: null };
  }
  return { error: null, notice: await localizeError("接続しました。") };
}
