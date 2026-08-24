# Roadmap de Funcionalidades — Financer Auto

## 🎯 Visão Geral

Este documento descreve as funcionalidades planejadas e em desenvolvimento, com foco em:
1. **Pagamentos Automáticos** — PIX, cartão, financiamento bancário
2. **Sistema de Conectores** — plugins reutilizáveis para integrações
3. **Acompanhamento** — status de implementação e dependências

---

## 💳 1. Sistema de Pagamentos Automáticos

### 1.1 PIX Automático Recebível ⭐ PRIORITY

**Objetivo:** Gerar QR code dinâmico para cobrar parcelas via PIX, com liquidação automática.

#### Arquitetura Proposta

```
Fluxo: Contract Installment → PIX QR Code → Webhook Retorno → Atualizar Installment

1. Admin/Seller cria contrato com parcelas
2. Sistema gera PIX QR code dinâmico para cada parcela
   - Lib: dict-api (Dict.br + TSP como Itaú, Bradesco)
   - Gera chave PIX única por parcela
3. Cliente escaneia QR → transferência
4. Webhook (TSP) → Cloud Function → Confirma pagamento
5. Atualiza installment.status = 'paid' + installment.paidAt
6. Dispara notificação ao seller
```

**Providências:**
- [ ] Criar conector `pix-receiver.connector.ts`
- [ ] Integrar SDK da instituição bancária (Itaú, Bradesco, etc.)
- [ ] Endpoint webhook em `functions/src/webhooks/pix.ts`
- [ ] UI: mostrar QR code na tela de pagamento (web + mobile)
- [ ] Reconciliação automática (diária)

**Recursos:**
- Dict API: https://www.bcb.gov.br/pix
- SDK Exemplo: `@itau/pix` (fictício — ajustar por TSP real)

---

### 1.2 Cartão de Crédito (Stripe / PagSeguro)

**Objetivo:** Aceitar parcelamento em cartão de crédito com integração automática.

#### Arquitetura

```
Fluxo: Installment → Stripe Payment Intent → Webhook Confirmação

1. Admin configura Stripe API key (via ambiente ou painel)
2. Customer tenta pagar parcela com cartão
3. Cliente redireciona pra Stripe Checkout (ou embedded form)
4. Stripe dispara webhook `payment_intent.succeeded`
5. Cloud Function confirma installment.paid
```

**Providências:**
- [ ] Criar conector `stripe.connector.ts`
- [ ] Implementar SDK Stripe.js no web
- [ ] Webhook: `functions/src/webhooks/stripe.ts`
- [ ] Painel de configuração de chaves de API (admin only)
- [ ] Teste com modo de teste Stripe

---

### 1.3 Financiamento Bancário (Simulação + Aprovação)

**Objetivo:** Integrar com banco parceiro para pré-aprovar financiamentos, com webhook de retorno.

#### Arquitetura

```
Fluxo: Contract Creation → Enviar p/ Banco → Webhook de Aprovação → Atualizar Status

1. Seller cria contrato (dados do cliente, veículo, valor)
2. Sistema envia request ao endpoint do banco via conector
3. Banco simula e retorna:
   - Margem disponível do cliente
   - Taxa de juros aprovada
   - Limite de parcelamento
4. Webhook confirma aprovação
5. Contract.status = 'approved' (pronto pra gerar PDFs)
```

**Providências:**
- [ ] Criar conector `banking-partner.connector.ts`
- [ ] Documentar API do parceiro bancário
- [ ] Endpoint webhook: `functions/src/webhooks/bank-approval.ts`
- [ ] Retry logic (falha de rede)
- [ ] Dashboard: status de aprovação em tempo real

---

## 🔌 2. Sistema de Conectores (Connector Pattern)

Para que a loja possa adicionar novas integrações sem modificar código core, propomos um **plugin system**.

### 2.1 Arquitetura de Conectores

```
shared/src/connectors/
├── base.connector.ts          # Interface base
├── pix-receiver.connector.ts  # PIX
├── stripe.connector.ts        # Stripe
├── banking-partner.connector.ts # Banco
└── types.ts
```

**Interface Base:**

```typescript
// shared/src/connectors/base.connector.ts
export interface PaymentConnectorConfig {
  name: string;                    // 'pix', 'stripe', 'bank'
  enabled: boolean;
  apiKey?: string;                 // secrets (não em código)
  webhookSecret?: string;
  testMode?: boolean;
  metadata?: Record<string, any>;  // config extra
}

export interface PaymentConnector {
  config: PaymentConnectorConfig;
  name: string;
  
  // Validar configuração
  validate(): Promise<{ valid: boolean; error?: string }>;
  
  // Gerar request de pagamento
  generatePaymentRequest(data: {
    installmentId: string;
    amount: number;
    dueDate: string;
    customerId: string;
  }): Promise<{
    paymentId: string;
    redirectUrl?: string;  // Stripe
    qrCode?: string;       // PIX
    metadata: any;
  }>;
  
  // Confirmar pagamento (via webhook ou poll)
  confirmPayment(paymentId: string): Promise<{
    status: 'confirmed' | 'pending' | 'failed';
    transactionId?: string;
  }>;
  
  // Reembolsar
  refund(transactionId: string, amount: number): Promise<{ success: boolean }>;
}
```

### 2.2 Registry de Conectores

```typescript
// functions/src/connectors-registry.ts
import { PaymentConnector } from '@financer/shared';
import { PixReceiver } from './connectors/pix-receiver';
import { StripeConnector } from './connectors/stripe';
import { BankingPartnerConnector } from './connectors/banking-partner';

export class ConnectorRegistry {
  private static connectors: Map<string, PaymentConnector> = new Map();
  
  static register(name: string, connector: PaymentConnector) {
    this.connectors.set(name, connector);
  }
  
  static get(name: string): PaymentConnector | undefined {
    return this.connectors.get(name);
  }
  
  static listEnabled(): PaymentConnector[] {
    return Array.from(this.connectors.values()).filter(c => c.config.enabled);
  }
}

// Registrar conectores na inicialização
ConnectorRegistry.register('pix', new PixReceiver());
ConnectorRegistry.register('stripe', new StripeConnector());
ConnectorRegistry.register('banking-partner', new BankingPartnerConnector());
```

### 2.3 Como Adicionar um Novo Conector

**Exemplo: integrar PagSeguro em vez de Stripe**

1. Criar arquivo:
```typescript
// functions/src/connectors/pagseguro.ts
import { PaymentConnector, PaymentConnectorConfig } from '@financer/shared';

export class PagSeguroConnector implements PaymentConnector {
  name = 'pagseguro';
  config: PaymentConnectorConfig;
  
  constructor(config: PaymentConnectorConfig) {
    this.config = config;
  }
  
  async validate() {
    // Testar conexão com API PagSeguro
  }
  
  async generatePaymentRequest(data) {
    // Implementar lógica PagSeguro
  }
  
  async confirmPayment(paymentId) {
    // Implementar confirmação
  }
  
  async refund(transactionId, amount) {
    // Implementar reembolso
  }
}
```

2. Registrar:
```typescript
// functions/src/connectors-registry.ts (atualizar)
import { PagSeguroConnector } from './connectors/pagseguro';
ConnectorRegistry.register('pagseguro', new PagSeguroConnector(config));
```

3. Usar no Cloud Function:
```typescript
// functions/src/payments.ts
export const processPayment = onCall(async (request) => {
  const { installmentId, connectorName } = request.data;
  const connector = ConnectorRegistry.get(connectorName);
  
  if (!connector) {
    throw new HttpsError('not-found', 'Conector não encontrado');
  }
  
  const result = await connector.generatePaymentRequest({...});
  return result;
});
```

### 2.4 Configuração via Admin Panel

**Nova página:** `/panel/configuracoes/pagamentos`

```typescript
// web/app/(panel)/configuracoes/pagamentos/page.tsx
export default function PaymentSettingsPage() {
  // Listar conectores disponíveis
  // Toggle enable/disable
  // Editar API key (com masking/encryption)
  // Testar conexão (validate())
  // Ver logs de transações por conector
}
```

---

## 📊 3. Modelo de Transação

Para rastrear todas as tentativas de pagamento (sucesso/falha), independente do conector:

```typescript
// shared/src/types/transaction.ts
export interface Payment {
  id: string;
  installmentId: string;
  customerId: string;
  
  // Conector usado
  connectorName: 'pix' | 'stripe' | 'pagseguro' | 'banking-partner';
  connectorTransactionId?: string;  // ID retornado pelo conector
  
  // Valores
  amount: number;
  currency: 'BRL';
  
  // Status lifecycle
  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  failureReason?: string;
  
  // Timestamps
  createdAt: ISO8601;
  confirmedAt?: ISO8601;
  
  // Auditoria
  metadata: {
    userAgent?: string;
    ipAddress?: string;
    retries?: number;
  };
}
```

Firestore:
```
payments/
├── {paymentId}
│   ├── id, installmentId, customerId
│   ├── connectorName, connectorTransactionId
│   ├── amount, currency, status
│   ├── createdAt, confirmedAt
│   └── metadata
```

---

## 🔐 4. Segurança & Compliance

### Armazenamento de Chaves de API
- **Never:** em código ou `.env` commitado
- **Use:** Firebase Secret Manager
  ```bash
  gcloud secrets create stripe-api-key --data-file=- <<< "sk_live_..."
  ```
- **Access:** via `functions` com permissão limitada

### PCI-DSS (Cartão)
- **Nunca** processar números de cartão no servidor
- **Use:** Stripe Checkout / Embedded Form (tokenização)
- **Never** armazenar raw card numbers

### PIX Webhooks
- **Validar** assinatura do webhook (HMAC-SHA256)
- **Idempotência:** usar `paymentId` para deduplica

### Auditoria
- Toda tentativa de pagamento em `audit/` collection
- Admin pode ver logs de transações por conector
- Integrar com Sentry para erros críticos

---

## 📈 5. Roadmap de Implementação

| Fase | Feature | Timeline | Esforço | Blocker |
|------|---------|----------|---------|---------|
| **1** | Conector Base + Registry | Sprint 1 | 2d | — |
| **1** | PIX Automático | Sprint 1-2 | 5d | Decisão: qual TSP (Itaú, Bradesco, etc.) |
| **2** | Stripe Integration | Sprint 2-3 | 4d | API key configurável |
| **2** | Admin Config Panel | Sprint 2 | 3d | Depends: Conector Base |
| **3** | Financiamento Bancário | Sprint 3-4 | 6d | Contato com banco parceiro |
| **3** | Webhooks + Reconciliação | Sprint 3 | 4d | Rate limiting no Firebase |
| **4** | Mobile (React Native) | Sprint 4+ | TBD | Web deve estar estável |
| **4** | Relatórios Avançados | Sprint 4+ | TBD | Data warehouse / BI |

---

## 🛠 6. Como Começar

### Etapa 1: Setup Conector Base
```bash
# 1. Criar interface em shared/
touch shared/src/connectors/base.connector.ts

# 2. Adicionar tipos
touch shared/src/connectors/types.ts

# 3. Criar registry em functions/
touch functions/src/connectors-registry.ts
```

### Etapa 2: Integração PIX (Exemplo)
```bash
# 1. Pesquisar e escolher TSP (Itaú, Bradesco)
# 2. Obter SDK / documentação da API
# 3. Criar conector
touch functions/src/connectors/pix-receiver.ts

# 4. Testar com Firestore emulator
firebase emulators:start

# 5. Implementar webhook
touch functions/src/webhooks/pix.ts

# 6. UI no web
touch web/app/\(cliente\)/pagamento/page.tsx
```

### Etapa 3: Admin Config
```bash
# 1. Nova página de settings
mkdir -p web/app/\(panel\)/configuracoes/pagamentos

# 2. Form para configurar API keys (com encryption)
touch web/app/\(panel\)/configuracoes/pagamentos/page.tsx

# 3. Cloud Function para salvar secrets
# (via Firebase Secret Manager)
```

---

## 📚 Recursos & Referências

- **PIX / Dict API:** https://www.bcb.gov.br/pix/ferramentaspix
- **Stripe:** https://stripe.com/docs (webhooks, payment intents)
- **PagSeguro:** https://dev.pagseguro.uol.com.br
- **Firebase Secrets:** https://firebase.google.com/docs/functions/config-env#secret_manager
- **OWASP Payment Security:** https://cheatsheetseries.owasp.org/cheatsheets/Payment_Card_Industry_Data_Security_Standard_Cheat_Sheet.html

---

## 🎯 Próximos Passos

1. **Decidir TSP para PIX** — conversar com gerente de conta bancária
2. **Solicitar credenciais de teste** — API keys, webhooks secrets
3. **Criar PR com conector base** — review & merge
4. **Implementar primeiro conector** — PIX
5. **Deploy e testes em produção** — com volume limitado primeiro

---

**Última atualização:** 2024-08-22  
**Autor:** Financer Auto Dev Team  
**Status:** Planejamento Ativo
