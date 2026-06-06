export type UserRole = "admin" | "seller" | "customer";

export interface User {
  uid: string;
  role: UserRole;
  name: string;
  email: string;
  phone?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
