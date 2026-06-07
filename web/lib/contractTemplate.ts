import type { Contract, Customer, Vehicle } from "@financer-auto/shared";
import { formatCPF, formatCurrency, formatDate, formatPhone } from "@/lib/utils";

/**
 * Modelo de "Contrato de Compra e Venda de Veículo Automotor com
 * Financiamento Direto entre as Partes" — baseado nas cláusulas-padrão
 * usuais em modelos de contratos de compra e venda de veículo financiado
 * (transferência condicionada à quitação, reserva de domínio em favor do
 * vendedor até a quitação, responsabilidades do comprador por tributos,
 * multas e conservação, vencimento antecipado por inadimplência etc.).
 *
 * Os campos abaixo são preenchidos automaticamente a partir dos dados já
 * cadastrados (cliente, veículo e condições do contrato) — resta ao
 * comprador apenas ler e assinar digitalmente.
 */

export interface ContractTemplateData {
  contract: Contract;
  customer: Customer;
  vehicle: Vehicle;
  sellerName: string;
  companyName?: string;
  companyCnpj?: string;
}

function enderecoCompleto(c: Customer): string {
  const a = c.address;
  const partes = [
    `${a.street}, ${a.number}${a.complement ? ` - ${a.complement}` : ""}`,
    a.district,
    `${a.city}/${a.state}`,
    `CEP ${a.zip}`,
  ];
  return partes.filter(Boolean).join(", ");
}

export function gerarTextoContrato(data: ContractTemplateData): string {
  const { contract, customer, vehicle, sellerName } = data;
  const empresa = data.companyName ?? "FINANCER AUTO VEÍCULOS";
  const cnpj = data.companyCnpj ?? "[CNPJ da revenda]";

  const valorEntrada = formatCurrency(contract.downPayment);
  const valorFinanciado = formatCurrency(contract.financedAmount);
  const valorTotal = formatCurrency(contract.salePrice);
  const valorParcela = formatCurrency(contract.installmentValue);

  return `CONTRATO DE COMPRA E VENDA DE VEÍCULO AUTOMOTOR
COM FINANCIAMENTO DIRETO ENTRE AS PARTES

Pelo presente instrumento particular, de um lado:

VENDEDOR(A): ${empresa}, inscrita no CNPJ sob o nº ${cnpj}, doravante denominada simplesmente VENDEDORA, neste ato representada por seu(sua) vendedor(a) responsável ${sellerName};

e de outro lado:

COMPRADOR(A): ${customer.name}, portador(a) do CPF nº ${formatCPF(customer.cpf)}${customer.rg ? `, RG nº ${customer.rg}` : ""}, nascido(a) em ${formatDate(customer.birthDate)}, residente e domiciliado(a) em ${enderecoCompleto(customer)}, telefone ${formatPhone(customer.phone)}${customer.email ? `, e-mail ${customer.email}` : ""}, doravante denominado(a) simplesmente COMPRADOR(A);

têm entre si, justo e contratado, o que se segue:

CLÁUSULA 1ª — DO OBJETO
1.1. O presente contrato tem como objeto a compra e venda do veículo abaixo descrito ("VEÍCULO"):
   • Tipo: ${vehicle.type === "car" ? "Automóvel" : vehicle.type === "motorcycle" ? "Motocicleta" : vehicle.type === "truck" ? "Caminhão" : "Utilitário"}
   • Marca/Modelo: ${vehicle.brand} ${vehicle.model}
   • Ano: ${vehicle.year}
   • Cor: ${vehicle.color}
   • Placa: ${vehicle.plate.toUpperCase()}
   • Chassi: ${vehicle.chassis || "[não informado]"}
   • Quilometragem na data da venda: ${vehicle.mileage.toLocaleString("pt-BR")} km
${vehicle.features ? `   • Itens/observações: ${vehicle.features}\n` : ""}
1.2. O(A) COMPRADOR(A) declara ter vistoriado o VEÍCULO previamente à assinatura deste instrumento, recebendo-o no estado em que se encontra, ciente de suas condições mecânicas, elétricas e estéticas, nada tendo a reclamar a esse respeito posteriormente, salvo vícios ocultos não detectáveis em vistoria comum.

CLÁUSULA 2ª — DO PREÇO E DA FORMA DE PAGAMENTO
2.1. O preço certo e ajustado para a venda do VEÍCULO é de ${valorTotal}, a ser pago da seguinte forma:
   a) Entrada (sinal/princípio de pagamento), no valor de ${valorEntrada}, paga no ato da assinatura deste contrato;
   b) Saldo financiado de ${valorFinanciado}, a ser quitado em ${contract.installmentsCount} (${porExtensoNumero(contract.installmentsCount)}) parcelas mensais e consecutivas de ${valorParcela}, vencendo a primeira em ${formatDate(contract.firstDueDate)} e as demais no mesmo dia dos meses subsequentes.
2.2. Incidirá sobre o saldo financiado a taxa de juros de ${contract.interestRate}% ao mês, já considerada no cálculo das parcelas acima.
2.3. Em caso de atraso no pagamento de qualquer parcela, incidirão sobre o valor em aberto: multa de ${contract.penaltyRate}% e juros de mora de ${contract.dailyInterestRate}% ao dia, calculados pro rata die, até a data da efetiva liquidação.
2.4. O atraso superior a 30 (trinta) dias no pagamento de qualquer parcela autoriza a VENDEDORA a considerar vencidas antecipadamente todas as demais parcelas vincendas, exigindo o pagamento integral do saldo devedor ou a retomada do VEÍCULO, na forma da Cláusula 4ª.

CLÁUSULA 3ª — DA RESERVA DE DOMÍNIO E DA TRANSFERÊNCIA DE PROPRIEDADE
3.1. Em garantia do integral pagamento do preço, a VENDEDORA reserva para si o domínio resolúvel do VEÍCULO até a quitação total das parcelas descritas na Cláusula 2ª, nos termos do art. 521 e seguintes do Código Civil.
3.2. A posse direta do VEÍCULO é transferida ao(à) COMPRADOR(A) desde já, na data da assinatura, podendo dele usar e fruir, observadas as obrigações deste contrato.
3.3. Quitado integralmente o preço, a VENDEDORA se obriga a transferir a propriedade e a documentação (CRV/ATPV-e) do VEÍCULO ao(à) COMPRADOR(A), no prazo de até 30 (trinta) dias, arcando o(a) COMPRADOR(A) com as taxas de transferência, emplacamento e demais despesas cartorárias e de DETRAN pertinentes.

CLÁUSULA 4ª — DA INADIMPLÊNCIA E DA RETOMADA DO VEÍCULO
4.1. O não pagamento de 2 (duas) ou mais parcelas, consecutivas ou não, autoriza a VENDEDORA, a seu critério, a:
   a) exigir o pagamento integral do saldo devedor, acrescido de encargos moratórios; ou
   b) rescindir o presente contrato e reaver a posse do VEÍCULO, mediante notificação prévia ao(à) COMPRADOR(A), restituindo-se eventuais valores na forma da legislação aplicável, descontadas as perdas e danos, depreciação do bem e despesas de cobrança.
4.2. A busca e apreensão do VEÍCULO, quando necessária, observará o devido processo legal.

CLÁUSULA 5ª — DAS OBRIGAÇÕES E RESPONSABILIDADES DO(A) COMPRADOR(A)
5.1. A partir da data deste contrato, correm por conta exclusiva do(a) COMPRADOR(A):
   a) o pagamento de tributos, taxas, emolumentos, seguro obrigatório (DPVAT/seguro), licenciamento e quaisquer encargos que recaiam sobre o VEÍCULO;
   b) multas de trânsito e infrações cometidas na condução do VEÍCULO a partir desta data;
   c) a manutenção, conservação e guarda do VEÍCULO em bom estado de uso e funcionamento;
   d) a contratação de seguro do VEÍCULO contra furto, roubo, incêndio e colisão (recomendado, não obrigatório, salvo disposição em contrário).
5.2. O(A) COMPRADOR(A) não poderá vender, ceder, transferir, dar em garantia ou onerar o VEÍCULO a terceiros sem prévia e expressa autorização por escrito da VENDEDORA, enquanto vigorar a reserva de domínio de que trata a Cláusula 3ª.

CLÁUSULA 6ª — DA GARANTIA
6.1. Eventuais condições de garantia mecânica do VEÍCULO, quando aplicável, serão regidas por instrumento específico (Termo de Garantia), o qual passa a integrar este contrato como anexo, se houver.

CLÁUSULA 7ª — DA VALIDADE ENTRE AS PARTES
7.1. Este contrato representa acordo de financiamento direto entre VENDEDORA e COMPRADOR(A), não envolvendo instituição financeira terceira, e obriga exclusivamente as partes aqui signatárias e seus eventuais sucessores.

CLÁUSULA 8ª — DO FORO
8.1. As partes elegem o foro da comarca do domicílio do(a) COMPRADOR(A) para dirimir quaisquer dúvidas ou controvérsias oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.

CLÁUSULA 9ª — DA ASSINATURA ELETRÔNICA
9.1. As partes reconhecem como válida a assinatura eletrônica/digital aposta neste instrumento por meio da plataforma da VENDEDORA, nos termos do art. 10, §2º, da Medida Provisória nº 2.200-2/2001, declarando-se cientes de que tal assinatura tem a mesma validade jurídica de uma assinatura manuscrita para os fins deste contrato.
9.2. Ao assinar digitalmente, o(a) COMPRADOR(A) declara ter lido, compreendido e concordado integralmente com todas as cláusulas e condições aqui descritas.

E, por estarem assim justos e contratados, as partes assinam o presente instrumento, em formato eletrônico, para que produza seus efeitos legais.

Local e data: ${enderecoResumo(customer)}, ${dataExtensa(contract.createdAt)}.
`;
}

function enderecoResumo(c: Customer): string {
  return `${c.address.city}/${c.address.state}`;
}

function dataExtensa(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function porExtensoNumero(n: number): string {
  // Simplificado — usa apenas extenso para os casos mais comuns de prazo de financiamento
  const nomes: Record<number, string> = {
    1: "uma", 2: "duas", 3: "três", 4: "quatro", 5: "cinco", 6: "seis",
    7: "sete", 8: "oito", 9: "nove", 10: "dez", 11: "onze", 12: "doze",
    18: "dezoito", 24: "vinte e quatro", 36: "trinta e seis", 48: "quarenta e oito", 60: "sessenta",
  };
  return nomes[n] ?? `${n}`;
}

