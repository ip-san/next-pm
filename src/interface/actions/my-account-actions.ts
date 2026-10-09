"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resetApiKey, resetAtomKey, showOrCreateApiKey } from "@/application/accounts/access-keys";
import { AccountNotDeletableError, deleteOwnAccount } from "@/application/accounts/delete-own-account";
import {
  addEmailAddress,
  EmailAddressError,
  removeEmailAddress,
  setEmailAddressNotify,
} from "@/application/accounts/email-addresses";
import { updateMyAccount } from "@/application/accounts/update-my-account";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import { MAIL_NOTIFICATION_OPTIONS } from "@/domain/notification/mail-notification";
import { COMMENTS_SORTING_VALUES } from "@/domain/user-preferences/entity";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { accountRepositories } from "@/interface/http/my-account-repositories";
import { destroyCurrentSession } from "@/interface/http/session";
import { localizeError } from "@/interface/http/localize-error";

const ACCOUNT_PATH = "/my/account";

export type MyAccountActionState = {
  error: string | null;
  ok: boolean;
};

const updateAccountSchema = z.object({
  firstname: z.string().min(1, "名を入力してください。"),
  lastname: z.string().min(1, "姓を入力してください。"),
  mail: z.string().email("正しいメールアドレスを入力してください。"),
  language: z.string(),
  mailNotification: z.enum(MAIL_NOTIFICATION_OPTIONS),
  hideMail: z.boolean(),
  timeZone: z.string(),
  commentsSorting: z.enum(COMMENTS_SORTING_VALUES),
  noSelfNotified: z.boolean(),
});

/** Redmine's MyController#account (PUT). */
export async function updateMyAccountAction(
  _prevState: MyAccountActionState,
  formData: FormData,
): Promise<MyAccountActionState> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。"), ok: false };
  }

  const parsed = updateAccountSchema.safeParse({
    firstname: formData.get("firstname"),
    lastname: formData.get("lastname"),
    mail: formData.get("mail"),
    language: formData.get("language") ?? "",
    mailNotification: formData.get("mailNotification"),
    hideMail: formData.get("hideMail") === "on",
    timeZone: formData.get("timeZone") ?? "",
    commentsSorting: formData.get("commentsSorting"),
    noSelfNotified: formData.get("noSelfNotified") === "on",
  });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。"), ok: false };
  }

  try {
    await updateMyAccount(accountRepositories(), user.id, {
      ...parsed.data,
      // An empty select means "not set", which is null in the database rather than "".
      language: parsed.data.language || null,
      timeZone: parsed.data.timeZone || null,
    });
  } catch (error) {
    if (error instanceof EmailAddressError) {
      return { error: await localizeError(error.message), ok: false };
    }
    throw error;
  }

  revalidatePath(ACCOUNT_PATH);
  return { error: null, ok: true };
}

export type EmailAddressActionState = {
  error: string | null;
};

const addAddressSchema = z.object({ address: z.string().min(1) });

/** Redmine's EmailAddressesController#create. */
export async function addEmailAddressAction(
  _prevState: EmailAddressActionState,
  formData: FormData,
): Promise<EmailAddressActionState> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。") };
  }

  const parsed = addAddressSchema.safeParse({ address: formData.get("address") });
  if (!parsed.success) {
    return { error: await localizeError("メールアドレスを入力してください。") };
  }

  const { maxAdditionalEmails } = await loadAuthSettings(new DrizzleSettingsRepository());
  try {
    await addEmailAddress(accountRepositories(), user.id, parsed.data.address, maxAdditionalEmails);
  } catch (error) {
    if (error instanceof EmailAddressError) {
      return { error: await localizeError(error.message) };
    }
    throw error;
  }

  revalidatePath(ACCOUNT_PATH);
  return { error: null };
}

const addressIdSchema = z.object({ addressId: z.string().uuid() });

/** Redmine's EmailAddressesController#destroy. The ownership check lives in the use case. */
export async function removeEmailAddressAction(
  _prevState: EmailAddressActionState,
  formData: FormData,
): Promise<EmailAddressActionState> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。") };
  }

  const parsed = addressIdSchema.safeParse({ addressId: formData.get("addressId") });
  if (!parsed.success) {
    return { error: await localizeError("入力内容を確認してください。") };
  }

  try {
    await removeEmailAddress(accountRepositories(), user.id, parsed.data.addressId);
  } catch (error) {
    if (error instanceof EmailAddressError) {
      return { error: await localizeError(error.message) };
    }
    throw error;
  }

  revalidatePath(ACCOUNT_PATH);
  return { error: null };
}

const notifySchema = z.object({ addressId: z.string().uuid(), notify: z.boolean() });

/** Redmine's EmailAddressesController#update, whose only field is the notify flag. */
export async function setEmailAddressNotifyAction(
  _prevState: EmailAddressActionState,
  formData: FormData,
): Promise<EmailAddressActionState> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。") };
  }

  const parsed = notifySchema.safeParse({
    addressId: formData.get("addressId"),
    notify: formData.get("notify") === "1",
  });
  if (!parsed.success) {
    return { error: await localizeError("入力内容を確認してください。") };
  }

  try {
    await setEmailAddressNotify(accountRepositories(), user.id, parsed.data.addressId, parsed.data.notify);
  } catch (error) {
    if (error instanceof EmailAddressError) {
      return { error: await localizeError(error.message) };
    }
    throw error;
  }

  revalidatePath(ACCOUNT_PATH);
  return { error: null };
}

export type AccessKeyActionState = {
  error: string | null;
  /** The key to show once; the page never renders it unprompted, mirroring MyController#show_api_key. */
  apiKey: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState's signature; this action takes no input
export async function showApiKeyAction(_prevState: AccessKeyActionState, _formData: FormData): Promise<AccessKeyActionState> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。"), apiKey: null };
  }
  return { error: null, apiKey: await showOrCreateApiKey(new DrizzleUserRepository(), user.id) };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState's signature; this action takes no input
export async function resetApiKeyAction(_prevState: AccessKeyActionState, _formData: FormData): Promise<AccessKeyActionState> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。"), apiKey: null };
  }
  const apiKey = await resetApiKey(new DrizzleUserRepository(), user.id);
  revalidatePath(ACCOUNT_PATH);
  return { error: null, apiKey };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState's signature; this action takes no input
export async function resetAtomKeyAction(_prevState: EmailAddressActionState, _formData: FormData): Promise<EmailAddressActionState> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。") };
  }
  await resetAtomKey(new DrizzleUserRepository(), user.id);
  revalidatePath(ACCOUNT_PATH);
  return { error: null };
}

const deleteAccountSchema = z.object({ confirm: z.literal("DELETE", { message: "DELETE と入力してください。" }) });

/**
 * Redmine's MyController#destroy, which likewise takes a confirmation parameter rather than
 * deleting on a bare POST. The typed word is this app's stand-in for Redmine's confirm page:
 * the action is irreversible and reassigns everything the account authored.
 */
export async function deleteOwnAccountAction(
  _prevState: MyAccountActionState,
  formData: FormData,
): Promise<MyAccountActionState> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: await localizeError("ログインしてください。"), ok: false };
  }

  const parsed = deleteAccountSchema.safeParse({ confirm: formData.get("confirm") });
  if (!parsed.success) {
    return { error: await localizeError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。"), ok: false };
  }

  const { unsubscribeEnabled } = await loadAuthSettings(new DrizzleSettingsRepository());
  const userRepository = new DrizzleUserRepository();
  try {
    await deleteOwnAccount({ userRepository, userAdminRepository: userRepository }, user.id, unsubscribeEnabled);
  } catch (error) {
    if (error instanceof AccountNotDeletableError) {
      return { error: await localizeError(error.message), ok: false };
    }
    throw error;
  }

  // The user_sessions row is already gone with the account (ON DELETE CASCADE), so this is
  // really about clearing the cookies — but it goes through the same teardown every logout
  // uses rather than deleting cookies by hand here.
  await destroyCurrentSession();
  redirect("/login");
}
