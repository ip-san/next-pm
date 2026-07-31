import type { Role } from "./entity";

export interface RoleRepository {
  listAll(): Promise<Role[]>;
  findById(id: string): Promise<Role | null>;
  findByIds(ids: string[]): Promise<Role[]>;
  findBuiltinNonMember(): Promise<Role>;
  findBuiltinAnonymous(): Promise<Role>;
  listAssignable(): Promise<Role[]>;
  create(role: Omit<Role, "id">): Promise<Role>;
}
