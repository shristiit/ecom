import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { PO, SO } from '@admin/features/shared';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

type PdfSummaryItem = {
  label: string;
  value: string;
};

type PdfTable = {
  headers: string[];
  rows: string[][];
  numericColumns: number[];
};

type PdfTotal = {
  label: string;
  value: string;
  strong?: boolean;
};

type PdfDocumentModel = {
  title: string;
  generatedLabel: string;
  status: string;
  summary: PdfSummaryItem[];
  table: PdfTable;
  totals: PdfTotal[];
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return money.format(amount);
  }
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

function buildSalesOrderModel(order: SO): PdfDocumentModel {
  return {
    title: `Sales Order ${order.number}`,
    generatedLabel: `Generated ${formatDate(new Date().toISOString())}`,
    status: order.status,
    summary: [
      { label: 'Customer', value: order.customerName },
      { label: 'Created', value: formatDate(order.createdAt) },
      { label: 'Currency', value: order.currency },
    ],
    table: {
      headers: ['SKU', 'Qty', 'Unit price', 'Line total'],
      rows: order.lines.map((line) => [
        line.sku,
        String(line.qty),
        formatCurrency(Number(line.unitPrice ?? 0), order.currency),
        formatCurrency(line.qty * Number(line.unitPrice ?? 0), order.currency),
      ]),
      numericColumns: [1, 2, 3],
    },
    totals: [
      { label: 'Subtotal', value: formatCurrency(order.subtotal, order.currency) },
      { label: 'Tax', value: formatCurrency(order.tax, order.currency) },
      { label: 'Total', value: formatCurrency(order.total, order.currency), strong: true },
    ],
  };
}

function buildPurchaseOrderModel(order: PO): PdfDocumentModel {
  const total = Number(order.totalCost ?? order.lines.reduce((sum, line) => sum + line.qtyOrdered * Number(line.unitCost ?? 0), 0));

  return {
    title: `Purchase Order ${order.number}`,
    generatedLabel: `Generated ${formatDate(new Date().toISOString())}`,
    status: order.status,
    summary: [
      { label: 'Supplier', value: order.supplierName },
      { label: 'Ordered', value: formatDate(order.orderedAt) },
      { label: 'Expected', value: formatDate(order.expectedAt) },
      { label: 'Currency', value: order.currency },
    ],
    table: {
      headers: ['SKU', 'Ordered', 'Received', 'Unit cost', 'Line total'],
      rows: order.lines.map((line) => [
        line.sku,
        String(line.qtyOrdered),
        String(line.qtyReceived),
        formatCurrency(Number(line.unitCost ?? 0), order.currency),
        formatCurrency(line.qtyOrdered * Number(line.unitCost ?? 0), order.currency),
      ]),
      numericColumns: [1, 2, 3, 4],
    },
    totals: [{ label: 'Total', value: formatCurrency(total, order.currency), strong: true }],
  };
}

function buildHtmlFromModel(model: PdfDocumentModel) {
  const rows = model.table.rows
    .map(
      (row) => `
        <tr>
          ${row
            .map(
              (cell, index) =>
                `<td class="${model.table.numericColumns.includes(index) ? 'num' : ''}">${escapeHtml(cell)}</td>`,
            )
            .join('')}
        </tr>`,
    )
    .join('');

  const cards = model.summary
    .map(
      (item) => `
        <div class="card">
          <div class="label">${escapeHtml(item.label)}</div>
          <div class="value">${escapeHtml(item.value)}</div>
        </div>`,
    )
    .join('');

  const totals = model.totals
    .map(
      (item) => `
        <div class="totals-row${item.strong ? ' total' : ''}">
          <span>${escapeHtml(item.label)}</span>
          <span>${escapeHtml(item.value)}</span>
        </div>`,
    )
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; padding: 32px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
          .title { font-size: 28px; font-weight: 700; margin: 0; }
          .muted { color: #64748b; font-size: 12px; }
          .pill { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #e2e8f0; font-size: 12px; font-weight: 600; text-transform: capitalize; }
          .grid { display: grid; grid-template-columns: repeat(${Math.max(1, Math.min(model.summary.length, 4))}, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px; }
          .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #fff; }
          .label { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
          .value { font-size: 16px; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 8px; font-size: 13px; text-align: left; }
          th { color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
          .num { text-align: right; }
          .totals { margin-top: 18px; margin-left: auto; width: 280px; }
          .totals-row { display: flex; justify-content: space-between; padding: 6px 0; }
          .totals-row.total { font-weight: 700; font-size: 15px; border-top: 1px solid #cbd5e1; margin-top: 6px; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">${escapeHtml(model.title)}</h1>
            <div class="muted">${escapeHtml(model.generatedLabel)}</div>
          </div>
          <span class="pill">${escapeHtml(model.status)}</span>
        </div>

        <div class="grid">${cards}</div>

        <table>
          <thead>
            <tr>${model.table.headers
              .map(
                (header, index) =>
                  `<th class="${model.table.numericColumns.includes(index) ? 'num' : ''}">${escapeHtml(header)}</th>`,
              )
              .join('')}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="totals">${totals}</div>
      </body>
    </html>`;
}

export async function downloadSalesOrderPdf(order: SO) {
  const model = buildSalesOrderModel(order);
  await exportPdf(model, `sales-order-${order.number}`);
}

export async function downloadPurchaseOrderPdf(order: PO) {
  const model = buildPurchaseOrderModel(order);
  await exportPdf(model, `purchase-order-${order.number}`);
}

async function exportPdf(model: PdfDocumentModel, baseFileName: string) {
  if (Platform.OS === 'web') {
    await downloadPdfOnWeb(model, baseFileName);
    return;
  }

  const html = buildHtmlFromModel(model);
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share ${baseFileName}.pdf`,
      UTI: 'com.adobe.pdf',
    });
  }
}

async function downloadPdfOnWeb(model: PdfDocumentModel, baseFileName: string) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf/dist/jspdf.es.min.js'),
    import('jspdf-autotable/es'),
  ]);

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const rightColumnX = pageWidth - 56;
  let cursorY = 56;

  pdf.setFillColor(15, 76, 92);
  pdf.rect(0, 0, pageWidth, 112, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(24);
  pdf.text(model.title, 48, 58);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  if (model.generatedLabel) {
    pdf.text(model.generatedLabel, 48, 78);
  }

  if (model.status) {
    const pillWidth = pdf.getTextWidth(model.status) + 24;
    pdf.setFillColor(226, 232, 240);
    pdf.roundedRect(rightColumnX - pillWidth, 42, pillWidth, 24, 12, 12, 'F');
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(model.status, rightColumnX - pillWidth + 12, 58);
  }

  cursorY = 136;
  pdf.setTextColor(15, 23, 42);

  const columns = Math.max(1, Math.min(model.summary.length, 4));
  const gap = 12;
  const cardWidth = (pageWidth - 48 * 2 - gap * (columns - 1)) / columns;

  model.summary.forEach((card, index) => {
    const x = 48 + index * (cardWidth + gap);
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(x, cursorY, cardWidth, 62, 12, 12, 'FD');
    pdf.setTextColor(100, 116, 139);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(card.label.toUpperCase(), x + 12, cursorY + 18);
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text(card.value || '-', x + 12, cursorY + 40, { maxWidth: cardWidth - 24 });
  });

  autoTable(pdf, {
    startY: cursorY + 88,
    head: [model.table.headers],
    body: model.table.rows,
    theme: 'grid',
    margin: { left: 48, right: 48 },
    styles: {
      font: 'helvetica',
      fontSize: 10,
      cellPadding: 8,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 1,
    },
    headStyles: {
      fillColor: [240, 245, 253],
      textColor: [71, 85, 105],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: model.table.headers.reduce<Record<number, { halign?: 'left' | 'right' }>>((styles, _header, index) => {
      styles[index] = { halign: model.table.numericColumns.includes(index) ? 'right' : 'left' };
      return styles;
    }, {}),
  });

  let totalsY = (pdf as any).lastAutoTable?.finalY ? (pdf as any).lastAutoTable.finalY + 20 : cursorY + 220;
  model.totals.forEach((row) => {
    pdf.setFont('helvetica', row.strong ? 'bold' : 'normal');
    pdf.setFontSize(row.strong ? 12 : 11);
    pdf.text(row.label, pageWidth - 240, totalsY);
    pdf.text(row.value, rightColumnX, totalsY, { align: 'right' });
    totalsY += row.strong ? 18 : 14;
  });

  pdf.save(`${baseFileName}.pdf`);
}
