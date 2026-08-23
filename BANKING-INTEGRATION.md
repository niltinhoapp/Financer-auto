# Integração com Financiamento Bancário — Guia Técnico

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Fluxo Completo](#fluxo-completo)
3. [Implementação](#implementação)
4. [Exemplos de Bancos Reais](#exemplos-de-bancos-reais)
5. [Webhook & Segurança](#webhook--segurança)
6. [Tratamento de Erros](#tratamento-de-erros)
7. [Teste & Deploy](#teste--deploy)

---

## Visão Geral

**Objetivo:** Integrar com banco parceiro para:
1. Submeter solicitação de financiamento de cliente
2. Banco calcula taxa e margem disponível
3. Banco aprova/rejeita e retorna via webhook
4. Sistema atualiza contrato com dados aprovados
5. Seller vê status em tempo real no painel

**Benefício:** Automação total — sem ligar pro banco, sem papelada.

---

## Fluxo Completo

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SELLER CRIA CONTRATO (web/panel/contratos/novo)         │
│    • Seleciona cliente (CPF, dados básicos)                 │
│    • Escolhe veículo e valor                                │
│    • Clica "Solicitar Financiamento ao Banco"              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. CLOUD FUNCTION: enviarSolicitacaoFinanciamento()        │
│    • Valida dados do cliente (CPF, idade, etc)             │
│    • Obtém conector bancário via ConnectorRegistry          │
│    • Chama connector.submitLoanApplication()                │
│    • Salva reference ID em contract.bankApplicationId       │
│    • contract.status = 'pending_approval'                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. BANCO PROCESSA (assíncrono, minutos a horas)            │
│    • Verifica score CPF (SPC, Serasa, etc)                 │
│    • Valida idade, renda, restrições                        │
│    • Calcula taxa de juros                                  │
│    • Define limite de parcelamento                          │
│    • Retorna APPROVED ou REJECTED                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. WEBHOOK RETORNO (functions/webhooks/bank.ts)            │
│    POST /webhook/banco-parceiro                             │
│    {                                                         │
│      requestId: "abc123",                                   │
│      status: "APPROVED",                                    │
│      approvedRate: 8.5,  // % ao mês                       │
│      maxTerms: 60,                                          │
│      marginAvailable: 100000                                │
│    }                                                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. PROCESSAR WEBHOOK (validar assinatura HMAC)             │
│    • Valida assinatura do banco                             │
│    • Busca contract pelo bankApplicationId                  │
│    • Atualiza:                                              │
│      - status = 'approved' (ou 'rejected')                  │
│      - bankApprovedRate = 8.5                               │
│      - bankApprovedTerms = 60                               │
│    • Notifica seller no painel                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. SELLER VÊ APROVAÇÃO (painel atualiza)                   │
│    • Status: "Aprovado pelo banco ✓"                        │
│    • Taxa: 8.5% ao mês                                      │
│    • Max parcelas: 60 meses                                 │
│    • Botão: "Gerar contrato para assinatura"               │
│    • Cliente recebe link para assinar                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementação

### Passo 1: Criar Conector Bancário

**Arquivo:** `functions/src/connectors/banking-partner.ts`

```typescript
import {
  PaymentConnector,
  PaymentConnectorConfig,
  GeneratePaymentRequestInput,
  GeneratePaymentRequestOutput,
  ConfirmPaymentInput,
  ConfirmPaymentOutput,
  RefundInput,
  RefundOutput,
} from '@financer/shared';
import * as functions from 'firebase-functions';
import * as crypto from 'crypto';

interface LoanApplicationRequest {
  applicantCpf: string;
  applicantName: string;
  applicantAge: number;
  applicantEmail: string;
  
  loanAmount: number;        // em centavos
  vehiclePrice: number;
  downPayment: number;
  
  // Referência para webhook
  contractId: string;
}

interface LoanApplicationResponse {
  requestId: string;         // ID único do banco
  status: 'APPROVED' | 'REJECTED' | 'PENDING';
  approvedAmount?: number;
  annualRate?: number;       // taxa anual (converter pra mensal)
  maxTerms?: number;         // máximo de meses
  reason?: string;           // motivo da rejeição
}

export class BankingPartnerConnector implements PaymentConnector {
  config: PaymentConnectorConfig;
  readonly name = 'banking-partner';

  constructor(config: PaymentConnectorConfig) {
    this.config = config;
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      if (!this.config.apiKey) {
        return { valid: false, error: 'API key do banco não configurada' };
      }

      // Testar conexão
      const response = await fetch(
        `${this.getBaseUrl()}/health`,
        {
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        return {
          valid: false,
          error: `Banco retornou ${response.status}`,
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Submeter solicitação de financiamento ao banco
   * Chamado quando seller tenta financiar um contrato
   */
  async generatePaymentRequest(
    input: GeneratePaymentRequestInput
  ): Promise<GeneratePaymentRequestOutput> {
    try {
      const { installmentId, contractId, customerData } = input;

      if (!customerData) {
        throw new Error('customerData obrigatório para financiamento');
      }

      // Preparar request para o banco
      const loanRequest: LoanApplicationRequest = {
        applicantCpf: customerData.cpf || '',
        applicantName: customerData.name,
        applicantAge: 35, // TODO: obter da DB
        applicantEmail: customerData.email,
        
        loanAmount: input.amount,
        vehiclePrice: 50000, // TODO: buscar do veículo real
        downPayment: 10000,  // TODO: buscar do contrato
        
        contractId: contractId || installmentId,
      };

      // Enviar ao banco
      const bankResponse = await this.submitLoanApplication(loanRequest);

      functions.logger.info(
        `Solicitação de financiamento enviada ao banco`,
        {
          requestId: bankResponse.requestId,
          contractId,
        }
      );

      return {
        paymentId: bankResponse.requestId,
        metadata: {
          connectorTransactionId: bankResponse.requestId,
          status: bankResponse.status,
          approvedRate: bankResponse.annualRate,
          maxTerms: bankResponse.maxTerms,
          submittedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      functions.logger.error('Erro ao submeter financiamento', error);
      throw error;
    }
  }

  /**
   * Confirmar aprovação (chamado pelo webhook)
   */
  async confirmPayment(
    input: ConfirmPaymentInput
  ): Promise<ConfirmPaymentOutput> {
    try {
      const { connectorTransactionId, data } = input;

      // Webhook retornou aprovação
      const isApproved = data?.status === 'APPROVED';

      return {
        status: isApproved ? 'confirmed' : 'failed',
        connectorTransactionId,
        failureReason: data?.reason,
        metadata: {
          bankApprovedRate: data?.annualRate,
          bankMaxTerms: data?.maxTerms,
          approvedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        status: 'failed',
        failureReason: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /**
   * Validar assinatura do webhook (HMAC-SHA256)
   */
  async validateWebhookSignature(
    payload: string,
    signature: string
  ): Promise<boolean> {
    try {
      if (!this.config.webhookSecret) {
        functions.logger.warn('webhookSecret não configurado');
        return false;
      }

      const hash = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(payload)
        .digest('hex');

      return hash === signature;
    } catch (error) {
      functions.logger.error('Erro ao validar webhook', error);
      return false;
    }
  }

  /**
   * Processar webhook de retorno do banco
   */
  async processWebhook(
    payload: Record<string, any>
  ): Promise<ConfirmPaymentOutput> {
    return await this.confirmPayment({
      connectorTransactionId: payload.requestId,
      data: payload,
    });
  }

  /**
   * Cancelar solicitação (se ainda não aprovada)
   */
  async refund(input: RefundInput): Promise<RefundOutput> {
    try {
      const { connectorTransactionId } = input;

      // POST /api/loans/{requestId}/cancel
      const response = await fetch(
        `${this.getBaseUrl()}/loans/${connectorTransactionId}/cancel`,
        {
          method: 'POST',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `Banco retornou ${response.status}`,
        };
      }

      return {
        success: true,
        refundId: `cancel-${connectorTransactionId}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  // ==================== HELPERS ====================

  private async submitLoanApplication(
    request: LoanApplicationRequest
  ): Promise<LoanApplicationResponse> {
    const response = await fetch(`${this.getBaseUrl()}/loans`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Banco retornou ${response.status}`);
    }

    return await response.json();
  }

  private getBaseUrl(): string {
    // Ex: https://api-sandbox.banco.com.br/v1
    return this.config.metadata?.baseUrl || 'https://api.banco.example.com/v1';
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'X-Client-Id': this.config.metadata?.clientId || 'financer-auto',
    };
  }
}
```

### Passo 2: Registrar Conector

**Arquivo:** `functions/src/connectors-registry.ts` (adicionar)

```typescript
import { BankingPartnerConnector } from './connectors/banking-partner';

export function initializeConnectors(): void {
  // ... conectores anteriores (PIX, Stripe, etc.)

  // Registrar Banking Partner
  const bankingConfig = {
    name: 'banking-partner',
    enabled: process.env.BANKING_ENABLED === 'true',
    apiKey: process.env.BANKING_API_KEY,
    webhookSecret: process.env.BANKING_WEBHOOK_SECRET,
    metadata: {
      baseUrl: process.env.BANKING_BASE_URL,
      clientId: process.env.BANKING_CLIENT_ID,
    },
  };
  
  ConnectorRegistry.register(
    'banking-partner',
    new BankingPartnerConnector(bankingConfig)
  );

  functions.logger.info('Banking Partner conector registrado');
}
```

### Passo 3: Cloud Function para Submeter

**Arquivo:** `functions/src/loans.ts` (novo)

```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { ConnectorRegistry } from './connectors-registry';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Submeter solicitação de financiamento ao banco
 * Chamado quando: seller clica "Solicitar Financiamento"
 */
export const submitLoanApplication = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Não autenticado');
  }

  const { contractId } = request.data as { contractId: string };
  if (!contractId) {
    throw new HttpsError('invalid-argument', 'contractId obrigatório');
  }

  try {
    // 1. Buscar contrato
    const contractDoc = await db.collection('contracts').doc(contractId).get();
    if (!contractDoc.exists) {
      throw new HttpsError('not-found', 'Contrato não encontrado');
    }

    const contract = contractDoc.data() as any;

    // 2. Validar que seller é dono do contrato
    if (contract.sellerId !== callerUid) {
      throw new HttpsError('permission-denied', 'Não é o seller deste contrato');
    }

    // 3. Buscar dados do cliente
    const customerDoc = await db
      .collection('customers')
      .doc(contract.customerId)
      .get();
    if (!customerDoc.exists) {
      throw new HttpsError('not-found', 'Cliente não encontrado');
    }

    const customer = customerDoc.data() as any;

    // 4. Obter conector bancário
    const connector = ConnectorRegistry.get('banking-partner');
    if (!connector) {
      throw new HttpsError('unavailable', 'Conector bancário não disponível');
    }

    // 5. Submeter ao banco
    const result = await connector.generatePaymentRequest({
      installmentId: contractId,
      amount: contract.financedAmount * 100, // em centavos
      dueDate: contract.startDate,
      customerId: contract.customerId,
      contractId,
      customerData: {
        name: customer.name,
        email: customer.email,
        cpf: customer.cpf,
      },
    });

    // 6. Salvar reference no contrato
    const bankApplicationId = result.metadata.connectorTransactionId;
    await db.collection('contracts').doc(contractId).update({
      bankApplicationId,
      bankApplicationStatus: 'pending',
      bankApplicationSubmittedAt: new Date().toISOString(),
      status: 'pending_bank_approval', // novo status
    });

    // 7. Auditar
    await db.collection('audit').add({
      action: 'loan_application_submitted',
      contractId,
      sellerId: callerUid,
      timestamp: new Date().toISOString(),
      bankApplicationId,
    });

    return {
      success: true,
      bankApplicationId,
      message: 'Solicitação enviada. Aguarde resposta do banco (5-30 min).',
    };
  } catch (error) {
    console.error('Erro ao submeter financiamento', error);
    throw error;
  }
});
```

### Passo 4: Webhook Handler

**Arquivo:** `functions/src/webhooks/bank-approval.ts` (novo)

```typescript
import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as crypto from 'crypto';

const db = admin.firestore();

/**
 * Webhook: Banco retorna aprovação/rejeição
 * POST /webhook/bank-approval
 * Header: X-Signature: HMAC-SHA256
 */
export const handleBankApprovalWebhook = async (
  req: Request,
  res: Response
) => {
  try {
    const signature = req.headers['x-signature'] as string;
    const webhookSecret = process.env.BANKING_WEBHOOK_SECRET;

    if (!webhookSecret) {
      functions.logger.warn('BANKING_WEBHOOK_SECRET não configurado');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // 1. Validar assinatura (HMAC-SHA256)
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      functions.logger.warn('Assinatura de webhook inválida', { signature });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // 2. Extrair dados do webhook
    const { requestId, status, annualRate, maxTerms, reason } = req.body;

    functions.logger.info('Webhook recebido do banco', {
      requestId,
      status,
      annualRate,
    });

    // 3. Buscar contrato pelo bankApplicationId
    const contractSnapshot = await db
      .collection('contracts')
      .where('bankApplicationId', '==', requestId)
      .limit(1)
      .get();

    if (contractSnapshot.empty) {
      functions.logger.warn('Contrato não encontrado', { requestId });
      return res.status(404).json({ error: 'Contract not found' });
    }

    const contractDoc = contractSnapshot.docs[0];
    const contractId = contractDoc.id;

    // 4. Atualizar contrato conforme resultado
    if (status === 'APPROVED') {
      // Aprovado!
      await db.collection('contracts').doc(contractId).update({
        bankApplicationStatus: 'approved',
        bankApprovedRate: annualRate, // taxa anual
        bankApprovedTerms: maxTerms,
        status: 'approved_by_bank', // novo status
        bankApprovalDate: new Date().toISOString(),
      });

      // Calcular parcelas com taxa aprovada
      // TODO: chamar function que recalcula parcelamento

      functions.logger.info('Contrato aprovado pelo banco', {
        contractId,
        rate: annualRate,
      });

      // Notificar seller
      // TODO: enviar notificação ao seller
    } else {
      // Rejeitado
      await db.collection('contracts').doc(contractId).update({
        bankApplicationStatus: 'rejected',
        bankRejectionReason: reason,
        status: 'rejected_by_bank',
        bankRejectionDate: new Date().toISOString(),
      });

      functions.logger.info('Contrato rejeitado pelo banco', {
        contractId,
        reason,
      });

      // Notificar seller da rejeição
      // TODO: enviar notificação ao seller
    }

    // 5. Auditar
    await db.collection('audit').add({
      action: 'bank_webhook_processed',
      contractId,
      bankRequestId: requestId,
      bankStatus: status,
      timestamp: new Date().toISOString(),
    });

    // 6. Responder ao webhook (importante!)
    res.json({
      success: true,
      contractId,
      processed: true,
    });
  } catch (error) {
    functions.logger.error('Erro ao processar webhook bancário', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
```

---

## Exemplos de Bancos Reais

### Santander (Brasil)

**Documentação:** https://developer.santander.com.br

**Exemplo Request:**
```json
POST https://api-sandbox.santander.com.br/v1/loans

{
  "applicantCpf": "12345678900",
  "applicantName": "João Silva",
  "applicantAge": 35,
  "loanAmount": 50000,        // em centavos
  "vehiclePrice": 100000,
  "downPayment": 50000,
  "contractId": "fin-2024-001"
}

Header:
Authorization: Bearer sk_sandbox_abc123...
X-Client-Id: financer-auto
```

**Exemplo Response:**
```json
{
  "requestId": "santander-req-2024001",
  "status": "APPROVED",
  "approvedAmount": 50000,
  "annualRate": 8.5,          // % ao ano
  "maxTerms": 60,
  "responseCode": "00",
  "message": "Aprovado"
}
```

**Webhook:**
```json
POST https://seu-servidor.com/webhook/bank-approval

{
  "requestId": "santander-req-2024001",
  "status": "APPROVED",
  "annualRate": 8.5,
  "maxTerms": 60
}

Header:
X-Signature: abc123def456...  (HMAC-SHA256)
```

---

### Itaú (Brasil)

**Documentação:** https://www.itau.com.br/developer

**Exemplo Request:**
```json
POST https://api.itau.com.br/v2/emprestimos

{
  "cpfPessoaFisica": "12345678900",
  "nomePessoaFisica": "João Silva",
  "idadePessoaFisica": 35,
  "emailPessoaFisica": "joao@email.com",
  
  "valorEmprestimo": 5000000,     // em centavos
  "valorVeiculo": 10000000,
  "entrada": 5000000,
  "referenciaContrato": "fin-2024-001"
}

Header:
Authorization: Bearer it_sandbox_abc123...
```

**Exemplo Response:**
```json
{
  "idOperacao": "IT-2024-001",
  "statusAutorizacao": "AUTORIZADO",
  "valorAprovado": 5000000,
  "taxaMensal": 0.85,             // % ao mês
  "prazoMaximo": 60,
  "codigoRetorno": "000"
}
```

---

### Bradesco (Brasil)

**Documentação:** https://developer.bradesco.com.br

**Padrão similar aos anteriores**

---

## Webhook & Segurança

### Validação de Webhook

1. **HMAC-SHA256** — todas as respostas vêm assinadas
2. **IP Whitelist** — apenas IPs do banco podem enviar webhooks
3. **Idempotência** — mesmo webhook pode chegar múltiplas vezes
   - Use `requestId` como chave para deduplica

### Exemplo de Assinatura

```typescript
// No banco:
const payload = JSON.stringify(data);
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(payload)
  .digest('hex');
// Envia: X-Signature: abc123def456...

// No seu servidor:
const expectedSignature = crypto
  .createHmac('sha256', webhookSecret)
  .update(payload)
  .digest('hex');

if (signature !== expectedSignature) {
  // Webhook falso!
  throw new Error('Invalid signature');
}
```

### Retry Logic

Se webhook falhar, banco tenta de novo:
- Tentativa 1: imediato
- Tentativa 2: +5 minutos
- Tentativa 3: +15 minutos
- Tentativa 4: +1 hora

Seu endpoint deve ser idempotente (não quebra se chamar 2x).

---

## Tratamento de Erros

### Cliente rejeitado pelo banco

**Cenário:** CPF com restrições (SPC, Serasa)

```json
{
  "requestId": "req-2024-001",
  "status": "REJECTED",
  "reason": "Score do cliente insuficiente (Serasa: 300)"
}
```

**Ação:** Atualizar contract.status = 'rejected_by_bank', notificar seller.

### Taxa não aprovada

**Cenário:** Cliente aprovado, mas com taxa mais alta que esperada

```json
{
  "requestId": "req-2024-001",
  "status": "APPROVED",
  "annualRate": 18.5,  // esperávamos 8.5%!
  "maxTerms": 24       // máximo 24 meses
}
```

**Ação:** Seller pode aceitar taxa maior ou solicitar ao banco novamente.

### Timeout

**Cenário:** Banco demora mais de 24 horas para responder

**Ação:** Cloud Function com Cloud Task que polua status após 24h:

```typescript
// Se status ainda é 'pending_bank_approval' após 24h:
async function checkLoanStatusAfterDelay(contractId: string) {
  const connector = ConnectorRegistry.get('banking-partner');
  const { bankApplicationId } = await getContract(contractId);
  
  const status = await connector.checkStatus(bankApplicationId);
  // Processa resposta
}

// Agendado com Cloud Tasks
```

---

## Teste & Deploy

### Variáveis de Ambiente

**.env.local (dev):**
```bash
BANKING_ENABLED=true
BANKING_API_KEY=sk_sandbox_abc123...
BANKING_WEBHOOK_SECRET=webhook_secret_123...
BANKING_BASE_URL=https://api-sandbox.banco.com.br/v1
BANKING_CLIENT_ID=financer-auto
```

**Vercel / Firebase (prod):**
```bash
gcloud secrets create banking-api-key --data-file=-
gcloud secrets create banking-webhook-secret --data-file=-

# Referenciar em firebase.json:
```

### Teste Local

1. Usar sandbox do banco (sempre oferece)
2. Fazer request via Postman/curl
3. Simular webhook com `ngrok` + webhook local

```bash
# Terminal 1: Firebase emulator
firebase emulators:start

# Terminal 2: ngrok (expõe localhost)
ngrok http 5001  # Retorna: https://abc123.ngrok.io

# Terminal 3: curl para simular webhook
curl -X POST https://abc123.ngrok.io/webhook/bank-approval \
  -H "Content-Type: application/json" \
  -H "X-Signature: abc123def456..." \
  -d '{
    "requestId": "test-001",
    "status": "APPROVED",
    "annualRate": 8.5,
    "maxTerms": 60
  }'
```

### Deploy

```bash
# 1. Deploy functions
firebase deploy --only functions

# 2. Configurar secrets no Firebase
gcloud secrets create banking-api-key --data-file=- <<< "sk_live_abc..."
gcloud secrets create banking-webhook-secret --data-file=- <<< "webhook_abc..."

# 3. Validar na Vercel
vercel env pull  # puxa BANKING_* vars
npm run build
npm run start

# 4. Testar webhook
curl -X POST https://seu-site.com/webhook/bank-approval \
  -H "Content-Type: application/json" \
  -H "X-Signature: ..." \
  -d '{...}'
```

---

## Fluxo Completo no Painel

### Para o Seller

**Tela de Contratos:**
```
┌─────────────────────────────────────────┐
│ Contrato #FIN-2024-001                  │
│ ├─ Status: ⏳ Aguardando Banco...        │ ← submitLoanApplication()
│ ├─ Cliente: João Silva (CPF: 123...)    │
│ ├─ Valor: R$ 100.000                    │
│ └─ Parcelas: 60x                        │
│                                         │
│ [Cancelar Solicitação]                  │
└─────────────────────────────────────────┘

(Após 10 minutos)

┌─────────────────────────────────────────┐
│ Contrato #FIN-2024-001                  │
│ ├─ Status: ✅ Aprovado pelo Banco!       │ ← webhook processado
│ ├─ Cliente: João Silva                  │
│ ├─ Valor: R$ 100.000                    │
│ ├─ Taxa Aprovada: 8.5% ao mês           │
│ ├─ Max Parcelas: 60 meses               │
│ └─ Parcelas Calculadas: 60x R$ 1.850    │
│                                         │
│ [Gerar PDF para Assinatura]             │
└─────────────────────────────────────────┘
```

### Para o Cliente

**Email:**
```
Olá João,

Seu financiamento foi APROVADO! 🎉

Detalhes:
- Valor: R$ 100.000
- Parcelas: 60x R$ 1.850
- Taxa: 8.5% ao mês

Próximos passos:
1. Acesse o link: https://app.financer.com.br/contrato/abc123
2. Revise o contrato
3. Assine digitalmente

O vendedor entrará em contato em breve.

Att,
Financer Auto
```

---

## Resumo de Endpoints

| Método | Endpoint | Quem Chama | O que Faz |
|--------|----------|-----------|----------|
| POST | `/submitLoanApplication` | Seller (web) | Submete financiamento |
| POST | `/webhook/bank-approval` | Banco | Retorna aprovação/rejeição |
| POST | `/checkLoanStatus` | Admin | Polua status (fallback) |

---

## Próximos Passos

- [ ] Escolher banco parceiro (Santander, Itaú, etc.)
- [ ] Obter documentação e credenciais de teste
- [ ] Implementar conector específico do banco
- [ ] Testar com dados de sandbox
- [ ] Integrar webhook handler (ngrok para teste local)
- [ ] Deploy em staging (teste com volume baixo)
- [ ] Deploy em produção
- [ ] Monitorar logs de erros (Sentry, Firebase Logs)

---

**Última atualização:** 2024-08-22  
**Status:** Pronto para implementação
