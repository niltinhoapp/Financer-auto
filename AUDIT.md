# Auditoria Completa do Sistema — Financer Auto

**Data:** 2026-08-22
**Escopo:** Segurança, código/arquitetura, performance, acessibilidade, UI/UX, facilidade de uso
**Metodologia:** Leitura de código-fonte, `npm audit`, `tsc --noEmit`, `eslint`, análise de `firestore.rules`/`storage.rules`

---

## 🎯 Resumo Executivo

| Área | Críticos | Altos | Médios | Baixos |
|------|----------|-------|--------|--------|
| Segurança | 1 | 2 | 3 | 2 |
| Código/Arquitetura | 0 | 3 | 5 | 3 |
| UI/UX & Acessibilidade | 3 | 7 | 4 | — |

**Achado mais urgente:** uma Cloud Function (`registerPayment`) permite que **qualquer usuário autenticado — inclusive um cliente — marque parcelas de qualquer contrato como pagas**, sem checar role nem posse do contrato. Corrigir antes de qualquer outra coisa.

---

## 🔴 1. Segurança & Vulnerabilidades

### 🔴 CRÍTICO

**1.1 — ✅ CORRIGIDO — `functions/src/index.ts:338-399` — `registerPayment` sem verificação de role**

A função só checa `if (!request.auth)`, nunca valida `role`. Como usa Admin SDK (ignora `firestore.rules`), **qualquer usuário autenticado — inclusive um `customer`** — pode chamar `registerPayment({contractId, installmentId, amount, method})` diretamente via SDK, para qualquer contrato/parcela, mesmo sem ser o dono.

**Exploração concreta:** um cliente mal-intencionado pode "quitar" o próprio financiamento sem pagar, ou adulterar parcelas de outro cliente — marcando-as como `paid`, gravando registros falsos em `payments`, e se todas ficarem pagas, mudando `contract.status` para `settled`.

**Correção aplicada (commit `91248dd`):** agora exige `role === 'admin' || role === 'seller'`, valida que o seller é dono do contrato (`contract.sellerId === callerUid`), valida campos obrigatórios, rejeita parcela já paga, e registra em `audit/`.

---

### 🟠 ALTO

**1.2 — `functions/src/index.ts:101` — senha temporária previsível/curta**

`tempPassword = "fin-" + (1000..9999) + "-" + 4 caracteres base36`. Formato fixo e público (`fin-XXXX-yyyy`), ~9.000 × ~1,68M combinações. Não há rate-limit visível no login nem CAPTCHA (`web/app/login/page.tsx`) — um atacante que saiba o e-mail de um cliente recém-cadastrado tem uma janela de força-bruta antes da troca obrigatória de senha (`mustChangePassword`).

**Correção:** aumentar entropia (12+ caracteres aleatórios), adicionar rate-limiting no login (Firebase App Check ou Cloud Function de controle de tentativas).

**1.3 — Dependências vulneráveis (`npm audit`)**

- `next` — múltiplas vulnerabilidades **High**: SSRF em Server Actions/rewrites, exposição não autenticada de endpoints internos de Server Functions, DoS via Image Optimization/SVG. Versão instalada está fora do range corrigido.
- `postcss` (via next) — XSS em `</style>` não escapado, leitura arbitrária de arquivo via `sourceMappingURL`.
- `js-yaml`, `fast-uri`, `brace-expansion`, `nanoid` — DoS/CPU quadrático (High).
- `form-data` — CRLF injection (High).

**Correção:** rodar `npm audit fix --force` em raiz e `web/`, testar regressões, e travar isso no CI (item 2.1 abaixo).

---

### 🟡 MÉDIO

**1.4 — `firestore.rules:207` — `audit/{logId}` criável por qualquer autenticado**

`allow create: if isAuthenticated();` sem checar o autor real. Qualquer cliente autenticado pode escrever diretamente na coleção `audit` com dados forjados via SDK, poluindo a trilha de auditoria — grave para um sistema financeiro que depende dela para rastreabilidade e LGPD.

**Correção:** restringir `create` a admin/seller, ou validar que `request.resource.data.atorUid == request.auth.uid`.

**1.5 — Chave da API WhatsApp sem validação de destino**

`functions/src/index.ts:751-861` — `wa.apiKey` enviado em plaintext no header. Leitura/escrita do doc já é restrita a admin (ok), mas não há validação de que `wa.apiUrl` aponta pra domínio confiável — risco residual de SSRF interno se admin for comprometido.

**1.6 — `next.config.ts` sem headers de segurança**

Não há `headers()` com CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`. Para um app com upload de CPF/RG/comprovantes e assinatura de contrato, isso deixa exposto a clickjacking (iframe malicioso reproduzindo o fluxo de assinatura).

**Correção:** adicionar `headers()` em `next.config.ts` com CSP mínima e `X-Frame-Options: DENY`.

---

### 🟢 BAIXO

**1.7** — `uploadFotoVeiculo` usa `file.makePublic()` com path previsível (`Date.now()` + nome sanitizado) — baixo impacto pois já é público por design, mas enumerável.

**1.8** — Confirmar que `vehicles/*` (leitura pública) não armazena campos sensíveis (custo de aquisição, margem) no mesmo doc — não há separação em subcoleção privada.

---

## ⚙️ 2. Código, Arquitetura & Performance

### 🟠 ALTO

**2.1 — Zero CI/CD**

`.github/workflows` não existe. Nenhum PR é validado automaticamente — build, lint e types podem quebrar em produção sem detecção.

**Correção mínima:** workflow rodando `npx tsc --noEmit`, `npx eslint .` e `next build` em cada push/PR.

**2.2 — ESLint: 94 erros / 37 avisos**

Destaques recorrentes:
- `react-hooks/set-state-in-effect` em `veiculos/[id]/page.tsx:79`, `vendedores/page.tsx:44`, `VeiculoDetalhe.tsx:72`, `PWA.tsx:37`, `ThemeContext.tsx:25` — `useEffect` chamando setState sem guard, causando renders em cascata.
- `@typescript-eslint/no-explicit-any` em ~10 pontos, vários tocando dados de usuário/autenticação (`(user as any).email`).
- `<img>` em vez de `next/image` em 6+ arquivos do catálogo de veículos — impacto real em LCP, já que é um catálogo com fotos.
- Bug real pego pelo lint: `SelecaoExclusao.tsx:45` — `let falhas` nunca reatribuído (`prefer-const`), sinal de lógica de acumulação de falhas potencialmente quebrada.

**2.3 — Queries Firestore sem paginação**

`getDocs(query(...))` sem `limit()` em pelo menos 8 pontos: `comissoes/page.tsx:56`, `leads/page.tsx:50`, `trocas/page.tsx:45`, `recebimentos/page.tsx:97,137`, `dashboard/page.tsx:69,118,119`, `minha-area/troca/page.tsx:51,74,105`. Destaque: `recebimentos/page.tsx:97` usa `collectionGroup(db, "installments")` sem limite — cresce linearmente com contratos × parcelas, vai degradar performance e custo conforme a base cresce.

---

### 🟡 MÉDIO

**2.4 — Tratamento de erro inconsistente**

Só 7 de ~17 páginas do painel têm `catch` visível nas funções de carregamento. Nas demais, exceção sobe sem tratamento (tela em branco/loading infinito) ou só há `console.error` sem feedback ao usuário.

**2.5 — Duplicação de formatação de moeda**

`formatCurrency()` já existe em `web/lib/utils.ts:8`, mas **12 arquivos** reimplementam `toLocaleString("pt-BR", {...})` manualmente. Qualquer mudança de formato exige editar 12 lugares.

**2.6 — Arquivos grandes demais**

| Arquivo | Linhas |
|---------|--------|
| `contratos/[id]/page.tsx` | 974 |
| `recebimentos/page.tsx` | 801 |
| `minha-area/page.tsx` | 732 |
| `clientes/[id]/page.tsx` | 715 |
| `contratos/novo/page.tsx` | 674 |

Recomenda-se extrair subcomponentes e hooks de dados (`useContrato`, `useCliente`).

**2.7 — Zero testes automatizados**

Nenhum `*.test.ts`/`*.spec.ts` no projeto. Maior ROI: `web/lib/financiamento.ts` (juros compostos, multa/juros de atraso — dinheiro real) e geração de cronograma/contrato — são funções puras, fáceis de testar.

**2.8 — Erros não chegam ao Sentry**

`@sentry/nextjs` já está configurado, mas erros capturados em `catch` só vão pro `console`, não são reportados explicitamente ao Sentry.

---

### 🟢 BAIXO

**2.9** — `tsc --noEmit` está limpo (0 erros) hoje — ponto positivo, mas sem CI pode regredir a qualquer commit.

**2.10** — `next.config.ts` sem `images.remotePatterns`/otimização configurada — `next/image` nem está sendo aproveitado onde mais importa (fotos de carros).

**2.11** — Sem `onSnapshot` em todo o app — nenhuma tela é "tempo real", tudo depende de refetch manual. Pode ser intencional, vale confirmar.

---

## 🎨 3. UI/UX & Acessibilidade

### 🔴 CRÍTICO (bloqueia uso)

**3.1 — ✅ CORRIGIDO — Toggle switches inacessíveis por teclado**

`contratos/novo/page.tsx:297-313, 382-397, 521-532` — "switches" eram `<div onClick>` dentro de `<label>`, não `<input type="checkbox">` real. Não eram focáveis, `Enter`/`Space` não ativavam.

**Correção aplicada (commit `70e216d`):** os 3 toggles (`docsOverride`, `modoManual`, `tradeIn.ativo`) agora usam `<input type="checkbox" role="switch" className="sr-only peer">` real, focável via Tab, ativável via Space/Enter, com anel de foco visível via `peer-focus-visible`. Visual mantido idêntico.

**3.2 — Ações financeiras destrutivas sem confirmação**

`contratos/[id]/page.tsx:608-613` (registrar pagamento, pode quitar contrato) e `:688-694` (confirmar renegociação, altera parcelas permanentemente) executam direto no clique, sem modal. Um clique acidental altera dados financeiros permanentemente.

**3.3 — Sem opção de cancelar/excluir contrato na tela de detalhe**

`contratos/[id]/page.tsx` (975 linhas) não tem fluxo de exclusão individual — só existe exclusão em massa na listagem. Contraste com `clientes/[id]/page.tsx:681-709`, que tem fluxo bem feito em dois passos.

---

### 🟠 IMPORTANTE (frustra usuário)

**3.4** — Formulários sem `react-hook-form`/`zod` — validação manual e inconsistente entre `clientes/novo`, `veiculos/novo`, `contratos/novo`. `veiculos/novo/page.tsx:38-50` nem tem validação central.

**3.5** — Erros técnicos do backend vazando pro usuário — `toast(e?.message)` repassa texto cru do Firebase (`functions/permission-denied`) direto na tela em `clientes/page.tsx:59` e `clientes/[id]/page.tsx:697`.

**3.6** — Tabela de contratos sem scroll horizontal nem versão mobile — `contratos/page.tsx:107-169` usa `overflow-hidden` (corta conteúdo) em vez de `overflow-x-auto`, sem cards `md:hidden` como `clientes`/`veiculos` já têm. Mesmo problema em parcelas/revisões (`contratos/[id]/page.tsx:489-628, 948-969`).

**3.7** — Labels não associados via `htmlFor`/`id` em `clientes/novo`, `veiculos/novo`, `contratos/novo`, `clientes/[id]` — leitor de tela não anuncia o rótulo ao focar o input.

**3.8** — Modal de restrição sem `role="dialog"`, sem foco automático, botão de fechar sem `aria-label` (`clientes/[id]/page.tsx:324-345`).

**3.9** — Botões só-ícone sem `aria-label` — voltar, remover foto, marcar principal, aprovar/recusar documento usam apenas `title` (não confiável para leitor de tela/toque).

**3.10** — `<img>` de veículo com `alt=""` — tratado como decorativo quando é conteúdo informativo (`veiculos/novo/page.tsx:168`, `veiculos/page.tsx:130,193`).

---

### ⚪ NICE-TO-HAVE

**3.11** — `contratos/[id]/page.tsx` mistura cronograma + renegociação + garantia + revisões numa única página de quase 1000 linhas — poderia virar abas.

**3.12** — Inputs de busca/filtro sem `label`/`aria-label` em `clientes`, `contratos`, `veiculos`.

**3.13** — `contratos/page.tsx` não segue padding responsivo (`p-8` fixo em vez de `p-4 md:p-8`).

**3.14** — Badges/cards de seleção sem `aria-pressed`/`aria-selected`.

### ✅ Pontos Positivos

`globals.css` tem sistema de tokens de tema claro/escuro bem estruturado, remapeamento automático para dark mode, piso mínimo de `font-size`, foco visível global (`:focus-visible`) e alvo de toque mínimo de 44px. Listagens de clientes/veículos têm bom padrão de loading, empty state e confirmação de exclusão em massa — deveria ser replicado em contratos.

---

## 📋 Plano de Ação Priorizado

### Esta semana (crítico)
- [x] **[SEG]** Corrigir `registerPayment` — adicionar checagem de role (1.1) — ✅ commit `91248dd`
- [x] **[UX]** Corrigir toggles inacessíveis em `contratos/novo` (3.1) — ✅ commit `70e216d`
- [ ] **[UX]** Adicionar confirmação em registrar pagamento / renegociação (3.2)

### Próximas 2 semanas (alto)
- [ ] **[SEG]** Rodar `npm audit fix`, testar regressões (1.3)
- [ ] **[SEG]** Aumentar entropia de senha temporária + rate-limit no login (1.2)
- [ ] **[CODE]** Criar workflow de CI (lint + typecheck + build) (2.1)
- [ ] **[CODE]** Corrigir os 94 erros de ESLint, priorizando `set-state-in-effect` (2.2)
- [ ] **[CODE]** Adicionar `limit()` nas queries sem paginação, especialmente `collectionGroup(installments)` (2.3)
- [ ] **[UX]** Adicionar fluxo de exclusão de contrato individual (3.3)

### Próximo mês (médio)
- [ ] Restringir `create` em `audit/` a admin/seller (1.4)
- [ ] Adicionar headers de segurança no `next.config.ts` (1.6)
- [ ] Padronizar tratamento de erro com toast + Sentry (2.4, 2.8)
- [ ] Consolidar `formatCurrency()` nos 12 arquivos duplicados (2.5)
- [ ] Migrar formulários pra `react-hook-form` + `zod` (3.4)
- [ ] Adicionar scroll/cards mobile em `contratos` (3.6)
- [ ] Corrigir labels/aria-labels em formulários (3.7, 3.9, 3.10)

### Backlog (baixo / nice-to-have)
- [ ] Extrair componentes dos 5 arquivos gigantes (2.6)
- [ ] Testes unitários em `financiamento.ts` (2.7)
- [ ] Migrar `<img>` para `next/image` no catálogo (2.10, 2.2)
- [ ] Dividir `contratos/[id]` em abas (3.11)

---

## 📊 Metodologia

- **Segurança:** leitura de `firestore.rules`, `storage.rules`, `functions/src/index.ts`, `web/lib/functions.ts`, `web/lib/firestore/*`, `npm audit --omit=dev`
- **Código:** `npx tsc --noEmit`, `npx eslint .`, grep de padrões (queries sem limit, try/catch, duplicação)
- **UI/UX:** leitura de código-fonte das páginas principais do painel e portal do cliente, sem execução em browser

**Não foi feito nesta rodada:** teste manual em navegador, teste de carga, pentest ativo, revisão de `storage.rules` linha a linha, revisão do app mobile (`mobile/`).

---

**Última atualização:** 2026-08-22
**Próxima revisão recomendada:** após implementar itens críticos e altos
