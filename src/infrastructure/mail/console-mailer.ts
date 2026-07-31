import type { Mailer, MailMessage } from "@/domain/mailer/port";

/**
 * Logs mail instead of sending it. No SMTP adapter is wired up in this phase — swapping in a
 * real transport later only means implementing this same Mailer port, per the domain-port
 * pattern already used for attachment storage.
 */
export class ConsoleMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    console.log(`[mail] to=${message.to.join(",")} subject=${message.subject}\n${message.body}`);
  }
}
