/**
 * Base interface para conectores de pagamento
 *
 * Cada conector (PIX, Stripe, PagSeguro, etc.) deve implementar
 * essa interface para garantir consistência na geração, confirmação
 * e reembolso de pagamentos.
 */

export interface PaymentConnectorConfig {
  /** Nome único do conector (ex: 'pix', 'stripe', 'pagseguro') */
  name: string;

  /** Se está habilitado para processar pagamentos */
  enabled: boolean;

  /** Chave de API (deve vir de Firebase Secrets, não de .env) */
  apiKey?: string;

  /** Secret para validar webhooks (HMAC) */
  webhookSecret?: string;

  /** Usar modo de teste/sandbox */
  testMode?: boolean;

  /** Configuração adicional específica do conector */
  metadata?: Record<string, any>;
}

export interface GeneratePaymentRequestInput {
  /** ID único da parcela no Firestore */
  installmentId: string;

  /** Valor a cobrar (em centavos: 10000 = R$ 100,00) */
  amount: number;

  /** Data de vencimento (YYYY-MM-DD) */
  dueDate: string;

  /** ID do cliente no Firestore */
  customerId: string;

  /** ID do contrato (para referência) */
  contractId?: string;

  /** Dados do cliente (para enriquecer a transação) */
  customerData?: {
    name: string;
    email: string;
    phone?: string;
    cpf?: string;
  };
}

export interface GeneratePaymentRequestOutput {
  /** ID gerado pelo conector (para rastrear na confirmação) */
  paymentId: string;

  /** URL de redirecionamento (ex: Stripe Checkout) */
  redirectUrl?: string;

  /** QR code em base64 (ex: PIX) */
  qrCode?: string;

  /** Chave PIX estática/dinâmica (ex: PIX dict) */
  pixKey?: string;

  /** Metadados adicionais do conector (para armazenar na transação) */
  metadata: {
    connectorTransactionId?: string;
    expiresAt?: string;  // ISO8601
    [key: string]: any;
  };
}

export interface ConfirmPaymentInput {
  /** ID de pagamento retornado por generatePaymentRequest */
  paymentId: string;

  /** ID único da transação no conector (ex: Stripe charge ID) */
  connectorTransactionId?: string;

  /** Dados adicionais (variam por conector) */
  data?: Record<string, any>;
}

export interface ConfirmPaymentOutput {
  /** Status final da confirmação */
  status: 'confirmed' | 'pending' | 'failed';

  /** ID da transação no conector */
  connectorTransactionId?: string;

  /** Valor efetivamente recebido */
  amount?: number;

  /** Motivo da falha (se applicable) */
  failureReason?: string;

  /** Timestamp de confirmação (ISO8601) */
  confirmedAt?: string;

  /** Metadados adicionais */
  metadata?: Record<string, any>;
}

export interface RefundInput {
  /** ID da transação original (retornado por confirmPayment) */
  connectorTransactionId: string;

  /** Valor a reembolsar (em centavos). Se vazio, reembolso total. */
  amount?: number;

  /** Motivo do reembolso */
  reason?: string;
}

export interface RefundOutput {
  /** Se reembolso foi bem-sucedido */
  success: boolean;

  /** ID do reembolso no conector */
  refundId?: string;

  /** Motivo do erro (se applicable) */
  error?: string;
}

/**
 * Interface que todo conector de pagamento deve implementar
 */
export interface PaymentConnector {
  /** Configuração do conector */
  config: PaymentConnectorConfig;

  /** Nome do conector (para logs/auditoria) */
  readonly name: string;

  /**
   * Validar que a configuração está correta
   * (ex: teste de conexão com API externa)
   */
  validate(): Promise<{ valid: boolean; error?: string }>;

  /**
   * Gerar request de pagamento (ex: QR code PIX, Stripe link)
   * Chamado quando cliente tenta pagar uma parcela
   */
  generatePaymentRequest(
    input: GeneratePaymentRequestInput
  ): Promise<GeneratePaymentRequestOutput>;

  /**
   * Confirmar que pagamento foi recebido
   * Chamado:
   * - via webhook do conector (assíncrono)
   * - ou manualmente por polling (ex: PIX)
   */
  confirmPayment(
    input: ConfirmPaymentInput
  ): Promise<ConfirmPaymentOutput>;

  /**
   * Reembolsar um pagamento já confirmado
   */
  refund(input: RefundInput): Promise<RefundOutput>;

  /**
   * Validar assinatura de webhook (segurança)
   * Retorna true se webhook é legítimo
   */
  validateWebhookSignature?(
    payload: string,
    signature: string
  ): Promise<boolean>;

  /**
   * Processar webhook (ex: PIX retorno de pix-dict-api)
   * Retorna dados normalizados
   */
  processWebhook?(
    payload: Record<string, any>
  ): Promise<ConfirmPaymentOutput>;
}

/**
 * Tipos de eventos que um conector pode disparar
 */
export enum PaymentEventType {
  PAYMENT_REQUESTED = 'payment.requested',
  PAYMENT_CONFIRMED = 'payment.confirmed',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_REFUNDED = 'payment.refunded',
  WEBHOOK_RECEIVED = 'webhook.received',
}

export interface PaymentEvent {
  type: PaymentEventType;
  connectorName: string;
  installmentId: string;
  customerId: string;
  data: Record<string, any>;
  timestamp: string; // ISO8601
  transactionId?: string;
}
