/**
 * Registry de Conectores de Pagamento
 *
 * Centraliza o registro e acesso a todos os conectores disponíveis.
 * Permite que novas integrações de pagamento sejam adicionadas sem
 * modificar código core das Cloud Functions.
 *
 * Uso:
 *   const connector = ConnectorRegistry.get('pix');
 *   const payment = await connector.generatePaymentRequest({...});
 */

import { PaymentConnector } from '@financer-auto/shared';
import * as functions from 'firebase-functions';

export class ConnectorRegistry {
  private static connectors: Map<string, PaymentConnector> = new Map();
  private static logger = functions.logger;

  /**
   * Registrar um conector
   */
  static register(name: string, connector: PaymentConnector): void {
    if (this.connectors.has(name)) {
      this.logger.warn(`Conector '${name}' já foi registrado, substituindo...`);
    }
    this.connectors.set(name, connector);
    this.logger.info(`Conector '${name}' registrado com sucesso`);
  }

  /**
   * Obter um conector por nome
   */
  static get(name: string): PaymentConnector | undefined {
    const connector = this.connectors.get(name);
    if (!connector) {
      this.logger.warn(`Conector '${name}' não encontrado no registry`);
    }
    return connector;
  }

  /**
   * Listar todos os conectores registrados
   */
  static list(): PaymentConnector[] {
    return Array.from(this.connectors.values());
  }

  /**
   * Listar apenas conectores habilitados
   */
  static listEnabled(): PaymentConnector[] {
    return this.list().filter(c => c.config.enabled);
  }

  /**
   * Listar nomes dos conectores habilitados
   */
  static getEnabledNames(): string[] {
    return this.listEnabled().map(c => c.config.name);
  }

  /**
   * Verificar se um conector está disponível
   */
  static has(name: string): boolean {
    return this.connectors.has(name);
  }

  /**
   * Validar todos os conectores habilitados
   * (útil para health checks)
   */
  static async validateAll(): Promise<{
    [connectorName: string]: { valid: boolean; error?: string };
  }> {
    const results: {
      [connectorName: string]: { valid: boolean; error?: string };
    } = {};

    for (const connector of this.listEnabled()) {
      try {
        results[connector.name] = await connector.validate();
      } catch (error) {
        results[connector.name] = {
          valid: false,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        };
      }
    }

    return results;
  }

  /**
   * Limpar registry (útil para testes)
   */
  static clear(): void {
    this.connectors.clear();
    this.logger.info('Registry de conectores limpo');
  }
}

/**
 * Inicializar conectores padrão
 *
 * Chamado automaticamente ao carregar o módulo.
 * Se implementar novos conectores, registrá-los aqui.
 */
export function initializeConnectors(): void {
  // Importar e registrar conectores conforme implementados
  // Exemplo (quando implementar):
  // import { PixReceiverConnector } from './connectors/pix-receiver';
  // import { StripeConnector } from './connectors/stripe';
  //
  // const pixConfig = {
  //   name: 'pix',
  //   enabled: process.env.PIX_ENABLED === 'true',
  //   apiKey: process.env.PIX_API_KEY,
  //   webhookSecret: process.env.PIX_WEBHOOK_SECRET,
  // };
  // ConnectorRegistry.register('pix', new PixReceiverConnector(pixConfig));
  //
  // const stripeConfig = {
  //   name: 'stripe',
  //   enabled: process.env.STRIPE_ENABLED === 'true',
  //   apiKey: process.env.STRIPE_API_KEY,
  //   webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  // };
  // ConnectorRegistry.register('stripe', new StripeConnector(stripeConfig));

  functions.logger.info('Conectores de pagamento inicializados');
}

// Inicializar ao carregar o módulo
initializeConnectors();
