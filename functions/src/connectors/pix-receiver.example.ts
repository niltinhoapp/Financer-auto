/**
 * Exemplo de Conector PIX Automático Recebível
 *
 * Implementação de referência para um conector real de PIX.
 * Este é um TEMPLATE — adapte conforme a instituição bancária (Itaú, Bradesco, etc.)
 *
 * Fluxo:
 * 1. Cliente tenta pagar parcela → generatePaymentRequest()
 * 2. Sistema gera chave PIX dinâmica via Dict API / TSP
 * 3. Retorna QR code → cliente escaneia e paga
 * 4. Webhook retorna confirmação → confirmPayment()
 * 5. Installment marcada como paga
 *
 * Referências:
 * - Dict API: https://www.bcb.gov.br/pix
 * - Exemplo TSP: SDK Itaú, Bradesco, etc.
 */

import {
  PaymentConnector,
  PaymentConnectorConfig,
  GeneratePaymentRequestInput,
  GeneratePaymentRequestOutput,
  ConfirmPaymentInput,
  ConfirmPaymentOutput,
  RefundInput,
  RefundOutput,
} from '@financer-auto/shared';
import * as functions from 'firebase-functions';

interface PixDynamicKeyResponse {
  txId: string;           // ID único da transação
  qrCode: string;         // QR code em base64
  pixKey: string;         // Chave PIX (cpf@dict, email, etc)
  expiresAt: string;      // ISO8601 — quando expira
  brCode: string;         // BR Code (código de barras estático)
}

export class PixReceiverConnector implements PaymentConnector {
  config: PaymentConnectorConfig;
  readonly name = 'pix';

  constructor(config: PaymentConnectorConfig) {
    this.config = config;
  }

  /**
   * Validar que consegue conectar na API PIX
   */
  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      // Exemplo: testar conexão com endpoint da TSP
      if (!this.config.apiKey) {
        return { valid: false, error: 'API key do PIX não configurada' };
      }

      // TODO: fazer request test na API real
      // const response = await fetch('https://api.tsp.example.com/health', {
      //   headers: { Authorization: `Bearer ${this.config.apiKey}` }
      // });
      // if (!response.ok) {
      //   return { valid: false, error: `API retornou ${response.status}` };
      // }

      functions.logger.info('PIX connector validado com sucesso');
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Gerar QR code PIX dinâmico para cobrar parcela
   */
  async generatePaymentRequest(
    input: GeneratePaymentRequestInput
  ): Promise<GeneratePaymentRequestOutput> {
    try {
      const { installmentId, amount, dueDate, customerData } = input;

      // Validar entrada
      if (!installmentId || !amount || !dueDate) {
        throw new Error('installmentId, amount, dueDate são obrigatórios');
      }

      // 1. Gerar chave PIX dinâmica na TSP (Itaú, Bradesco, etc.)
      const pixKeyResponse = await this.createDynamicPixKey({
        installmentId,
        amount,
        dueDate,
        customerData,
      });

      functions.logger.info(`PIX key gerada para installment ${installmentId}`, {
        txId: pixKeyResponse.txId,
      });

      // 2. Armazenar metadata para confirmação posterior
      const metadata = {
        connectorTransactionId: pixKeyResponse.txId,
        qrCode: pixKeyResponse.qrCode,
        pixKey: pixKeyResponse.pixKey,
        brCode: pixKeyResponse.brCode,
        expiresAt: pixKeyResponse.expiresAt,
        createdAt: new Date().toISOString(),
      };

      return {
        paymentId: `pix-${installmentId}-${pixKeyResponse.txId}`,
        qrCode: pixKeyResponse.qrCode,
        pixKey: pixKeyResponse.pixKey,
        metadata,
      };
    } catch (error) {
      functions.logger.error('Erro ao gerar PIX key', error);
      throw error;
    }
  }

  /**
   * Confirmar que PIX foi recebido (via webhook)
   *
   * Chamado quando:
   * - Webhook da TSP retorna confirmação de pagamento
   * - Ou polling manual (menos recomendado)
   */
  async confirmPayment(
    input: ConfirmPaymentInput
  ): Promise<ConfirmPaymentOutput> {
    try {
      const { connectorTransactionId, data } = input;

      if (!connectorTransactionId) {
        throw new Error('connectorTransactionId obrigatório');
      }

      // TODO: Consultar status no endpoint da TSP
      // const response = await fetch(
      //   `https://api.tsp.example.com/pix/${connectorTransactionId}`,
      //   { headers: { Authorization: `Bearer ${this.config.apiKey}` } }
      // );
      // const status = await response.json();

      // Exemplo de retorno:
      const isConfirmed = data?.status === 'PAID' || data?.paid === true;

      return {
        status: isConfirmed ? 'confirmed' : 'pending',
        connectorTransactionId,
        confirmedAt: isConfirmed ? new Date().toISOString() : undefined,
        amount: data?.amount,
        metadata: {
          endToEndId: data?.endToEndId,
          paidAt: data?.paidAt,
        },
      };
    } catch (error) {
      functions.logger.error('Erro ao confirmar PIX', error);
      return {
        status: 'failed',
        failureReason: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Validar assinatura de webhook (segurança)
   * PIX usa HMAC-SHA256
   */
  async validateWebhookSignature(
    payload: string,
    signature: string
  ): Promise<boolean> {
    try {
      const crypto = require('crypto');

      if (!this.config.webhookSecret) {
        functions.logger.warn('webhookSecret não configurado para PIX');
        return false;
      }

      const hash = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(payload)
        .digest('hex');

      const isValid = hash === signature;

      if (!isValid) {
        functions.logger.warn('Assinatura de webhook PIX inválida');
      }

      return isValid;
    } catch (error) {
      functions.logger.error('Erro ao validar assinatura', error);
      return false;
    }
  }

  /**
   * Processar webhook de retorno do PIX
   */
  async processWebhook(
    payload: Record<string, any>
  ): Promise<ConfirmPaymentOutput> {
    // Exemplo de payload (adaptar conforme TSP):
    // {
    //   "txId": "abc123def456",
    //   "status": "PAID",
    //   "endToEndId": "E12345678901234567890123456789",
    //   "amount": 10000,
    //   "paidAt": "2024-01-15T10:30:00Z"
    // }

    return await this.confirmPayment({
      paymentId: payload.txId,
      connectorTransactionId: payload.txId,
      data: payload,
    });
  }

  /**
   * Reembolsar PIX (devolução em 1-3 dias úteis)
   */
  async refund(input: RefundInput): Promise<RefundOutput> {
    try {
      const { connectorTransactionId, amount, reason } = input;

      // TODO: Chamar endpoint de devolução da TSP
      // POST /api/pix/refund
      // {
      //   "transactionId": "abc123...",
      //   "amount": 10000,
      //   "reason": "Cancelamento de parcela"
      // }

      functions.logger.info(
        `Reembolso solicitado para PIX ${connectorTransactionId}`,
        { amount, reason }
      );

      return {
        success: true,
        refundId: `refund-${connectorTransactionId}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Helper: criar chave PIX dinâmica (internal)
   */
  private async createDynamicPixKey(params: {
    installmentId: string;
    amount: number;
    dueDate: string;
    customerData?: any;
  }): Promise<PixDynamicKeyResponse> {
    // TODO: Implementar chamada real à API da TSP
    // Exemplo pseudocódigo:
    //
    // const response = await fetch(
    //   'https://api.tsp.example.com/pix/dynamic-key',
    //   {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //       'Authorization': `Bearer ${this.config.apiKey}`,
    //     },
    //     body: JSON.stringify({
    //       keyType: 'DYNAMIC',
    //       amount: params.amount,
    //       dueDate: params.dueDate,
    //       customer: {
    //         name: params.customerData?.name,
    //         cpf: params.customerData?.cpf,
    //       },
    //       description: `Parcela ${params.installmentId}`,
    //       expirationMinutes: 3600, // 1 hora
    //     }),
    //   }
    // );
    //
    // return await response.json();

    // Por enquanto, retornar mock (para testes)
    const txId = `pix-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return {
      txId,
      qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      pixKey: '00020126580014br.gov.bcb.pix...',
      brCode: `00020126580014br.gov.bcb.brcode01123456789012345678901234567890`,
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hora
    };
  }
}

/**
 * Exportar para uso em ConnectorRegistry:
 *
 * import { PixReceiverConnector } from './connectors/pix-receiver.example';
 * import { ConnectorRegistry } from './connectors-registry';
 *
 * const pixConfig = {
 *   name: 'pix',
 *   enabled: process.env.PIX_ENABLED === 'true',
 *   apiKey: process.env.PIX_API_KEY,
 *   webhookSecret: process.env.PIX_WEBHOOK_SECRET,
 * };
 * ConnectorRegistry.register('pix', new PixReceiverConnector(pixConfig));
 */
