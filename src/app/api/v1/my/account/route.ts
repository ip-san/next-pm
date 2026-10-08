import { NextResponse } from "next/server";
import { z } from "zod";
import { EmailAddressError } from "@/application/accounts/email-addresses";
import { updateMyAccount } from "@/application/accounts/update-my-account";
import { MAIL_NOTIFICATION_OPTIONS } from "@/domain/notification/mail-notification";
import { COMMENTS_SORTING_VALUES, resolvePreferences } from "@/domain/user-preferences/entity";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { verifyCsrf } from "@/interface/http/csrf";
import { accountRepositories } from "@/interface/http/my-account-repositories";

export async function GET(request: Request) {
  const user =
    (await currentUserFromAuthorizationHeader(request)) ?? (await currentUserFromCookies());

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      login: user.login,
      mail: user.mail,
      firstname: user.firstname,
      lastname: user.lastname,
      isAdmin: user.isAdmin,
    },
  });
}

/** The attributes Redmine's MyController#account accepts from `user` and `pref`; anything else is ignored. */
const accountBodySchema = z.object({
  user: z
    .object({
      firstname: z.string().min(1).optional(),
      lastname: z.string().min(1).optional(),
      mail: z.string().email().optional(),
      language: z.string().nullable().optional(),
      mail_notification: z.enum(MAIL_NOTIFICATION_OPTIONS).optional(),
    })
    .optional(),
  pref: z
    .object({
      hide_mail: z.boolean().optional(),
      time_zone: z.string().nullable().optional(),
      comments_sorting: z.enum(COMMENTS_SORTING_VALUES).optional(),
      no_self_notified: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Redmine's `PUT /my/account`: the signed-in user's own profile and preferences. A partial
 * update (fields left out keep their values); the same use case as the account screen, so a
 * mail change gets the same uniqueness check and security notice. Answers 204.
 */
export async function PUT(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  const viaCookie = viaApiKey ? null : await currentUserFromCookies();
  const user = viaApiKey ?? viaCookie;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const body = accountBodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_request", details: body.error.issues }, { status: 422 });
  }

  const repositories = accountRepositories();
  const current = resolvePreferences(await repositories.userPreferencesRepository.findByUserId(user.id), user.id);
  const profile = body.data.user ?? {};
  const pref = body.data.pref ?? {};
  try {
    await updateMyAccount(repositories, user.id, {
      firstname: profile.firstname ?? user.firstname,
      lastname: profile.lastname ?? user.lastname,
      mail: profile.mail ?? user.mail,
      language: profile.language !== undefined ? profile.language : user.language,
      mailNotification: profile.mail_notification ?? user.mailNotification,
      hideMail: pref.hide_mail ?? current.hideMail,
      timeZone: pref.time_zone !== undefined ? pref.time_zone : current.timeZone,
      commentsSorting: pref.comments_sorting ?? current.commentsSorting,
      noSelfNotified: pref.no_self_notified ?? current.noSelfNotified,
    });
  } catch (error) {
    if (error instanceof EmailAddressError) {
      return NextResponse.json({ error: "invalid_request", message: error.message }, { status: 422 });
    }
    throw error;
  }
  return new NextResponse(null, { status: 204 });
}
