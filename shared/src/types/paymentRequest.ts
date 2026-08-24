export type PaymentRequestStatus = "pending" | "confirmed" | "rejected";

export interface PaymentRequest {
  id: string;
  contractId: string;
  customerId: string;
  customerName: string;
  installmentIds: string[];        // IDs das parcelas selecionadas
  installmentNumbers: number[];    // nº das parcelas (ex: [3, 4])
  totalAmount: number;             // total com juros/multa calculados
  status: PaymentRequestStatus;
  paymentMethod?: "pix" | "dinheiro"; // forma de pagamento escolhida
  notes?: string;                  // observação do cliente
  proofUrl?: string;               // URL do comprovante no Storage
  proofPath?: string;              // caminho no Storage (p/ URL assinada)
  proofFileName?: string;          // nome original do arquivo
  confirmedBy?: string;            // uid do admin que confirmou
  confirmedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}
