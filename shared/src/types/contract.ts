export type ContractStatus = "active" | "settled" | "defaulted" | "renegotiated";
export type InstallmentStatus = "pending" | "paid" | "overdue" | "renegotiated";
export type PaymentMethod = "cash" | "pix" | "credit_card" | "transfer" | "check";

// Assinatura digital simples (eletrônica) do comprador: nome digitado +
// confirmação de leitura + carimbo de data/hora + metadados de auditoria.
export interface ContractSignature {
  signerUid: string;
  signerName: string;
  signerCpf: string;
  signedAt: string;
  ip?: string;
  userAgent?: string;
}

export interface Contract {
  id: string;
  customerId: string;
  vehicleId: string;
  sellerId: string;

  salePrice: number;
  downPayment: number;
  financedAmount: number;
  installmentsCount: number;
  installmentValue: number;
  firstDueDate: string;

  interestRate: number;
  penaltyRate: number;
  dailyInterestRate: number;

  status: ContractStatus;
  pdfUrl?: string;
  notes?: string;
  signature?: ContractSignature;

  createdAt: string;
  updatedAt: string;
}

export interface Installment {
  id: string;
  contractId: string;
  number: number;
  dueDate: string;
  value: number;
  status: InstallmentStatus;
  paidAt?: string;
  paidAmount?: number;
  paymentMethod?: PaymentMethod;
  receiptUrl?: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  contractId: string;
  installmentId: string;
  customerId: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  pixTxId?: string;
  receiptUrl?: string;
  registeredBy: string;
  notes?: string;
}
