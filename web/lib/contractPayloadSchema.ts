import { z } from "zod";

/**
 * Validação defensiva do payload de um novo contrato, executada em
 * handleSave() imediatamente antes de createContract().
 *
 * O wizard de criação de contrato (app/(panel)/contratos/novo/page.tsx)
 * usa useState + botões `disabled` para orientar o vendedor passo a
 * passo — isso permanece como está (não foi migrado para
 * react-hook-form: é um wizard multi-etapa sem <form onSubmit>, com
 * campos que trocam de tipo dinamicamente e cálculos financeiros que
 * precisam recalcular a cada tecla; RHF não se encaixa bem nesse
 * modelo e a reescrita completa traria risco desproporcional).
 *
 * Esta camada existe para não depender *só* dos `disabled` da UI —
 * eles orientam o fluxo, mas não são a fonte de verdade de
 * integridade dos dados. Ela é a última barreira antes de gravar no
 * Firestore, cobrindo os dois modos de negociação (financiamento
 * calculado com juros e negócio combinado manualmente).
 */
export const contractPayloadSchema = z
  .object({
    customerId: z.string().nullable(),
    vehicleId: z.string().nullable(),
    price: z.number(),
    downPayment: z.number(),
    downPaymentTotal: z.number(),
    tradeIn: z.object({
      ativo: z.boolean(),
      marca: z.string(),
      modelo: z.string(),
      ano: z.string(),
      placa: z.string(),
      valor: z.number(),
    }),
    installmentsCount: z.number(),
    firstDueDate: z.string(),
    modoManual: z.boolean(),
    financedAmount: z.number(),
    installmentValue: z.number(),
    interestRate: z.number(),
    penaltyRate: z.number(),
    dailyInterestRate: z.number(),
    docsOk: z.boolean(),
    docsOverride: z.boolean(),
    isAdmin: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (!data.customerId) {
      ctx.addIssue({ code: "custom", path: ["customerId"], message: "Selecione um cliente." });
    }
    if (!data.vehicleId) {
      ctx.addIssue({ code: "custom", path: ["vehicleId"], message: "Selecione um veículo." });
    }
    if (!(data.price > 0)) {
      ctx.addIssue({ code: "custom", path: ["price"], message: "O preço do veículo deve ser maior que zero." });
    }
    if (data.downPayment < 0) {
      ctx.addIssue({ code: "custom", path: ["downPayment"], message: "A entrada não pode ser negativa." });
    }
    if (data.tradeIn.valor < 0) {
      ctx.addIssue({ code: "custom", path: ["tradeIn", "valor"], message: "O valor do trade-in não pode ser negativo." });
    }
    if (data.downPaymentTotal < 0) {
      ctx.addIssue({ code: "custom", path: ["downPaymentTotal"], message: "A entrada total é inválida." });
    }
    // Coerência entrada-total x preço: relevante nos dois modos — no modo
    // calculado uma entrada maior que o preço já derruba financedAmount
    // para <= 0 (pego pela regra abaixo), mas no modo manual o valor
    // financiado não é validado por si só, então esta checagem cobre
    // ambos.
    if (data.price > 0 && data.downPaymentTotal > data.price) {
      ctx.addIssue({
        code: "custom",
        path: ["downPaymentTotal"],
        message: "A entrada total não pode ser maior que o preço do veículo.",
      });
    }
    if (!Number.isInteger(data.installmentsCount) || data.installmentsCount <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["installmentsCount"],
        message: "O número de parcelas deve ser um número inteiro maior que zero.",
      });
    }
    if (!data.firstDueDate || Number.isNaN(Date.parse(data.firstDueDate))) {
      ctx.addIssue({ code: "custom", path: ["firstDueDate"], message: "Informe uma data de primeiro vencimento válida." });
    }
    if (!data.modoManual && !(data.financedAmount > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["financedAmount"],
        message: "O valor financiado deve ser maior que zero.",
      });
    }
    if (data.modoManual && !(data.installmentValue > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["installmentValue"],
        message: "No modo manual, o valor de cada parcela deve ser maior que zero.",
      });
    }
    if (data.interestRate < 0) {
      ctx.addIssue({ code: "custom", path: ["interestRate"], message: "A taxa de juros não pode ser negativa." });
    }
    if (data.penaltyRate < 0) {
      ctx.addIssue({ code: "custom", path: ["penaltyRate"], message: "A multa por atraso não pode ser negativa." });
    }
    if (data.dailyInterestRate < 0) {
      ctx.addIssue({ code: "custom", path: ["dailyInterestRate"], message: "O juros diário de atraso não pode ser negativo." });
    }
    if (data.tradeIn.ativo) {
      if (!data.tradeIn.marca.trim()) {
        ctx.addIssue({ code: "custom", path: ["tradeIn", "marca"], message: "Informe a marca do veículo de entrada (trade-in)." });
      }
      if (!data.tradeIn.modelo.trim()) {
        ctx.addIssue({ code: "custom", path: ["tradeIn", "modelo"], message: "Informe o modelo do veículo de entrada (trade-in)." });
      }
      if (!data.tradeIn.ano.trim()) {
        ctx.addIssue({ code: "custom", path: ["tradeIn", "ano"], message: "Informe o ano do veículo de entrada (trade-in)." });
      }
      if (!data.tradeIn.placa.trim()) {
        ctx.addIssue({ code: "custom", path: ["tradeIn", "placa"], message: "Informe a placa do veículo de entrada (trade-in)." });
      }
    }
    // Mesma regra que já governa o botão "Confirmar Venda" no wizard:
    // documentação ok, OU override marcado, OU o usuário já é admin.
    // Replicada aqui (não endurecida) para não depender só do `disabled`
    // da UI como única barreira.
    if (!(data.docsOk || data.docsOverride || data.isAdmin)) {
      ctx.addIssue({
        code: "custom",
        path: ["docsOk"],
        message: "Documentação pendente de aprovação — apenas um administrador pode liberar a venda mesmo assim.",
      });
    }
  });

export type ContractPayloadInput = z.infer<typeof contractPayloadSchema>;
