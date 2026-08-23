# Template de E-mail — Solicitar Sandbox aos Bancos

## 📧 Modelo 1: Santander

**Para:** developer-onboarding@santander.com.br  
**Assunto:** Solicitar Credenciais de Sandbox — Integração de Financiamento Automático

---

Olá,

Meu nome é **[SEU NOME]** e sou **[CARGO]** na **Financer Auto**.

Somos uma fintech especializada em **automação de financiamento de veículos**. Desenvolvemos uma plataforma que conecta concessionárias de carros com soluções de crédito automático.

**Sobre o Projeto:**
- Plataforma: Web + Mobile (Next.js + React Native)
- Mercado: Brasil
- Objetivo: Integrar APIs de financiamento de bancos para aprovação automática de contratos

**O que Precisamos:**
Gostaríamos de solicitar acesso ao **sandbox/ambiente de testes** da API de empréstimos do Santander para:
- Submeter solicitações de financiamento de clientes
- Receber aprovações/rejeições via webhook
- Testar fluxo end-to-end com dados fictícios

**Informações Técnicas:**
- Linguagem: TypeScript/Node.js
- Framework: Firebase Cloud Functions
- Autenticação: OAuth 2.0 / Bearer Token
- Webhook: HTTPS com validação HMAC-SHA256
- Volume esperado: ~100 requisições/dia em teste

**Cronograma:**
- Fase de testes: Próximas 2-3 semanas
- Implantação: Mês que vem
- Produção: Após sucesso em testes

Poderiam nos fornecer:
1. Credenciais de sandbox (API Key, Client ID, Secret)
2. Documentação da API de empréstimos
3. Exemplo de payload de webhook
4. Contato técnico para dúvidas

Segue em anexo nosso RG e CNPJ para validação.

Fico no aguardo!

Att,  
**[SEU NOME]**  
**[CARGO]**  
**Financer Auto**  
📧 [SEU EMAIL]  
📱 [SEU TELEFONE]

---

## 📧 Modelo 2: Itaú

**Para:** developer@itau.com.br ou suporte@desenvolvedor.itau.com.br  
**Assunto:** Sandbox API Empréstimos — Financer Auto (Fintech)

---

Olá Equipe Itaú Developer,

Somos a **Financer Auto**, uma fintech que desenvolve soluções de **financiamento automático de veículos** para o mercado brasileiro.

**Resumo do Projeto:**
Estamos desenvolvendo uma plataforma que automatiza o processo de aprovação de financiamentos de carros. Nosso objetivo é integrar com instituições bancárias para aprovar contratos em tempo real, sem burocracia.

**Solicitação:**
Gostaríamos de **solicitar credenciais de sandbox** para testar a integração com a API de empréstimos do Itaú.

**Requisitos Técnicos:**
- Stack: Node.js + Firebase Cloud Functions
- Integração: REST API + Webhooks
- Segurança: OAuth 2.0, HMAC-SHA256
- Volume: ~100 requisições/dia (teste)

**Casos de Uso:**
1. Submeter solicitação de financiamento (CPF, valor, prazo)
2. Receber aprovação/rejeição (score, taxa, limite)
3. Receber notificações via webhook

**Timeline:**
- Testes: Semanas 1-3
- Produção: Semana 4+

Podem fornecer:
- [ ] Credenciais de sandbox
- [ ] Documentação API
- [ ] Exemplos de webhook
- [ ] Contato técnico

Obrigado!

Att,  
**[SEU NOME]**  
**Financer Auto**  
📧 [SEU EMAIL]  
📱 [SEU TELEFONE]  
🌐 [SITE OU GITHUB]

---

## 📧 Modelo 3: Bradesco

**Para:** desenvolvedores@bradesco.com.br  
**Assunto:** Solicitação Sandbox — API de Empréstimos (Fintech)

---

Prezados,

Somos a **Financer Auto**, fintech de **aprovação automática de financiamentos de veículos**.

Queremos integrar o Bradesco como parceiro de crédito para nossos clientes.

**Solicitar:**
- Acesso ao sandbox da API de empréstimos
- API Key + Secret
- Webhook credentials

**Caso de Uso:**
Automação: Contrato → Banco → Aprovação → Contrato Pronto

**Tech Stack:**
- Node.js (Firebase Cloud Functions)
- REST + Webhooks
- HMAC-SHA256

**Volume:** ~100 req/dia (teste), depois ~1k req/dia (prod)

Quando temos credenciais disponíveis?

Att,  
**[SEU NOME]**  
**Financer Auto**  
[CONTATOS]

---

## 📝 Informações Comuns Para Todos os E-mails

Quando pedir credenciais, tenha em mãos:

### Dados da Empresa:
```
CNPJ: [SEU CNPJ]
Razão Social: Financer Auto
Endereço: [ENDEREÇO COMPLETO]
Telefone: [TELEFONE]
Website: [SITE, SE TIVER]
```

### Dados de Contato (Desenvolvedor):
```
Nome: [SEU NOME]
Email: [SEU EMAIL]
Telefone: [SEU TELEFONE]
Cargo: [EX: CTO, Tech Lead]
```

### Dados Técnicos Para Retorno:
```
Webhook URL (durante testes):
https://seu-dominio.com/webhook/banco-approval

Ambiente:
- Sandbox: https://api-sandbox.seu-dominio.com
- Produção: https://api.seu-dominio.com

Protocolo de Segurança:
- HMAC-SHA256 na assinatura de webhook
- Bearer Token na autenticação
- Rate limit: até 10 req/segundo
```

---

## ✅ Checklist — Após Receber Credenciais

Quando banco responder com sandbox, você precisa:

- [ ] Guardar em `.env.local` (NUNCA commitar!)
```bash
BANKING_API_KEY=sk_sandbox_abc123...
BANKING_WEBHOOK_SECRET=webhook_secret_xyz...
BANKING_BASE_URL=https://api-sandbox.banco.com.br/v1
```

- [ ] Salvar em Firebase Secrets (produção)
```bash
gcloud secrets create banking-api-key --data-file=- <<< "sk_live_..."
```

- [ ] Testar com ngrok
```bash
ngrok http 5001
# Usar https://abc123.ngrok.io/webhook/bank-approval
```

- [ ] Implementar conector (adaptar exemplo)
- [ ] Testar webhook localmente
- [ ] Documenta tudo no README

---

## 🎯 Timeline Esperada

| Banco | E-mail Enviado | Resposta Esperada | Sandbox Ativo |
|-------|---|---|---|
| Santander | Dia 1 | 2-5 dias | Dia 8 |
| Itaú | Dia 1 | 3-7 dias | Dia 10 |
| Bradesco | Dia 1 | 2-5 dias | Dia 8 |

---

## 💡 Dicas

1. **Enviar para múltiplos contatos** — aumente chances de resposta
2. **Ligar depois** — "Oi, enviei e-mail... vocês receberam?"
3. **Ser específico** — não peça "acesso ao banco", peça "sandbox da API de empréstimos"
4. **Ter tudo pronto** — CNPJ, documentação técnica, timeline
5. **Follow-up** — se não responder em 3 dias, reenvie

---

## 🔗 Links Úteis

- **Santander Developer:** https://developer.santander.com.br
- **Itaú Developer:** https://www.itau.com.br/developer
- **Bradesco Developer:** https://developer.bradesco.com.br

---

**Última atualização:** 2024-08-22  
**Status:** Pronto pra enviar
