export interface MailMessage {
  to: string[];
  subject: string;
  body: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}
