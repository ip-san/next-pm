import type { User } from "./entity";

export interface UserRepository {
  listAll(): Promise<User[]>;
  findById(id: string): Promise<User | null>;
  findByIds(ids: string[]): Promise<User[]>;
  findByLogin(login: string): Promise<User | null>;
  findByApiKey(apiKey: string): Promise<User | null>;
  /** Case-insensitive — mirrors Redmine's User.find_by_mail. */
  findByMail(mail: string): Promise<User | null>;
  create(user: Omit<User, "id">): Promise<User>;
}
