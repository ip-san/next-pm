"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LdapAuthSourceError, saveLdapAuthSource } from "@/application/ldap/save-ldap-auth-source";
import type { LdapAuthSourceInput } from "@/domain/ldap/auth-source";
import { loadTotpEncryptionKeyFromEnv } from "@/domain/twofa/encryption-key";
import { DrizzleLdapAuthSourceRepository } from "@/infrastructure/db/repositories/ldap-auth-source-repository";
import { requireAdmin } from "@/interface/http/require-admin";

export type LdapAuthSourceActionState = {
  error: string | null;
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
  if (authError) return { error: authError };
  try {
    await saveLdapAuthSource(
      new DrizzleLdapAuthSourceRepository(),
      loadTotpEncryptionKeyFromEnv(process.env),
      inputFrom(formData),
      existingId,
    );
  } catch (error) {
    if (error instanceof LdapAuthSourceError) return { error: error.message };
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
  if (!id.success) return { error: "認証元が見つかりません。" };
  return save(formData, id.data);
}

export async function deleteLdapAuthSourceAction(_prev: LdapAuthSourceActionState, formData: FormData): Promise<LdapAuthSourceActionState> {
  const authError = await requireAdmin();
  if (authError) return { error: authError };
  const id = idSchema.safeParse(formData.get("ldapAuthSourceId"));
  if (!id.success) return { error: "認証元が見つかりません。" };
  await new DrizzleLdapAuthSourceRepository().delete(id.data);
  revalidatePath("/admin/ldap-auth-sources");
  return { error: null };
}
