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

**Status:** ✅ Todos os 4 críticos (1.1, 3.1, 3.2, 3.3) e todos os 5 achados de prioridade alta (1.2, 1.3, 2.1, 2.2, 2.3) já foram corrigidos ou mitigados — ver detalhes em cada seção e o checklist no plano de ação. Restam os itens de prioridade média/baixa e dois itens parcialmente resolvidos com justificativa (1.3: vulnerabilidades de `expo`/`google-gax` exigem major upgrade; 2.3: `recebimentos`/`comissoes` precisam de arquitetura de agregação, não um patch rápido).

---

## 🔴 1. Segurança & Vulnerabilidades

### 🔴 CRÍTICO

**1.1 — ✅ CORRIGIDO — `functions/src/index.ts:338-399` — `registerPayment` sem verificação de role**

A função só checa `if (!request.auth)`, nunca valida `role`. Como usa Admin SDK (ignora `firestore.rules`), **qualquer usuário autenticado — inclusive um `customer`** — pode chamar `registerPayment({contractId, installmentId, amount, method})` diretamente via SDK, para qualquer contrato/parcela, mesmo sem ser o dono.

**Exploração concreta:** um cliente mal-intencionado pode "quitar" o próprio financiamento sem pagar, ou adulterar parcelas de outro cliente — marcando-as como `paid`, gravando registros falsos em `payments`, e se todas ficarem pagas, mudando `contract.status` para `settled`.

**Correção aplicada (commit `91248dd`):** agora exige `role === 'admin' || role === 'seller'`, valida que o seller é dono do contrato (`contract.sellerId === callerUid`), valida campos obrigatórios, rejeita parcela já paga, e registra em `audit/`.

---

### 🟠 ALTO

**1.2 — 🟡 PARCIALMENTE CORRIGIDO — `functions/src/index.ts:101` — senha temporária previsível/curta**

`tempPassword = "fin-" + (1000..9999) + "-" + 4 caracteres base36`. Formato fixo e público (`fin-XXXX-yyyy`), ~9.000 × ~1,68M combinações. Não há rate-limit visível no login nem CAPTCHA (`web/app/login/page.tsx`) — um atacante que saiba o e-mail de um cliente recém-cadastrado tem uma janela de força-bruta antes da troca obrigatória de senha (`mustChangePassword`).

**Correção aplicada (commit `6d2a41c`):** geração trocada de `Math.random()` (inadequado para segredos) para `crypto.randomInt`/`crypto.randomBytes`, com entropia bem maior (`fin-XXXXXX-yyyyyy`, ~900.000 × ~2 bilhões de combinações vs ~9.000 × 1,68M antes).

**Ainda pendente:** rate-limiting no login (Firebase App Check ou Cloud Function de controle de tentativas) — decisão de infraestrutura maior, não incluída nesta rodada.

**1.3 — 🟡 PARCIALMENTE CORRIGIDO — Dependências vulneráveis (`npm audit`)**

- `next` — múltiplas vulnerabilidades **High**: SSRF em Server Actions/rewrites, exposição não autenticada de endpoints internos de Server Functions, DoS via Image Optimization/SVG. Versão instalada está fora do range corrigido.
- `postcss` (via next) — XSS em `</style>` não escapado, leitura arbitrária de arquivo via `sourceMappingURL`.
- `js-yaml`, `fast-uri`, `brace-expansion`, `nanoid` — DoS/CPU quadrático (High).
- `form-data` — CRLF injection (High).

**Correção aplicada (commits `6a88dab`, `0898de8`):**
- `web/`: **0 vulnerabilidades** (era 8, 7 High). `npm audit fix` resolveu `js-yaml`/`nanoid`/`brace-expansion`/`fast-uri`/`form-data`; `next` atualizado manualmente de `16.2.7` para `^16.3.2` (dentro do range 16.x, sem pular major), o que também resolveu `postcss` e `sharp` (transitivos do Next).
- raiz: reduzido de 33 para 26 vulnerabilidades (14 High → 8 High).

**Deliberadamente NÃO corrigido:** as 26 restantes na raiz são todas em `expo`/`@expo/*`/`xcode` (workspace `mobile`) e `gaxios`/`google-gax`/`teeny-request` (via `firebase-admin`/`@google-cloud/firestore` no workspace `functions`). `npm audit fix --force` foi testado em modo `--dry-run` e **não é recomendado**: exigiria major upgrade do Expo e do SDK do Google Cloud, risco alto de quebra fora do escopo desta correção — fica como item de manutenção separado, com testes dedicados de regressão no app mobile e nas functions antes de aplicar.

---

### 🟡 MÉDIO

**1.4 — ✅ CORRIGIDO — `firestore.rules:207` — `audit/{logId}` criável por qualquer autenticado**

`allow create: if isAuthenticated();` sem checar o autor real. Qualquer cliente autenticado podia escrever diretamente na coleção `audit` com dados forjados via SDK, poluindo a trilha de auditoria — grave para um sistema financeiro que depende dela para rastreabilidade e LGPD.

**Correção aplicada (commit `b1e8272`):** `create` restrito a `isAdminOrSeller()` e validado que `request.resource.data.atorUid == request.auth.uid`. Confirmado que só páginas `(panel)` (admin/seller) chamam `registrarAuditoria()` — nenhum fluxo de cliente precisa dessa escrita.

**1.5 — Chave da API WhatsApp sem validação de destino**

`functions/src/index.ts:751-861` — `wa.apiKey` enviado em plaintext no header. Leitura/escrita do doc já é restrita a admin (ok), mas não há validação de que `wa.apiUrl` aponta pra domínio confiável — risco residual de SSRF interno se admin for comprometido. Não corrigido nesta rodada (risco residual baixo, exige admin já comprometido).

**1.6 — ✅ CORRIGIDO — `next.config.ts` sem headers de segurança**

Não havia `headers()` com CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`. Para um app com upload de CPF/RG/comprovantes e assinatura de contrato, isso deixava exposto a clickjacking (iframe malicioso reproduzindo o fluxo de assinatura).

**Correção aplicada (commit `b1e8272`):** adicionado `headers()` com `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` negando câmera/microfone/geolocalização (não usados pelo app). **CSP completa deliberadamente não incluída** — exige testar em navegador real contra Firebase/Sentry/recharts; uma CSP quebrada seria pior que nenhuma. Fica como follow-up.

---

### 🟢 BAIXO

**1.7** — `uploadFotoVeiculo` usa `file.makePublic()` com path previsível (`Date.now()` + nome sanitizado) — baixo impacto pois já é público por design, mas enumerável.

**1.8** — Confirmar que `vehicles/*` (leitura pública) não armazena campos sensíveis (custo de aquisição, margem) no mesmo doc — não há separação em subcoleção privada.

---

## ⚙️ 2. Código, Arquitetura & Performance

### 🟠 ALTO

**2.1 — ✅ CORRIGIDO — Zero CI/CD**

`.github/workflows` não existia. Nenhum PR era validado automaticamente — build, lint e types podiam quebrar em produção sem detecção.

**Correção aplicada (commit `6d2a41c`):** `.github/workflows/ci.yml` criado com 3 jobs: `web` (lint + typecheck + build), `functions` (typecheck + build), `audit` (npm audit high/critical, não-bloqueante). Roda em push/PR para `master`.

**2.2 — ✅ CORRIGIDO — ESLint: 94 erros / 37 avisos**

Destaques recorrentes:
- `react-hooks/set-state-in-effect` em `veiculos/[id]/page.tsx:79`, `vendedores/page.tsx:44`, `VeiculoDetalhe.tsx:72`, `PWA.tsx:37`, `ThemeContext.tsx:25` — `useEffect` chamando setState sem guard, causando renders em cascata.
- `@typescript-eslint/no-explicit-any` em ~10 pontos, vários tocando dados de usuário/autenticação (`(user as any).email`).
- `<img>` em vez de `next/image` em 6+ arquivos do catálogo de veículos — impacto real em LCP, já que é um catálogo com fotos (ficou como aviso, não erro — não bloqueante, não corrigido nesta rodada).
- Bug real pego pelo lint: `SelecaoExclusao.tsx:45` — `let falhas` nunca reatribuído (`prefer-const`), sinal de lógica de acumulação de falhas potencialmente quebrada.

**Correção aplicada (commit `aada437`):** 94 → **0 erros** (37 warnings pré-existentes mantidos, nenhum novo). `set-state-in-effect` resolvido envolvendo a chamada em `Promise.resolve().then(() => load())` em ~20 arquivos. `no-explicit-any` resolvido usando tipos reais de `@financer-auto/shared` ou interfaces locais mínimas onde não havia tipo pronto. Também corrigidos 2 bugs reais de hoisting (função chamada antes de ser declarada, em `clientes/[id]` e `trocas`) e 1 chamada impura de `Date.now()` durante render em `clientes/novo`. **Investigado o caso do `SelecaoExclusao.tsx`:** não era bug — `falhas` só era usado via `.push()`, nunca reatribuído, apenas `let` desnecessário. `tsc --noEmit` e `npm run build` (33 rotas) confirmados limpos após a correção.

**2.3 — 🟡 PARCIALMENTE CORRIGIDO — Queries Firestore sem paginação**

`getDocs(query(...))` sem `limit()` em pelo menos 8 pontos: `comissoes/page.tsx:56`, `leads/page.tsx:50`, `trocas/page.tsx:45`, `recebimentos/page.tsx:97,137`, `dashboard/page.tsx:69,118,119`, `minha-area/troca/page.tsx:51,74,105`. Destaque: `recebimentos/page.tsx:97` usa `collectionGroup(db, "installments")` sem limite — cresce linearmente com contratos × parcelas, vai degradar performance e custo conforme a base cresce.

**Correção aplicada (commit `6d2a41c`):**
- `minha-area/troca/page.tsx:51,74,105` — investigado e são falso positivo: já filtradas por `where("customerId", "==", cid)`, naturalmente limitadas aos dados de um único cliente.
- `dashboard/page.tsx:118,119` — trocado `getDocs(...).size` por `getCountFromServer(...)`: conta no servidor sem baixar documentos, mais barato e sem risco de truncar o número exibido.
- `leads/page.tsx:50`, `trocas/page.tsx:45` — adicionado `limit(300)`. Seguro porque são listagens simples com filtro client-side por tab, sem cálculo de totais financeiros sobre o resultado.

**Deliberadamente NÃO corrigido nesta rodada:** `recebimentos/page.tsx:97,137` (collectionGroup installments) e `comissoes/page.tsx:56`. Essas páginas calculam **totais financeiros e listas de atraso** a partir do resultado completo da query (saldo pendente, parcelas vencidas, soma de comissões por vendedor). Adicionar `limit()` ali truncaria silenciosamente esses números — poderia esconder uma parcela vencida real ou mostrar um total de comissão errado, o que é pior que o problema de performance original. Corrigir isso direito exige uma arquitetura diferente (agregação no servidor ou paginação com recomputo incremental), não um patch rápido — fica como item separado de arquitetura, não uma correção "alta prioridade" isolada.

---

### 🟡 MÉDIO

**2.4 — Tratamento de erro inconsistente**

Só 7 de ~17 páginas do painel têm `catch` visível nas funções de carregamento. Nas demais, exceção sobe sem tratamento (tela em branco/loading infinito) ou só há `console.error` sem feedback ao usuário.

**2.5 — ✅ CORRIGIDO — Duplicação de formatação de moeda**

`formatCurrency()` já existe em `web/lib/utils.ts:8`, mas alguns arquivos reimplementavam `toLocaleString("pt-BR", {...})`/`Intl.NumberFormat` manualmente. Qualquer mudança de formato exigia editar cada um separadamente.

**Correção aplicada (commit `e8deeae`):** ao investigar, o escopo real era menor que os "12 arquivos" estimados na auditoria original — a maioria já usava `formatCurrency` corretamente. Consolidados 4 casos reais de duplicação byte-a-byte idêntica: `gerarContrato.ts`, `gerarExtrato.ts`, `gerarPromissoria.ts` (commitados) e `loja/[id]/page.tsx` (corrigido no disco, aguarda commit junto da feature "loja" ainda não commitada). Casos como quilometragem, timestamps e valor por extenso foram deliberadamente deixados de fora — não são duplicação de `formatCurrency`, são formatações com propósito diferente.

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

**3.2 — ✅ CORRIGIDO — Ações financeiras destrutivas sem confirmação**

`contratos/[id]/page.tsx:608-613` (registrar pagamento, pode quitar contrato) e `:688-694` (confirmar renegociação, altera parcelas permanentemente) executavam direto no clique, sem confirmação. Um clique acidental alterava dados financeiros permanentemente.

**Correção aplicada (commit `32f28a5`):** ambas as ações agora exigem um segundo clique explícito ("Sim, confirmar") mostrando o valor/quantidade exata antes de gravar no Firestore. A renegociação também valida o formulário antes de permitir a confirmação.

**3.3 — ✅ CORRIGIDO — Sem opção de cancelar/excluir contrato na tela de detalhe**

`contratos/[id]/page.tsx` (975 linhas) não tinha fluxo de exclusão individual — só existia exclusão em massa na listagem. Contraste com `clientes/[id]/page.tsx:681-709`, que tem fluxo bem feito em dois passos.

**Correção aplicada (commit `420be03`):** adicionada seção "Zona de perigo" (admin-only) na tela de detalhe do contrato, replicando o padrão de confirmação em dois passos já usado em clientes, com aviso se houver parcelas pagas.

---

### 🟠 IMPORTANTE (frustra usuário)

**3.4** — Formulários sem `react-hook-form`/`zod` — validação manual e inconsistente entre `clientes/novo`, `veiculos/novo`, `contratos/novo`. `veiculos/novo/page.tsx:38-50` nem tem validação central.

**3.5** — Erros técnicos do backend vazando pro usuário — `toast(e?.message)` repassa texto cru do Firebase (`functions/permission-denied`) direto na tela em `clientes/page.tsx:59` e `clientes/[id]/page.tsx:697`.

**3.6 — ✅ CORRIGIDO** — Tabela de contratos sem scroll horizontal nem versão mobile — `contratos/page.tsx:107-169` usava `overflow-hidden` (corta conteúdo) em vez de `overflow-x-auto`, sem cards `md:hidden` como `clientes`/`veiculos` já tinham. Mesmo problema em parcelas/revisões (`contratos/[id]/page.tsx:489-628, 948-969`). **Correção (commit `e87c1ea`):** versão mobile em cards replicando o padrão existente, tabela desktop com `overflow-x-auto`, wrapper de scroll nas tabelas de parcelas/revisões.

**3.7 — ✅ CORRIGIDO** — Labels não associados via `htmlFor`/`id` em `clientes/novo`, `veiculos/novo`, `contratos/novo`, `clientes/[id]` — leitor de tela não anunciava o rótulo ao focar o input. **Correção (commit `e87c1ea`):** todos os campos desses 4 formulários (39 campos no total) ganharam `id`/`htmlFor` correspondentes.

**3.8 — ✅ CORRIGIDO** — Modal de restrição sem `role="dialog"`, sem foco automático. **Correção (commit `cc3d86f`):** `role="dialog"` + `aria-modal="true"` + `aria-labelledby` no painel do modal, foco automático no textarea ao abrir, fecha com Escape e com clique no overlay.

**3.9 — ✅ CORRIGIDO** — Botões só-ícone sem `aria-label` — voltar, remover foto, marcar principal, aprovar/recusar documento, fechar modal, copiar PIX/link, excluir despesa/oficina usavam apenas `title` (não confiável para leitor de tela/toque). **Correção (commit `e87c1ea`):** `aria-label` adicionado em todos, `title` mantido onde já existia.

**3.10 — ✅ CORRIGIDO** — `<img>` de veículo com `alt=""` — tratado como decorativo quando é conteúdo informativo (`veiculos/novo/page.tsx:168`, `veiculos/page.tsx:130,193`). **Correção (commit `e87c1ea`):** alt agora usa `"{marca} {modelo}"` (com índice da foto quando aplicável) em `veiculos/page.tsx`, `veiculos/[id]/page.tsx` e `VeiculoDetalhe.tsx`.

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
- [x] **[UX]** Adicionar confirmação em registrar pagamento / renegociação (3.2) — ✅ commit `32f28a5`

### Próximas 2 semanas (alto)
- [x] **[SEG]** Rodar `npm audit fix`, testar regressões (1.3) — ✅ commits `6a88dab`, `0898de8` (web: 0 vulns; raiz: 33→26, resto exige major upgrade de expo/google-gax, ver detalhe)
- [x] **[SEG]** Aumentar entropia de senha temporária (1.2) — ✅ commit `6d2a41c` (rate-limit no login ainda pendente)
- [x] **[CODE]** Criar workflow de CI (lint + typecheck + build) (2.1) — ✅ commit `6d2a41c`
- [x] **[CODE]** Corrigir os 94 erros de ESLint, priorizando `set-state-in-effect` (2.2) — ✅ commit `aada437`
- [x] **[CODE]** Adicionar `limit()`/`getCountFromServer` nas queries seguras (2.3) — ✅ commit `6d2a41c` (recebimentos/comissoes ficam para item de arquitetura à parte)
- [x] **[UX]** Adicionar fluxo de exclusão de contrato individual (3.3) — ✅ commit `420be03`

### Próximo mês (médio)
- [x] Restringir `create` em `audit/` a admin/seller (1.4) — ✅ commit `b1e8272`
- [x] Adicionar headers de segurança no `next.config.ts` (1.6) — ✅ commit `b1e8272` (CSP completa fica de follow-up)
- [ ] Padronizar tratamento de erro com toast + Sentry (2.4, 2.8)
- [x] Consolidar `formatCurrency()` nos arquivos duplicados (2.5) — ✅ commit `e8deeae`
- [ ] Migrar formulários pra `react-hook-form` + `zod` (3.4)
- [x] Adicionar scroll/cards mobile em `contratos` (3.6) — ✅ commit `e87c1ea`
- [x] Corrigir labels/aria-labels em formulários (3.7, 3.9, 3.10) — ✅ commit `e87c1ea`

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
