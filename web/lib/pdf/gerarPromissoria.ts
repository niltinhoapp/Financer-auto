import { PDFDocument, rgb, StandardFonts, PDFPage } from "pdf-lib";
import { valorPorExtenso } from "./extenso";

export interface PromissoriaParcela {
  numero: number;
  vencimento: string; // dd/mm/aaaa
  valor: number;
}

export interface PromissoriaData {
  contratoId: string;
  cidadeEmissao: string;
  dataEmissao: string; // dd/mm/aaaa

  // Credor (loja / emitente do crédito)
  credorNome: string;
  credorDocumento?: string;
  credorEndereco?: string;

  // Devedor (cliente)
  devedorNome: string;
  devedorCpf: string;
  devedorRg?: string;
  devedorEndereco?: string;

  // Referência ao bem (opcional, contextualiza a dívida)
  veiculoDescricao?: string;

  // Parcelas — uma nota promissória por parcela
  parcelas: PromissoriaParcela[];
}

function fmt(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function drawLine(page: PDFPage, x1: number, y: number, x2: number, color = rgb(0.82, 0.85, 0.9)) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.7, color });
}

/**
 * Gera um PDF com uma nota promissória por parcela informada, no formato
 * tradicional (valor em algarismos e por extenso, vencimento, partes,
 * praça/data de emissão e linhas de assinatura).
 */
export async function gerarPDFPromissorias(data: PromissoriaData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const W = 595; // A4
  const H = 842;
  const margin = 50;
  const textW = W - margin * 2;

  const blue = rgb(0.23, 0.51, 0.96);
  const dark = rgb(0.06, 0.08, 0.16);
  const gray = rgb(0.38, 0.45, 0.55);
  const light = rgb(0.95, 0.97, 0.99);

  const total = data.parcelas.length;

  for (const parcela of data.parcelas) {
    const page = pdfDoc.addPage([W, H]);
    let y = H - 50;

    // Cabeçalho
    page.drawRectangle({ x: 0, y: H - 80, width: W, height: 80, color: blue });
    page.drawText("NOTA PROMISSÓRIA", { x: margin, y: H - 42, size: 20, font: helveticaBold, color: rgb(1, 1, 1) });
    page.drawText(`Nº ${parcela.numero}/${total}  —  Contrato #${data.contratoId.slice(0, 10).toUpperCase()}`, {
      x: margin, y: H - 62, size: 10, font: helvetica, color: rgb(0.7, 0.85, 1),
    });
    page.drawText(fmt(parcela.valor), {
      x: W - margin - 130, y: H - 50, size: 16, font: helveticaBold, color: rgb(1, 1, 1),
    });

    y = H - 110;

    // Valor por extenso em destaque
    page.drawRectangle({ x: margin, y: y - 36, width: textW, height: 40, color: light });
    page.drawText("VALOR", { x: margin + 10, y: y - 12, size: 8, font: helveticaBold, color: blue });
    const extenso = `${valorPorExtenso(parcela.valor)}`;
    page.drawText(extenso.charAt(0).toUpperCase() + extenso.slice(1), {
      x: margin + 10, y: y - 28, size: 11, font: helveticaBold, color: dark, maxWidth: textW - 20,
    });
    y -= 56;

    // Vencimento
    page.drawText("Vencimento:", { x: margin, y, size: 9, font: helveticaBold, color: gray });
    page.drawText(parcela.vencimento, { x: margin + 70, y, size: 9, font: helvetica, color: dark });
    page.drawText(`Parcela ${parcela.numero} de ${total}`, { x: margin + 200, y, size: 9, font: helvetica, color: gray });
    y -= 26;

    // Texto da promissória
    drawLine(page, margin, y, W - margin);
    y -= 22;

    const dataExtenso = data.dataEmissao;
    const linha1 =
      `No dia ${parcela.vencimento}, pagarei(emos) por esta única via de NOTA PROMISSÓRIA, ` +
      `a ${data.credorNome}${data.credorDocumento ? ` (${data.credorDocumento})` : ""}, ou à sua ordem, ` +
      `a quantia de ${fmt(parcela.valor)} (${valorPorExtenso(parcela.valor)}), em moeda corrente nacional.`;

    page.drawText(linha1, { x: margin, y, size: 9, font: helvetica, color: dark, maxWidth: textW, lineHeight: 14 });
    y -= 60;

    if (data.veiculoDescricao) {
      page.drawText(`Referente a: ${data.veiculoDescricao}.`, {
        x: margin, y, size: 9, font: helveticaOblique, color: gray, maxWidth: textW, lineHeight: 13,
      });
      y -= 30;
    }

    page.drawText(
      "Pagável em qualquer lugar, esta nota promissória não admite quaisquer alterações nas cláusulas e " +
      "condições aqui expressas, valendo como título executivo extrajudicial nos termos da legislação aplicável.",
      { x: margin, y, size: 8, font: helvetica, color: gray, maxWidth: textW, lineHeight: 12 }
    );
    y -= 50;

    // Praça e data de emissão
    drawLine(page, margin, y, W - margin);
    y -= 20;
    page.drawText(`${data.cidadeEmissao}, ${dataExtenso}.`, {
      x: margin, y, size: 10, font: helvetica, color: dark,
    });
    y -= 40;

    // ── Dados das partes ──────────────────────────────────────────
    function section(title: string, yy: number) {
      page.drawRectangle({ x: margin, y: yy - 2, width: textW, height: 18, color: light });
      page.drawText(title, { x: margin + 6, y: yy, size: 9, font: helveticaBold, color: blue });
      return yy - 20;
    }
    function row(label: string, value: string, yy: number) {
      page.drawText(label + ":", { x: margin, y: yy, size: 8, font: helveticaBold, color: gray });
      page.drawText(value, { x: margin + 90, y: yy, size: 8, font: helvetica, color: dark, maxWidth: textW - 90 });
      return yy - 14;
    }

    y = section("EMITENTE / DEVEDOR (PROMITENTE PAGADOR)", y);
    y = row("Nome", data.devedorNome, y);
    y = row("CPF", data.devedorCpf, y);
    if (data.devedorRg) y = row("RG", data.devedorRg, y);
    if (data.devedorEndereco) y = row("Endereço", data.devedorEndereco, y);
    y -= 6;

    y = section("CREDOR / FAVORECIDO", y);
    y = row("Nome", data.credorNome, y);
    if (data.credorDocumento) y = row("Documento", data.credorDocumento, y);
    if (data.credorEndereco) y = row("Endereço", data.credorEndereco, y);

    // ── Assinatura ────────────────────────────────────────────────
    y = 90;
    drawLine(page, margin, y, W - margin);
    y -= 8;
    page.drawText("Declaro estar de acordo com o valor, vencimento e condições desta nota promissória.", {
      x: margin, y, size: 7, font: helvetica, color: gray, maxWidth: textW,
    });
    y -= 40;

    const sigW = textW * 0.6;
    const sigX = margin + (textW - sigW) / 2;
    drawLine(page, sigX, y, sigX + sigW, dark);
    y -= 12;
    page.drawText(data.devedorNome, { x: sigX, y, size: 9, font: helveticaBold, color: dark });
    y -= 12;
    page.drawText(`CPF: ${data.devedorCpf}`, { x: sigX, y, size: 8, font: helvetica, color: gray });
  }

  return pdfDoc.save();
}
