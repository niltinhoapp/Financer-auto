export type CommissionStatus = "pending" | "paid";

// "seller" = comissão de vendedor interno (o único tipo existente hoje).
// "correspondent" = comissão de correspondente/hub de financiamento (Fase 4/5
// do ROADMAP — Asaas/BV Open). "other" = qualquer outro caso futuro.
export type CommissionType = "seller" | "correspondent" | "other";

export interface Commission {
  id: string;
  // Ausente = comissão de vendedor, para compatibilidade com registros
  // existentes (que nunca tiveram esse campo).
  type?: CommissionType;
  // Obrigatório quando type === "seller" (ou ausente); não se aplica a
  // comissão de correspondente, que usa partnerId/partnerName abaixo.
  sellerId?: string;
  partnerId?: string;
  partnerName?: string;
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
