import type { Group } from "./entity";

export interface GroupRepository {
  create(name: string): Promise<Group>;
  findById(id: string): Promise<Group | null>;
  rename(id: string, name: string): Promise<Group>;
  listAll(): Promise<Group[]>;
  delete(id: string): Promise<void>;
  addUser(groupId: string, userId: string): Promise<void>;
  removeUser(groupId: string, userId: string): Promise<void>;
  listUserIds(groupId: string): Promise<string[]>;
  listGroupIdsForUser(userId: string): Promise<string[]>;
}
