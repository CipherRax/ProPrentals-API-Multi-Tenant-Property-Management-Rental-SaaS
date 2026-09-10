import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface ReceiptPdfData {
  receiptNumber: string;
  issuedAt: Date;
  organizationName: string;
  organizationContactEmail?: string | null;
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  transactionReference?: string | null;
  description: string;
}

export interface StatementPdfData {
  organizationName: string;
  tenantName: string;
  propertyName: string;
  unitNumber: string;
  periodStart: Date;
  periodEnd: Date;
  openingBalance: number;
  closingBalance: number;
  currency: string;
  entries: Array<{
    createdAt: Date;
    entryType: string;
    direction: 'DEBIT' | 'CREDIT';
    amount: number;
    description: string | null;
    runningBalance: number;
  }>;
}

export interface ReportPdfData {
  title: string;
  organizationName: string;
  rows: Record<string, unknown>;
}

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Renders documents server-side with pdfkit and returns a Buffer — no
// intermediate file is written to disk, and nothing is cached (spec
// §46: PDF generation happens server-side; storage is out of scope
// until the file-storage abstraction from spec §45 exists).
@Injectable()
export class PdfService {
  async generateReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
    return this.render((doc) => {
      doc.fontSize(20).text('Payment Receipt', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#555').text(data.organizationName, { align: 'center' });
      if (data.organizationContactEmail) {
        doc.text(data.organizationContactEmail, { align: 'center' });
      }
      doc.moveDown(1.5);
      doc.fillColor('#000');

      doc.fontSize(12);
      const row = (label: string, value: string) => {
        doc.font('Helvetica-Bold').text(label, { continued: true, width: 180 });
        doc.font('Helvetica').text(value);
      };

      row('Receipt Number: ', data.receiptNumber);
      row('Date: ', formatDate(data.issuedAt));
      row('Tenant: ', data.tenantName);
      row('Property: ', data.propertyName);
      row('Unit: ', data.unitNumber);
      row('Payment Method: ', data.paymentMethod);
      if (data.transactionReference) {
        row('Transaction Reference: ', data.transactionReference);
      }
      row('Description: ', data.description);

      doc.moveDown(1);
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(`Amount Paid: ${formatMoney(data.amount, data.currency)}`);

      doc.moveDown(2);
      doc
        .fontSize(9)
        .fillColor('#888')
        .font('Helvetica')
        .text('This receipt was generated automatically by Habita.', { align: 'center' });
    });
  }

  async generateReportPdf(data: ReportPdfData): Promise<Buffer> {
    return this.render((doc) => {
      doc.fontSize(20).text(data.title, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#555').text(data.organizationName, { align: 'center' });
      doc.moveDown(1.5);
      doc.fillColor('#000').fontSize(12);

      const entries = Object.entries(data.rows);
      if (!entries.length) {
        doc.text('No data to report.');
        return;
      }

      const formatValue = (v: unknown): string => {
        if (v === null || v === undefined) return '—';
        if (Array.isArray(v) || (typeof v === 'object' && !(v instanceof Date))) {
          return JSON.stringify(v);
        }
        return String(v);
      };

      for (let i = 0; i < entries.length; i += 1) {
        const [key, value] = entries[i];
        doc
          .font('Helvetica-Bold')
          .text(`${key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}: `, {
            continued: true,
            width: 260,
          });
        doc.font('Helvetica').text(formatValue(value));
        doc.moveDown(0.4);
        if (doc.y > 720) doc.addPage();
      }
    });
  }

  async generateStatementPdf(data: StatementPdfData): Promise<Buffer> {
    return this.render((doc) => {
      doc.fontSize(20).text('Tenant Statement', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#555').text(data.organizationName, { align: 'center' });
      doc.moveDown(1.5);
      doc.fillColor('#000').fontSize(12);

      doc
        .font('Helvetica-Bold')
        .text('Tenant: ', { continued: true })
        .font('Helvetica')
        .text(data.tenantName);
      doc
        .font('Helvetica-Bold')
        .text('Property / Unit: ', { continued: true })
        .font('Helvetica')
        .text(`${data.propertyName} — ${data.unitNumber}`);
      doc
        .font('Helvetica-Bold')
        .text('Period: ', { continued: true })
        .font('Helvetica')
        .text(`${formatDate(data.periodStart)} to ${formatDate(data.periodEnd)}`);

      doc.moveDown(1);
      doc
        .font('Helvetica-Bold')
        .text(`Opening Balance: ${formatMoney(data.openingBalance, data.currency)}`);
      doc.moveDown(1);

      const colX = { date: 50, type: 130, desc: 260, amount: 400, balance: 480 };
      const tableTop = doc.y;
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Date', colX.date, tableTop);
      doc.text('Type', colX.type, tableTop);
      doc.text('Description', colX.desc, tableTop);
      doc.text('Amount', colX.amount, tableTop, { width: 70, align: 'right' });
      doc.text('Balance', colX.balance, tableTop, { width: 70, align: 'right' });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#ccc').stroke();
      doc.moveDown(0.3);

      doc.font('Helvetica').fontSize(9);
      for (const entry of data.entries) {
        const y = doc.y;
        const signedAmount = entry.direction === 'DEBIT' ? entry.amount : -entry.amount;
        doc.text(formatDate(entry.createdAt), colX.date, y, { width: 75 });
        doc.text(entry.entryType, colX.type, y, { width: 125 });
        doc.text(entry.description ?? '', colX.desc, y, { width: 135 });
        doc.text(formatMoney(signedAmount, data.currency), colX.amount, y, {
          width: 70,
          align: 'right',
        });
        doc.text(formatMoney(entry.runningBalance, data.currency), colX.balance, y, {
          width: 70,
          align: 'right',
        });
        doc.moveDown(0.6);

        if (doc.y > 720) {
          doc.addPage();
        }
      }

      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#ccc').stroke();
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(`Closing Balance: ${formatMoney(data.closingBalance, data.currency)}`, {
          align: 'right',
        });
    });
  }

  private render(draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        draw(doc);
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
