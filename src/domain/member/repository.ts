import type { Member } from "./entity";

export interface MemberRepository {
  findByUserAndProject(userId: string, projectId: string): Promise<Member | null>;
  listByProject(projectId: string): Promise<Member[]>;
  create(member: Omit<Member, "id">): Promise<Member>;
  delete(memberId: string): Promise<void>;
}
