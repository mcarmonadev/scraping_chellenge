import * as fs from 'fs';
import * as path from 'path';

const DETAILS_DIR = path.resolve(process.cwd(), 'downloads', 'details_html');

export function saveDetailHtml(filenameId: string, htmlContent: string): string {
  if (!fs.existsSync(DETAILS_DIR)) {
    fs.mkdirSync(DETAILS_DIR, { recursive: true });
  }

  // Sanear el nombre del archivo eliminando caracteres no válidos para el SO
  const sanitizedId = filenameId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(DETAILS_DIR, `${sanitizedId}.html`);

  fs.writeFileSync(filePath, htmlContent, 'utf-8');
  return filePath;
}