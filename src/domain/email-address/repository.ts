import type { EmailAddress } from "./entity";

export interface EmailAddressRepository {
  listForUser(userId: string): Promise<EmailAddress[]>;
  /** Batch read for the notification job — one query for every recipient's extra addresses. */
  listForUsers(userIds: string[]): Promise<EmailAddress[]>;
  findById(id: string): Promise<EmailAddress | null>;
  /** Case-insensitive, like Redmine's uniqueness validation. Used to refuse an address someone else holds. */
  findByAddress(address: string): Promise<EmailAddress | null>;
  create(userId: string, address: string): Promise<EmailAddress>;
  setNotify(id: string, notify: boolean): Promise<void>;
  delete(id: string): Promise<void>;
}
