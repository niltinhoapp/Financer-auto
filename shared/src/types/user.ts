export type UserRole = "admin" | "seller" | "customer" | "financial";

export interface User {
  uid: string;
  role: UserRole;
  name: string;
  email: string;
  phone?: string;
  active: boolean;
  customerId?: string; // vínculo com customers/{id} quando role === "customer"
  mustChangePassword?: boolean; // força troca de senha no primeiro acesso
  createdAt: string;
  updatedAt: string;
}
