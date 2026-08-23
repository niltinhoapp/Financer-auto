import { PDFDocument, rgb, StandardFonts, PDFPage } from "pdf-lib";
import { formatCurrency as fmt } from "@/lib/utils";

interface ContratoData {
  // Contrato
  contratoId: string;
  dataContrato: string;
  // Cliente
  clienteNome: string;
  clienteCpf: string;
  clienteRg?: string;
  clienteTelefone?: string;
  clienteEmail?: string;
  clienteEndereco?: string;
  // Veículo
  veiculoMarca: string;
  veiculoModelo: string;
  veiculoAno: number | string;
  veiculoPlaca: string;
  veiculoChassi?: string;
  veiculoCor?: string;
  veiculoKm?: number;
  // Financeiro
  valorVenda: number;
  entrada: number;
  valorFinanciado: number;
  numeroParcelas: number;
  valorParcela: number;
  taxaMensal: number;
  multa: number;
  jurosDiario: number;
  primeiroVencimento: string;
  // Trade-in (opcional)
  tradeIn?: {
    marca: string;
    modelo: string;
    ano: string;
    placa: string;
    valor: number;
  };
  // Cronograma
  cronograma: { numero: number; vencimento: string; valor: number }[];
  // Notas
  notas?: string;
}

function drawLine(page: PDFPage, x1: number, y: number, x2: number, color = rgb(0.88, 0.88, 0.88)) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.5, color });
}

export async function gerarPDFContrato(data: ContratoData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const W = 595;  // A4
  const H = 842;
  const margin = 50;
  const textW = W - margin * 2;

  const blue = rgb(0.23, 0.51, 0.96);
  const dark = rgb(0.06, 0.08, 0.16);
  const gray = rgb(0.38, 0.45, 0.55);
  const light = rgb(0.95, 0.97, 0.99);

  // ── Página 1 ──────────────────────────────────────────────────────
  let page = pdfDoc.addPage([W, H]);
  let y = H - 50;

  // Cabeçalho
  page.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: blue });
  page.drawText("Financer Auto", { x: margin, y: H - 45, size: 22, font: helveticaBold, color: rgb(1, 1, 1) });
  page.drawText("Gestão de Revendas com Financiamento Próprio", { x: margin, y: H - 65, size: 9, font: helvetica, color: rgb(0.7, 0.85, 1) });
  page.drawText(`Contrato #${data.contratoId.slice(0, 10).toUpperCase()}`, { x: W - margin - 150, y: H - 45, size: 10, font: helveticaBold, color: rgb(1, 1, 1) });
  page.drawText(data.dataContrato, { x: W - margin - 150, y: H - 65, size: 9, font: helvetica, color: rgb(0.7, 0.85, 1) });

  y = H - 110;

  // Título
  page.drawText("CONTRATO DE COMPRA E VENDA COM FINANCIAMENTO", {
    x: margin, y, size: 12, font: helveticaBold, color: dark,
  });
  y -= 20;
  drawLine(page, margin, y, W - margin);
  y -= 20;

  // ── Seção: Cliente ─────────────────────────────────────────────────
  function section(title: string) {
    page.drawRectangle({ x: margin, y: y - 2, width: textW, height: 18, color: light });
    page.drawText(title, { x: margin + 6, y, size: 9, font: helveticaBold, color: blue });
    y -= 20;
  }

  function row(label: string, value: string, col2 = false) {
    const labelX = col2 ? margin + textW / 2 : margin;
    const valueX = col2 ? margin + textW / 2 + 90 : margin + 90;
    page.drawText(label + ":", { x: labelX, y, size: 8, font: helveticaBold, color: gray });
    page.drawText(value, { x: valueX, y, size: 8, font: helvetica, color: dark });
    if (!col2) y -= 14;
  }

  section("DADOS DO CLIENTE");
  row("Nome", data.clienteNome); row("CPF", data.clienteCpf);
  if (data.clienteRg) row("RG", data.clienteRg);
  if (data.clienteTelefone) { row("Telefone", data.clienteTelefone); }
  if (data.clienteEmail) row("Email", data.clienteEmail);
  if (data.clienteEndereco) row("Endereço", data.clienteEndereco);
  y -= 10;

  // ── Seção: Veículo ─────────────────────────────────────────────────
  section("DADOS DO VEÍCULO");
  row("Marca/Modelo", `${data.veiculoMarca} ${data.veiculoModelo}`);
  row("Ano", String(data.veiculoAno));
  row("Placa", data.veiculoPlaca);
  if (data.veiculoChassi) row("Chassi", data.veiculoChassi);
  if (data.veiculoCor) row("Cor", data.veiculoCor);
  if (data.veiculoKm != null) row("Quilometragem", `${data.veiculoKm.toLocaleString("pt-BR")} km`);
  y -= 10;

  // ── Seção: Financiamento ───────────────────────────────────────────
  section("CONDIÇÕES FINANCEIRAS");
  row("Valor de Venda", fmt(data.valorVenda));
  row("Entrada", fmt(data.entrada));
  if (data.tradeIn) row("Trade-in", `${data.tradeIn.marca} ${data.tradeIn.modelo} ${data.tradeIn.ano} — ${fmt(data.tradeIn.valor)}`);
  row("Valor Financiado", fmt(data.valorFinanciado));
  row("Nº de Parcelas", `${data.numeroParcelas}x de ${fmt(data.valorParcela)}`);
  row("Taxa de Juros", `${data.taxaMensal}% a.m.`);
  row("Multa por Atraso", `${data.multa}%`);
  row("Juros por Dia", `${data.jurosDiario}% a.d.`);
  row("1º Vencimento", data.primeiroVencimento);
  y -= 10;

  if (data.notas) {
    section("OBSERVAÇÕES");
    page.drawText(data.notas.slice(0, 200), { x: margin, y, size: 8, font: helvetica, color: dark, maxWidth: textW });
    y -= 20;
  }

  // ── Assinaturas ───────────────────────────────────────────────────
  y -= 30;
  if (y < 120) {
    page = pdfDoc.addPage([W, H]);
    y = H - 60;
  }

  drawLine(page, margin, y, W - margin);
  y -= 8;
  page.drawText("Ao assinar este contrato, as partes declaram estar de acordo com todas as cláusulas e condições acima estabelecidas.", {
    x: margin, y, size: 7, font: helvetica, color: gray, maxWidth: textW,
  });
  y -= 30;

  const sigW = (textW - 40) / 2;
  drawLine(page, margin, y, margin + sigW, dark);
  drawLine(page, W - margin - sigW, y, W - margin, dark);
  y -= 12;
  page.drawText("Vendedor / Representante", { x: margin, y, size: 7, font: helvetica, color: gray });
  page.drawText(`Cliente: ${data.clienteNome}`, { x: W - margin - sigW, y, size: 7, font: helvetica, color: gray });

  // ── Página 2: Cronograma ──────────────────────────────────────────
  if (data.cronograma.length > 0) {
    page = pdfDoc.addPage([W, H]);
    y = H - 50;

    page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: blue });
    page.drawText("Financer Auto", { x: margin, y: H - 35, size: 16, font: helveticaBold, color: rgb(1, 1, 1) });
    page.drawText("Cronograma de Parcelas", { x: margin, y: H - 55, size: 10, font: helvetica, color: rgb(0.7, 0.85, 1) });
    page.drawText(`Contrato #${data.contratoId.slice(0, 10).toUpperCase()}`, { x: W - margin - 130, y: H - 45, size: 9, font: helveticaBold, color: rgb(1, 1, 1) });

    y = H - 90;

    // Cabeçalho da tabela
    page.drawRectangle({ x: margin, y: y - 14, width: textW, height: 18, color: blue });
    page.drawText("#",          { x: margin + 8,  y: y - 10, size: 8, font: helveticaBold, color: rgb(1,1,1) });
    page.drawText("Vencimento", { x: margin + 40, y: y - 10, size: 8, font: helveticaBold, color: rgb(1,1,1) });
    page.drawText("Valor",      { x: margin + 140,y: y - 10, size: 8, font: helveticaBold, color: rgb(1,1,1) });
    page.drawText("Status",     { x: margin + 220,y: y - 10, size: 8, font: helveticaBold, color: rgb(1,1,1) });
    y -= 22;

    for (const p of data.cronograma) {
      if (y < 60) {
        page = pdfDoc.addPage([W, H]);
        y = H - 60;
      }
      const rowBg = p.numero % 2 === 0 ? light : rgb(1, 1, 1);
      page.drawRectangle({ x: margin, y: y - 12, width: textW, height: 16, color: rowBg });
      page.drawText(String(p.numero),      { x: margin + 8,  y: y - 8, size: 8, font: helvetica, color: dark });
      page.drawText(p.vencimento,          { x: margin + 40, y: y - 8, size: 8, font: helvetica, color: dark });
      page.drawText(fmt(p.valor),          { x: margin + 140,y: y - 8, size: 8, font: helvetica, color: dark });
      page.drawText("□ Pendente",          { x: margin + 220,y: y - 8, size: 8, font: helvetica, color: gray });
      y -= 16;
    }

    // Total
    y -= 5;
    drawLine(page, margin, y, W - margin);
    y -= 14;
    page.drawText(`Total: ${fmt(data.cronograma.reduce((a, p) => a + p.valor, 0))}`, {
      x: margin + 140, y, size: 9, font: helveticaBold, color: blue,
    });
  }

  return pdfDoc.save();
}
