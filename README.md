# Financer Auto — Plataforma de Financiamento de Veículos

Sistema de gestão completo para concessionárias de veículos, incluindo:
- 📋 Gestão de clientes, contratos e veículos
- 💰 Cálculo automático de financiamentos e parcelamentos
- 📱 Portal do cliente com acesso a contratos e documentos
- 🎯 Dashboard administrativo com KPIs e fluxo de caixa
- 🔒 Autenticação e autorização por roles (admin, seller, customer)
- 🧾 Geração de contratos em PDF com assinatura digital

## Stack Técnico

```
Financer Auto (Monorepo)
├── web/              → Next.js 16 + React 19 (SPA + SSR)
├── mobile/           → React Native (Expo)
├── functions/        → Cloud Functions (Firebase v2)
├── shared/           → Types e utilitários compartilhados
└── landing/          → Landing page estática
```

### Backend
- **Firebase**
  - Firestore (banco de dados)
  - Cloud Storage (documentos e fotos)
  - Cloud Functions (lógica de negócio)
  - Firebase Auth (autenticação)
- **Cloud Tasks** (para agendamento de ações)
- **SendGrid / Nodemailer** (e-mail)

### Frontend
- **Next.js 16** (App Router)
- **React 19** com hooks
- **Tailwind CSS 4** com PostCSS
- **TypeScript 5**
- **Radix UI** (componentes unstyled)
- **React Hook Form + Zod** (forms com validação)
- **Sentry** (error tracking)
- **Vercel Analytics** (observabilidade)

## 🚀 Iniciando

### Prerequisites
- Node.js 20+
- Firebase CLI: `npm install -g firebase-tools`
- Conta no Google Cloud Console com Firebase habilitado

### Setup Inicial

```bash
# 1. Clonar repo
git clone https://github.com/niltinhoapp/Financer-auto.git
cd Financer-auto

# 2. Instalar dependências (workspace)
npm install

# 3. Configurar Firebase
firebase login
firebase use <seu-projeto>

# 4. Variáveis de ambiente
cp web/.env.local.example web/.env.local
# Preencher NEXT_PUBLIC_* e variáveis privadas

# 5. Rodar web (dev)
npm run web
# Abre http://localhost:3000

# 6. Rodar Cloud Functions (emulator)
firebase emulators:start
```

## 📂 Estrutura do Projeto

```
web/
├── app/
│   ├── (panel)/              → Admin dashboard
│   │   ├── clientes/         → Gestão de clientes
│   │   ├── contratos/        → Gestão de contratos
│   │   ├── veiculos/         → Gestão de veículos
│   │   ├── dashboard/        → KPIs e overview
│   │   ├── recebimentos/     → Fluxo de caixa
│   │   └── vendedores/       → Gestão de sellers
│   ├── (cliente)/            → Customer portal
│   │   └── minha-area/       → Cliente dashboard
│   ├── globals.css           → Estilos globais
│   └── layout.tsx            → Root layout
├── components/
│   ├── layout/               → Sidebar, header
│   ├── ui/                   → Radix UI customizado
│   └── admin/                → Componentes específicos
├── lib/
│   ├── firestore/            → Queries e helpers
│   ├── pdf/                  → Geração de PDFs
│   ├── financiamento.ts      → Cálculos de empréstimo
│   └── contractTemplate.ts   → Template de contrato
└── public/
    ├── manifest.webmanifest  → PWA config
    └── sw.js                 → Service Worker

functions/
├── src/
│   └── index.ts              → Todas as Cloud Functions
└── package.json

shared/
├── src/
│   └── types/
│       ├── contract.ts       → Contrato e Installment
│       ├── customer.ts       → Cliente e endereço
│       ├── user.ts           → Usuário e roles
│       ├── expense.ts        → Despesa operacional
│       └── paymentRequest.ts → Solicitação de pagamento
└── package.json
```

## 🔐 Autenticação & Autorização

Três roles principais:
- **admin** — acesso total, gestão de tudo
- **seller** — cria contratos, gerencia seus próprios clientes
- **customer** — visualiza próprios contratos, documenta

Regras no Firestore (`firestore.rules`) definem quem lê/escreve o quê.

## 📊 Modelos de Dados

### Customers
```typescript
{
  uid: string;               // ID do documento
  name: string;
  cpf: string;
  email: string;
  phone: string;
  birthDate: string;         // YYYY-MM-DD
  address: Address;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  createdAt: ISO8601;
  updatedAt: ISO8601;
}
```

### Contracts
```typescript
{
  id: string;
  customerId: string;        // ref → customers/
  sellerId: string;          // ref → users/ (seller uid)
  vehicleId: string;         // ref → vehicles/
  
  // Financeiro
  vehiclePrice: number;
  downPayment: number;       // entrada
  financedAmount: number;    // = vehiclePrice - downPayment
  interestRate: number;      // % ao mês
  termMonths: number;        // número de parcelas
  startDate: string;         // data do primeiro pagamento
  
  status: 'draft' | 'active' | 'completed' | 'defaulted';
  signatureUrl?: string;     // PDF assinado
  createdAt: ISO8601;
}

// Subcoleção: installments/
{
  id: string;                // número da parcela
  dueDate: string;           // data do vencimento
  amount: number;            // valor da parcela
  paidAmount: number;        // já pago (0 se não pago)
  status: 'pending' | 'paid' | 'overdue';
  paidAt?: string;
}
```

### Vehicles
```typescript
{
  id: string;
  brand: string;
  model: string;
  year: number;
  licensePlate: string;
  vin: string;
  price: number;
  status: 'available' | 'sold' | 'pending';
  imageUrl?: string;
  createdAt: ISO8601;
}
```

## 🔧 Cloud Functions

### Autenticado (admin/seller)
- `criarAcessoCliente(customerId, email, name)` — cria Auth user + documento
- `criarVendedor(email, name)` — cria seller
- `excluirVendedor(uid)` — desativa seller

### Public
- `notificarCliente(contractId, type)` — envia SMS/e-mail

### Admin Only
- `gerarUrlAssinada(filePath)` — acesso temporário a arquivos privados

## 📈 Dashboard & KPIs

Página principal (`/panel/dashboard`) mostra:
- Total de clientes e vendedores
- Contratos ativos vs. vencidos
- Receita mensal e fluxo de caixa
- Gráficos de desempenho de sellers
- Alertas de atraso de pagamento

## 💳 Pagamentos (Roadmap)

**Atual:** Manual — cliente transfere pelo banco, seller insere comprovante.

**Planejado:** Conectores para:
- ✨ **PIX Automático** — gera QR code dinâmico, confere retorno em tempo real
- **Cartão de Crédito** — integração Stripe/PagSeguro
- **Financiamento Bancário** — webhook de aprovação/reprovação

→ Ver [FEATURES.md](./FEATURES.md) para detalhes de implementação.

## 🧪 Testing & Quality

```bash
# Lint
npm run lint --workspace=web

# TypeScript
npx tsc --noEmit

# Build
npm run build --workspace=web
```

**Próximos:** testes unitários e E2E.

## 📡 Deployment

### Web (Next.js → Vercel)
```bash
npm run deploy --workspace=web
# Preview: vercel deploy
# Prod: vercel deploy --prod
```

### Functions (Firebase)
```bash
firebase deploy --only functions
```

## 🤝 Contribuindo

1. Branch: `feature/nome-da-feature`
2. Commits temáticos (1 feature por commit)
3. Nenhum segredo em commit (`.env.local` já no `.gitignore`)
4. PR → code review → merge

## 📝 Roadmap

- [ ] Testes unitários (Jest + React Testing Library)
- [ ] Testes E2E (Playwright)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] PIX automático com webhook
- [ ] Integração com Stripe/PagSeguro
- [ ] App mobile (React Native)
- [ ] Módulo de comissões automáticas
- [ ] Relatórios avançados (BI)

→ Ver [FEATURES.md](./FEATURES.md).

## 📞 Suporte

- Documentação de dev: [CLAUDE.md](./web/.claude/CLAUDE.md) (setup local)
- Issues: GitHub Issues
- Contato: dev team

## 📄 Licença

Proprietary © 2024 Financer Auto
