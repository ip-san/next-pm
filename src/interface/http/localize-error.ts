import { localizeMessage } from "@/domain/i18n/error-messages";
import { currentLocale } from "@/interface/http/locale";

/**
 * A server message in the language of the request's interface, for the error and result text a server action returns.
 * The domain and application layers write Japanese; this is where it is translated (see error-messages.ts). Null and
 * undefined pass through, and outside a request (no headers to read) the text comes back as it is.
 */
export async function localizeError<T extends string | null | undefined>(text: T): Promise<T> {
  if (typeof text !== "string") return text;
  try {
    return localizeMessage(await currentLocale(), text) as T;
  } catch {
    return text;
  }
}

/** The same for a map of messages, such as the per-field errors of a custom field form. */
export async function localizeErrorMap(errors: Record<string, string>): Promise<Record<string, string>> {
  const entries = await Promise.all(Object.entries(errors).map(async ([key, text]) => [key, await localizeError(text)] as const));
  return Object.fromEntries(entries);
}
