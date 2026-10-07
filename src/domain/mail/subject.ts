/**
 * The subject lines outgoing notifications use. They exist in this shape for one reason: the
 * incoming mail handler routes a reply by the token in the subject (parse-email.ts), so a
 * notification that carries no token can never be replied to. Redmine builds the same tokens
 * from its sequential ids (`[Project - Tracker #123]`, `[Project - Board - msg45]`); next-pm
 * uses the first 8 characters of the uuid, the shorthand the rest of the app already displays.
 *
 * The tracker and board names Redmine includes are left out — they are not loaded at every
 * call site, and only the token is load-bearing for routing.
 */

export function idToken(id: string): string {
  return id.slice(0, 8);
}

/** `[Project #eb0b2d1a] Subject` — replied to by MailHandler's issue path. */
export function issueMailSubject(projectName: string, issueId: string, subject: string): string {
  return `[${projectName} #${idToken(issueId)}] ${subject}`;
}

/** `[Project - msg1a2b3c4d] Subject` — replied to by MailHandler's forum path. */
export function messageMailSubject(projectName: string, topicId: string, subject: string): string {
  return `[${projectName} - msg${idToken(topicId)}] ${subject}`;
}
