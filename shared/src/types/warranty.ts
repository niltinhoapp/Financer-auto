export type WarrantyStatus = "active" | "expired";

export interface Warranty {
  id: string;
  contractId: string;
  vehicleId: string;
  customerId: string;
  startDate: string;
  endDate: string;
  coverage: string;
  status: WarrantyStatus;
  workshopIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Workshop {
  id: string;
  name: string;
  phone: string;
  address: string;
  specialties: string[];
  active: boolean;
  createdAt: string;
}

export interface Revision {
  id: string;
  vehicleId: string;
  contractId: string;
  workshopId?: string;
  date: string;
  mileage: number;
  services: string[];
  parts: string[];
  photos: string[];
  notes?: string;
  cost?: number;
  // Data prevista da próxima revisão (opcional, preenchido pela oficina/admin).
  // Base para futuras automações de lembrete (Fase 7 do ROADMAP) — não há
  // nenhum job/notificação usando este campo ainda.
  nextDueDate?: string;
  createdBy: string;
  createdAt: string;
}
