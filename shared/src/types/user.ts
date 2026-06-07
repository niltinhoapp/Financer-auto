export type UserRole = "admin" | "seller" | "customer";

export interface User {
  uid: string;
  role: UserRole;
  name: string;
  email: string;
  phone?: string;
  active: boolean;
  customerId?: string; // vínculo com customers/{id} quando role === "customer"
  createdAt: string;
  updatedAt: string;
}
