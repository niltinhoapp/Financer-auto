export type CommissionStatus = "pending" | "paid";

export interface Commission {
  id: string;
  sellerId: string;
  contractId: string;
  percentage: number;
  amount: number;
  status: CommissionStatus;
  paidAt?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  timestamp: string;
}
