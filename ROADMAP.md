# Financer Auto — Roadmap Geral

**Status:** 📋 Documento de planejamento/debate — não é especificação fechada.
**Regra de ouro:** antes de implementar qualquer item, checar o estado real do projeto e desenhar o modelo técnico em cima do que já existe (não do zero). A seção 0 abaixo é exatamente essa checagem, feita lendo o código-fonte em 2026-08-23.

---

## 0. Checkpoint real do estado atual (feito lendo o código)

Antes de qualquer item da seção 3 ("Módulos de uma revenda 100% funcional"), aqui está o que **já existe de verdade** vs. o que falta — pra não reconstruir o que já está pronto nem subestimar o que falta.

| Módulo | Status | O que já existe | O que falta |
|--------|--------|------------------|-------------|
| **CRM / Funil** | 🟡 Parcial | `leads/page.tsx` — lista de leads com status simples (`new/contacted/negotiating/converted/lost`), botão "Converter em Cliente" | Sem pipeline/kanban visual, sem estágios de simulação→proposta→aprovado→contrato, sem histórico de interação, sem `sellerId` em lead (atribuição de vendedor) |
| **Contrato + assinatura** | 🟡 Parcial | Geração de PDF real (`lib/pdf/gerarContrato.ts` + `lib/contractTemplate.ts`, cláusulas 1-9). Assinatura eletrônica **simples** (nome+CPF+timestamp, base legal MP 2200-2/2001) via `assinarContratoFn`. Checklist de docs do comprador funcional (`minha-area/documentos`, CPF/RG/residência/renda com aprovação) | **Sem provedor terceirizado de assinatura** (D4Sign/Clicksign/Zapsign) — é confirmação interna, não assinatura com validade jurídica reforçada. **Sem controle de documentação do veículo** (CRLV, laudo de vistoria, transferência) — cláusula do contrato só cita isso em texto |
| **Fluxo de caixa** | 🟡 Parcial | `financeiro/page.tsx` (despesas por categoria) + `recebimentos/page.tsx` (846 linhas — cobrança manual, valor atualizado com juros/multa, aprovação de comprovante) + `lib/receitas.ts` (soma pagamentos + entradas) | **Sem DRE** (zero ocorrências no código). **Sem conciliação com nenhum gateway** — tudo é foto de comprovante + baixa manual |
| **Comissionamento** | 🟡 Parcial | `comissoes/page.tsx` — comissão de vendedor interno (`sellerId`, `percentage`, `pending/paid`) | Zero suporte a comissão de correspondente bancário/hub (sem `partnerId`/`bankId`) |
| **Pós-venda** | 🟡 Parcial | `oficinas/page.tsx` (CRUD de oficinas parceiras) + garantia e revisão **reais** (`Warranty`, `Revision`, `Workshop` em `@financer-auto/shared`, tela `minha-area/garantia`) | Sem reengajamento automatizado (campanhas, lembretes proativos de revisão) |
| **Gestão de acesso** | 🟡 Parcial | 3 roles reais: `admin`, `seller`, `customer` (+ `prospect` transitório) | Sem role "financeiro" separada — quem acessa `/financeiro`, `/recebimentos`, `/comissoes` é qualquer admin/seller |
| **PIX / Asaas** | 🔴 Não existe | Só um arquivo `.example.ts` de referência (`connectors/pix-receiver.example.ts`), nunca registrado. `connectors-registry.ts` tem a infraestrutura de plugin pronta, mas vazia. Zero menção a "asaas" no código | Tudo — hoje é 100% manual (foto de comprovante) |
| **Financiamento bancário** | 🔴 Não existe | Nada — nem BV Open, nem Open Finance, nem qualquer API de banco. O que existe é só o wizard interno de financiamento **direto** entre a revenda e o cliente (contrato cláusula 7.1: "financiamento direto entre as partes, não envolvendo instituição financeira terceira") | Tudo |

**Leitura prática:** os módulos "fáceis" (cadastro, contrato, doc do comprador, garantia) já têm base sólida — dá pra evoluir em cima. Os dois itens de maior esforço puro de integração externa (PIX/Asaas e banco) partem literalmente de zero código funcional, só têm a arquitetura de conector pronta esperando ser preenchida (ver [`BANKING-INTEGRATION.md`](./BANKING-INTEGRATION.md) e [`FEATURES.md`](./FEATURES.md), que já documentam essa arquitetura em detalhe).

---

## Contexto — como funciona o financiamento de veículo

Loja recolhe documentos do comprador e envia proposta pro banco financiar o veículo. Não existe um "molde pronto" universal — cada banco tem seu próprio portal/esteira de crédito de lojista, mas os campos entre eles são parecidos.

### Campos essenciais da proposta

- **Comprador:** nome completo, CPF, RG, data nascimento, estado civil, nome da mãe, endereço, telefone, email, profissão
- **Renda:** valor, tipo (CLT/autônomo/empresário), comprovante
- **Veículo:** placa, chassi, Renavam, ano/modelo, cor, valor de venda (referência FIPE)
- **Negociação:** entrada, valor financiado, parcelas, taxa

> Comparado ao cadastro atual (`Customer`), faltam: estado civil, nome da mãe, profissão. Comparado ao `Vehicle`, falta Renavam e referência FIPE. Vale mapear isso quando o piloto BV Open sair do papel — são campos novos no schema.

---

## 1. Financiamento — BV Open (piloto)

**Objetivo:** validar tecnicamente o fluxo de proposta de financiamento com um banco real via API antes de negociar hub multibanco.
**Ambiente:** sandbox BV Open (`developers-sandbox.bvopen.com.br`)

### Checklist

- [ ] Criar conta de desenvolvedor no BV Open
- [ ] Mapear fluxo de auth (OAuth2 / client credentials)
- [ ] Endpoint de simulação de financiamento
- [ ] Endpoint de envio de proposta
- [ ] Endpoint de consulta de status/retorno
- [ ] Testar com dados fictícios de sandbox

**Nota técnica:** o conector `BankingPartnerConnector` documentado em [`BANKING-INTEGRATION.md`](./BANKING-INTEGRATION.md) já foi desenhado genérico o suficiente pra encaixar BV Open como primeiro provedor real — a estrutura de `generatePaymentRequest`/`confirmPayment`/webhook já existe, só falta a implementação específica da API do BV Open no lugar do template.

### Expansão multibanco (fase 2)

Homologar banco a banco é caro (30-80h por instituição). Caminho mais realista: integrar com um agregador/hub já homologado como correspondente bancário.

- **Autoconf** — simulador multibanco focado em revenda de veículos, envia proposta pra vários bancos de uma vez. Contatar pra saber se oferece API/white-label.
- **QI Tech** — infraestrutura de crédito veicular "one-stop-shop" com jornada personalizável por marca própria. Avaliar como parceiro estratégico.

**Meta:** 6-7 bancos disponíveis de cara pro lojista testar, sem negociar contrato individual com cada um. Bancos específicos que a loja quiser depois viram implementação sob demanda.

---

## 2. Pix — Asaas (conta já aberta)

**Modelo:** subcontas Asaas (Multi-Empresas / marketplace)
- Conta master (Conect Web) cria uma subconta por loja cliente
- Pix recebido cai direto na subconta da loja
- Split automático configurável pra comissão da plataforma
- Evita a Conect Web virar intermediária financeira de fato

### Checklist

- [ ] Estudar doc da API de subcontas do Asaas
- [ ] Mapear criação de subconta via API (onboarding do lojista)
- [ ] Mapear split de pagamento
- [ ] Testar cobrança Pix + webhook de confirmação em subconta de teste

**Nota técnica:** hoje o recebimento é 100% manual (cliente sobe foto do comprovante em `PaymentRequest`, operador aprova em `recebimentos/page.tsx`). Quando essa integração entrar, o fluxo de aprovação manual não desaparece — vira fallback pra quando o Pix automático falhar ou não for usado, mesmo padrão do `pix-receiver.example.ts` já esboçado.

---

## 3. Módulos de uma revenda 100% funcional

Já existentes no Financer Auto: **cadastro de veículos, cadastro de clientes** (base sólida, não precisa retrabalho).

### CRM (próximo módulo, prioridade)

Conecta o que já existe (veículo + cliente) com acompanhamento de negociação. **Estado atual:** `leads/page.tsx` é só uma lista com status simples — o funil de verdade não existe ainda.

- [ ] Funil/pipeline (lead → simulação → proposta no banco → aprovado → contrato → vendido)
- [ ] Histórico de interação por cliente
- [ ] Vínculo cliente ↔ veículo(s) de interesse
- [ ] Follow-up/lembrete (possível automação WhatsApp reaproveitando lógica do Nuvem Rush)
- [ ] Atribuição de vendedor por lead (campo `sellerId` não existe hoje em `Lead`)

### Documentação e contrato

**Estado atual:** geração de PDF e assinatura eletrônica simples já funcionam; falta reforçar a assinatura e cobrir documentação do veículo.

- [x] Geração de contrato de compra e venda — já existe (`lib/pdf/gerarContrato.ts`, `lib/contractTemplate.ts`)
- [x] Checklist de docs do comprador — já existe (`minha-area/documentos`)
- [ ] Assinatura eletrônica com provedor terceirizado (avaliar D4Sign, Clicksign, Zapsign) — hoje é confirmação interna (nome+CPF), não assinatura com provedor
- [ ] Documentação do veículo (CRLV, laudo de vistoria, transferência) — não existe nenhuma tela/campo pra isso hoje

### Fluxo de caixa da loja

**Estado atual:** despesas, receitas e cobrança manual já funcionam bem; falta DRE e qualquer conciliação automática.

- [x] Entradas (venda à vista, entrada de financiamento) — já existe via `lib/receitas.ts`
- [x] Saídas (compra de veículo, manutenção/preparação) — já existe via `financeiro/page.tsx`
- [ ] Comissões recebidas dos bancos — não existe (depende do módulo de comissionamento de correspondente, ver abaixo)
- [ ] DRE simplificado por período — não existe (zero ocorrências no código)
- [ ] Conciliação automática com Pix/Asaas via webhook — depende do item 2 (Pix Asaas) sair do papel

### Comissionamento

**Estado atual:** comissão de vendedor interno já funciona; comissão de correspondente/hub não existe.

- [x] Vendedor interno ganha % por venda — já existe (`comissoes/page.tsx`)
- [ ] Comissão de correspondente/hub de financiamento no mesmo fluxo — não existe nenhum campo pra isso hoje (precisa de `partnerId`/`bankId` no modelo de dados)

### Pós-venda

**Estado atual:** garantia e histórico de manutenção já são reais; falta reengajamento automatizado.

- [x] Garantia (se oferecida) — já existe (`Warranty` em `@financer-auto/shared`, tela `minha-area/garantia`)
- [x] Histórico de manutenção — já existe (`Revision`, vínculo com `Workshop`)
- [ ] Reengajamento do cliente — não existe nenhuma automação de campanha/lembrete proativo

### Gestão de acesso

**Estado atual:** 3 roles reais (`admin`, `seller`, `customer`), sem separação de "financeiro".

- [ ] Revisar perfis: hoje `/financeiro`, `/recebimentos`, `/comissoes` são acessíveis por qualquer admin ou seller — decidir se "financeiro" precisa virar role própria com Firestore Rules dedicadas, ou se a separação atual (admin vê tudo, seller vê o seu) já é suficiente

### Publicação externa (visibilidade, fase futura)

- [ ] Integração com portais tipo OLX Autos, Webmotors, Icarros — não iniciado, fase futura

---

## Ordem de execução sugerida

1. [ ] Sandbox BV Open → provar conceito técnico de proposta de financiamento
2. [ ] Asaas subcontas → estrutura de recebimento Pix por loja
3. [x] Checkpoint real do estado atual do Financer Auto — feito nesta rodada (seção 0 acima)
4. [ ] CRM → em cima do cadastro de veículo/cliente já existente
5. [ ] Contato comercial com Autoconf / QI Tech → avaliar parceria multibanco
6. [ ] Documentação/contrato (assinatura terceirizada + doc do veículo), fluxo de caixa (DRE), comissionamento (correspondente), pós-venda (reengajamento)

---

## Documentos relacionados

- [`README.md`](./README.md) — stack técnico, setup, estrutura do projeto
- [`FEATURES.md`](./FEATURES.md) — arquitetura de conectores de pagamento (PIX, Stripe, financiamento bancário)
- [`BANKING-INTEGRATION.md`](./BANKING-INTEGRATION.md) — guia técnico de integração bancária (aplicável ao piloto BV Open)
- [`BANK-SANDBOX-REQUEST.md`](./BANK-SANDBOX-REQUEST.md) — templates de e-mail pra solicitar sandbox a bancos
- [`IMPLEMENTATION-ROADMAP.md`](./IMPLEMENTATION-ROADMAP.md) — roadmap de implementação PIX + financiamento (fases 1-4)
- [`AUDIT.md`](./AUDIT.md) — auditoria de segurança, código e UI/UX do sistema atual

---

**Última atualização:** 2026-08-23
**Próxima revisão:** ao decidir qual passo da "Ordem de execução sugerida" começar
