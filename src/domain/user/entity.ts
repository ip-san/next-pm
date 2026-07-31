export type UserStatus = "active" | "registered" | "locked";

export interface User {
  id: string;
  login: string;
  mail: string;
  firstname: string;
  lastname: string;
  isAdmin: boolean;
  status: UserStatus;
  passwordHash: string;
  passwordSalt: string;
  mustChangePassword: boolean;
  apiKey: string | null;
}

export function isActiveUser(user: Pick<User, "status">): boolean {
  return user.status === "active";
}
