import { PDFDocument, rgb, StandardFonts, PDFPage } from "pdf-lib";

export interface ExtratoLancamento {
  data: string;       // dd/mm/aaaa
  descricao: string;
  tipo: "parcela" | "pagamento";
  valor: number;
  status?: string;
}

export interface ExtratoData {
  clienteNome: string;
  clienteCpf: string;
  geradoEm: string; // dd/mm/aaaa
  totalContratado: number;
  totalPago: number;
  saldoDevedor: number;
  lancamentos: ExtratoLancamento[];
}

function fmt(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function drawLine(page: PDFPage, x1: number, y: number, x2: number, color = rgb(0.88, 0.88, 0.88)) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.5, color });
}

export async function gerarPDFExtrato(data: ExtratoData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const W = 595;
  const H = 842;
  const margin = 50;
  const textW = W - margin * 2;

  const blue = rgb(0.23, 0.51, 0.96);
  const dark = rgb(0.06, 0.08, 0.16);
  const gray = rgb(0.38, 0.45, 0.55);
  const light = rgb(0.95, 0.97, 0.99);
  const green = rgb(0.06, 0.6, 0.4);
  const red = rgb(0.86, 0.2, 0.2);

  let page = pdfDoc.addPage([W, H]);
  let y = H - 50;

  // Cabeçalho
  page.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: blue });
  page.drawText("Financer Auto", { x: margin, y: H - 45, size: 22, font: helveticaBold, color: rgb(1, 1, 1) });
  page.drawText("Extrato do Cliente", { x: margin, y: H - 65, size: 9, font: helvetica, color: rgb(0.7, 0.85, 1) });
  page.drawText(data.clienteNome, { x: W - margin - 250, y: H - 45, size: 11, font: helveticaBold, color: rgb(1, 1, 1) });
  page.drawText(`CPF ${data.clienteCpf}  ·  ${data.geradoEm}`, { x: W - margin - 250, y: H - 62, size: 8, font: helvetica, color: rgb(0.7, 0.85, 1) });

  y = H - 110;

  // Resumo
  const colW = textW / 3;
  page.drawRectangle({ x: margin, y: y - 40, width: textW, height: 44, color: light });
  page.drawText("TOTAL CONTRATADO", { x: margin + 10, y: y - 12, size: 7, font: helveticaBold, color: gray });
  page.drawText(fmt(data.totalContratado), { x: margin + 10, y: y - 28, size: 12, font: helveticaBold, color: dark });

  page.drawText("TOTAL PAGO", { x: margin + colW + 10, y: y - 12, size: 7, font: helveticaBold, color: gray });
  page.drawText(fmt(data.totalPago), { x: margin + colW + 10, y: y - 28, size: 12, font: helveticaBold, color: green });

  page.drawText("SALDO DEVEDOR", { x: margin + colW * 2 + 10, y: y - 12, size: 7, font: helveticaBold, color: gray });
  page.drawText(fmt(data.saldoDevedor), { x: margin + colW * 2 + 10, y: y - 28, size: 12, font: helveticaBold, color: data.saldoDevedor > 0 ? red : green });

  y -= 64;

  // Tabela
  page.drawRectangle({ x: margin, y: y - 14, width: textW, height: 18, color: blue });
  page.drawText("Data",      { x: margin + 8,   y: y - 10, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  page.drawText("Descrição", { x: margin + 70,  y: y - 10, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  page.drawText("Status",    { x: margin + 330, y: y - 10, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  page.drawText("Valor",     { x: margin + 420, y: y - 10, size: 8, font: helveticaBold, color: rgb(1, 1, 1) });
  y -= 22;

  let i = 0;
  for (const l of data.lancamentos) {
    if (y < 60) {
      page = pdfDoc.addPage([W, H]);
      y = H - 60;
    }
    const rowBg = i % 2 === 0 ? light : rgb(1, 1, 1);
    page.drawRectangle({ x: margin, y: y - 12, width: textW, height: 16, color: rowBg });
    page.drawText(l.data, { x: margin + 8, y: y - 8, size: 8, font: helvetica, color: dark });
    page.drawText(l.descricao.slice(0, 48), { x: margin + 70, y: y - 8, size: 8, font: helvetica, color: dark });
    page.drawText(l.status ?? "", { x: margin + 330, y: y - 8, size: 8, font: helvetica, color: gray });
    const valorCor = l.tipo === "pagamento" ? green : dark;
    const prefixo = l.tipo === "pagamento" ? "+ " : "";
    page.drawText(`${prefixo}${fmt(l.valor)}`, { x: margin + 420, y: y - 8, size: 8, font: helvetica, color: valorCor });
    y -= 16;
    i++;
  }

  y -= 5;
  drawLine(page, margin, y, W - margin);

  return pdfDoc.save();
}
