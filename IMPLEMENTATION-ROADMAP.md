# Roadmap de Implementação — Financiamento Bancário + PIX

**Status:** 📋 Planejado (começar próximo mês)  
**Criado em:** 2024-08-22  
**Revisão:** Próximo mês

---

## 🎯 Visão Geral

Este documento mapeia **exatamente o que fazer** quando você tiver tempo de começar a implementação de:
1. **Financiamento Bancário** (Santander + Itaú)
2. **PIX Automático**

Tudo já está **documentado, templated e pronto**. Basta seguir este guia passo a passo.

---

## 📅 Fase 0: Preparação (Esta Semana)

### ✅ Checklist

- [ ] Enviar e-mails pra 3 bancos (Santander, Itaú, Bradesco)
  - Use templates em `BANK-SANDBOX-REQUEST.md`
  - Preencha: CNPJ, email, telefone, dados técnicos

- [ ] Ler documentações:
  - `README.md` — stack completo
  - `FEATURES.md` — roadmap pagamentos
  - `BANKING-INTEGRATION.md` — guia técnico completo

- [ ] Preparar ambiente local:
  ```bash
  npm install
  firebase emulators:start  # deixar rodando em background
  ```

---

## 🚀 Fase 1: Implementação PIX (Semana 1)

**PIX é mais rápido** — implementar primeiro enquanto aguarda bancos.

### Passo 1.1: Escolher TSP (Itaú, Bradesco ou C6)

```
Opção A: Dict API do Itaú
- Contacte: developer@itau.com.br
- Pede: Credenciais Dict API

Opção B: Bradesco PIX
- Contacte: desenvolvedores@bradesco.com.br
- Pede: Credenciais PIX API

Opção C: C6 Bank (mais rápido, startup-friendly)
- Contacte: tech@c6bank.com.br
- Pede: PIX Receiver credentials
```

### Passo 1.2: Arquivo Modelo

Todos os template estão prontos:
- 📄 `functions/src/connectors/pix-receiver.example.ts` — copie e adapte
- 📄 `shared/src/connectors/base.connector.ts` — interface base

### Passo 1.3: Implementação (2-3 dias)

1. **Copiar template:**
```bash
cp functions/src/connectors/pix-receiver.example.ts \
   functions/src/connectors/pix-receiver.ts
```

2. **Adaptar com API real da TSP:**
   - Substituir URLs de sandbox
   - Adaptar headers/auth
   - Testar `validate()` com Health Check

3. **Registrar no ConnectorRegistry:**
```typescript
// functions/src/connectors-registry.ts
import { PixReceiverConnector } from './connectors/pix-receiver';

export function initializeConnectors(): void {
  const pixConfig = {
    name: 'pix',
    enabled: process.env.PIX_ENABLED === 'true',
    apiKey: process.env.PIX_API_KEY,
    webhookSecret: process.env.PIX_WEBHOOK_SECRET,
    metadata: { baseUrl: process.env.PIX_BASE_URL }
  };
  
  ConnectorRegistry.register('pix', new PixReceiverConnector(pixConfig));
}
```

4. **Variáveis de Ambiente:**
```bash
# .env.local
PIX_ENABLED=true
PIX_API_KEY=sua_api_key_aqui
PIX_WEBHOOK_SECRET=sua_webhook_secret
PIX_BASE_URL=https://api-sandbox.tsp.com.br/v1
```

5. **Testar localmente com ngrok:**
```bash
# Terminal 1: Firebase emulator
firebase emulators:start

# Terminal 2: ngrok (expõe localhost)
ngrok http 5001
# Retorna: https://abc123.ngrok.io

# Terminal 3: Curl para simular webhook
curl -X POST https://abc123.ngrok.io/webhook/pix-payment \
  -H "Content-Type: application/json" \
  -H "X-Signature: abc123def456..." \
  -d '{
    "txId": "test-001",
    "status": "PAID",
    "endToEndId": "E12345...",
    "amount": 10000
  }'
```

6. **Testar fluxo no painel:**
   - Criar contrato
   - Gerar PIX QR code
   - Escanear com celular (teste)
   - Simular pagamento (webhook)
   - Verificar installment.status = 'paid'

---

## 🏦 Fase 2: Implementação Financiamento Bancário (Semana 2-3)

**Começa quando** receber credenciais dos bancos (~5-7 dias após enviar e-mail).

### Passo 2.1: Preparar Conector Genérico

**Arquivo:** `functions/src/connectors/banking-partner.ts`

Todo o código já está em `BANKING-INTEGRATION.md` — basta copiar.

```typescript
// functions/src/connectors/banking-partner.ts
import { BankingPartnerConnector } from './connectors/banking-partner';

// Registrar em ConnectorRegistry
ConnectorRegistry.register(
  'banking-partner',
  new BankingPartnerConnector(bankingConfig)
);
```

### Passo 2.2: Adaptar para Banco Real

Recebeu credenciais? Adapte:

1. **Base URL:**
```typescript
// ANTES (template)
private getBaseUrl(): string {
  return this.config.metadata?.baseUrl || 'https://api.banco.example.com/v1';
}

// DEPOIS (real)
private getBaseUrl(): string {
  if (this.config.metadata?.provider === 'santander') {
    return 'https://api-sandbox.santander.com.br/v1';
  } else if (this.config.metadata?.provider === 'itau') {
    return 'https://api.itau.com.br/v2';
  }
}
```

2. **Headers/Auth:**
```typescript
private getHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Santander usa Bearer Token
  if (this.config.metadata?.provider === 'santander') {
    headers['Authorization'] = `Bearer ${this.config.apiKey}`;
  }
  // Itaú usa Basic Auth
  else if (this.config.metadata?.provider === 'itau') {
    const creds = Buffer.from(`${this.config.apiKey}:${this.config.metadata?.secret}`).toString('base64');
    headers['Authorization'] = `Basic ${creds}`;
  }

  return headers;
}
```

3. **Payload (adaptar nomes de campos):**
```typescript
// Template (genérico)
const request = {
  applicantCpf: cpf,
  loanAmount: amount,
};

// Santander real
const request = {
  applicantCpf: cpf,
  loanAmount: amount,
  // ... rest
};

// Itaú real (pode ter nomes diferentes!)
const request = {
  cpfPessoaFisica: cpf,
  valorEmprestimo: amount,
  // ... rest
};
```

### Passo 2.3: Implementar Webhook Handler

**Arquivo:** `functions/src/webhooks/bank-approval.ts`

Código completo está em `BANKING-INTEGRATION.md` — copie e cole.

**Resumo do que faz:**
1. Valida assinatura HMAC-SHA256
2. Busca contrato pelo `bankApplicationId`
3. Atualiza status (approved / rejected)
4. Notifica seller

### Passo 2.4: Cloud Function para Submeter

**Arquivo:** `functions/src/loans.ts`

Código está em `BANKING-INTEGRATION.md` — pronto pra usar.

### Passo 2.5: Testar End-to-End

```bash
# 1. Criar contrato no painel
# 2. Clicar "Solicitar Financiamento"
# 3. Ver status: "Aguardando Banco..."
# 4. Simular webhook (ngrok + curl)
# 5. Ver status mudar: "✅ Aprovado"
```

---

## 🎛️ Fase 3: Admin Panel (Semana 3)

**Criar UI para gerenciar conectores.**

### Passo 3.1: Nova Página

```
web/app/(panel)/configuracoes/pagamentos/page.tsx
```

### Passo 3.2: O que Mostrar

```
┌─────────────────────────────────┐
│ Configurações de Pagamentos     │
├─────────────────────────────────┤
│                                 │
│ 🟡 PIX Receiver                 │
│ Status: ✅ Ativo                │
│ API Key: sk_sandbox_abc...      │
│ [Testar Conexão]                │
│                                 │
│ 🏦 Santander                    │
│ Status: ✅ Ativo                │
│ API Key: sk_sandbox_xyz...      │
│ [Testar Conexão]                │
│                                 │
│ 🏦 Itaú                         │
│ Status: ⏳ Desabilitado         │
│ API Key: [adicionar]            │
│ [Ativar] [Configurar]           │
│                                 │
└─────────────────────────────────┘
```

### Passo 3.3: Funcionalidade

- [ ] Listar conectores
- [ ] Toggle ativar/desativar
- [ ] Editar API key (com masking)
- [ ] Testar conexão (`connector.validate()`)
- [ ] Ver logs de transações

---

## 📊 Fase 4: QA com Lojista (Semana 4)

### Checklist de Teste

**PIX:**
- [ ] Criar contrato
- [ ] Gerar QR code PIX
- [ ] Escanear (celular)
- [ ] Confirmar pagamento
- [ ] Ver installment.status = 'paid'

**Financiamento Bancário:**
- [ ] Criar contrato
- [ ] Clicar "Solicitar Financiamento"
- [ ] Ver status "Aguardando Banco..."
- [ ] Receber webhook (simular)
- [ ] Ver status "Aprovado"
- [ ] Gerar PDF para assinatura
- [ ] Cliente assina digitalmente

**Rejeição:**
- [ ] Simular rejeição do banco
- [ ] Ver status "Rejeitado"
- [ ] Lojista consegue resubmeter?

---

## 📋 Arquivos Importantes (Referência Rápida)

**Documentação:**
- 📄 `README.md` — stack & setup
- 📄 `FEATURES.md` — roadmap completo
- 📄 `BANKING-INTEGRATION.md` — guia técnico (código pronto)
- 📄 `BANK-SANDBOX-REQUEST.md` — templates de e-mail
- 📄 `IMPLEMENTATION-ROADMAP.md` — este arquivo

**Código (Templates):**
- 📄 `shared/src/connectors/base.connector.ts` — interface
- 📄 `functions/src/connectors-registry.ts` — registry
- 📄 `functions/src/connectors/pix-receiver.example.ts` — PIX
- 📄 `BANKING-INTEGRATION.md` — BankingPartnerConnector (código)

**Git Commits Relacionados:**
```
c02402c docs: add project documentation and payment connector architecture
8429d8d perf: optimize firestore.rules
476826d docs: add complete banking integration guide
96e652a docs: add bank sandbox request email templates
```

---

## ⚡ Quick Start Quando Voltar

**Dia 1:**
```bash
cd Financer-auto
git checkout fix/veiculo-detalhe-vendedor-erros
cat IMPLEMENTATION-ROADMAP.md  # este arquivo
cat BANKING-INTEGRATION.md     # código pronto
```

**Dia 2-3:**
```bash
# Copiar templates
cp functions/src/connectors/pix-receiver.example.ts \
   functions/src/connectors/pix-receiver.ts

# Adaptar com credenciais reais
# (no `.env.local`)

# Testar
firebase emulators:start
npm run web
```

**Dia 4-5:**
```bash
# Ngrok + webhook testing
# Criar Cloud Functions
# Deploy
```

---

## 🔐 Segurança — Não Esquecer

- [ ] **NUNCA** commitar `.env.local`
- [ ] **SEMPRE** usar Firebase Secrets em produção
- [ ] **Validar** assinatura de webhook (HMAC)
- [ ] **Isolar** dados da loja (Firestore Rules)
- [ ] **Logar** tudo em Sentry (sem dados sensíveis)

---

## 🎯 Success Criteria

Quando terminar, você terá:

✅ **PIX Funcional:**
- QR code gerado dinamicamente
- Webhook retorna confirmação
- Installment marcada como paga automaticamente

✅ **Financiamento Bancário:**
- Seller submete contrato ao banco
- Banco aprova/rejeita via webhook
- Contract.status = 'approved_by_bank'
- Taxa e parcelas recalculadas

✅ **Admin Panel:**
- Ver status de 2-3 conectores
- Testar conexão
- Logs de transações

✅ **Documentado:**
- README atualizado
- Guia de deployment
- Como onboard novo banco

---

## 📞 Contatos Importantes

```
Santander Developer:
- Email: developer-onboarding@santander.com.br
- Portal: https://developer.santander.com.br

Itaú Developer:
- Email: developer@itau.com.br
- Portal: https://www.itau.com.br/developer

Bradesco Developer:
- Email: desenvolvedores@bradesco.com.br
- Portal: https://developer.bradesco.com.br

PIX (Dict API):
- BC (Banco Central): https://www.bcb.gov.br/pix
```

---

## 📝 Notas Finais

**Estrutura já está 80% pronta:**
- ✅ Interfaces definidas
- ✅ Registry implementado
- ✅ Templates criados
- ✅ Documentação completa
- ✅ Exemplos reais de bancos
- ⏳ Faltam: adaptar com credenciais reais + testar

**Tempo esperado:** 1-2 semanas (se tiver credenciais)

**Blocker:** Resposta dos bancos com sandbox (2-5 dias)

---

**Última atualização:** 2024-08-22  
**Próxima revisão:** Quando começar a implementar (próximo mês)  
**Status:** 🟢 Pronto para começar
