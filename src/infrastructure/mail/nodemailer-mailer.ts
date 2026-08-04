import nodemailer from "nodemailer";
import type { SmtpConfig } from "@/domain/mailer/smtp-config";
import type { Mailer, MailMessage } from "@/domain/mailer/port";

export class NodemailerMailer implements Mailer {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth ?? undefined,
    });
    this.from = config.from;
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
    });
  }
}
