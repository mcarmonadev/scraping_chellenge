import { parseArgs } from 'node:util';
import { type CliOptions } from '../types/index.js'; // Importa el tipo centralizado

function isValidDateFormat(dateString: string): boolean {
  // 1. Validar el patrón gráfico DD/MM/AAAA
  const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const match = dateString.match(dateRegex);

  if (!match) return false;

  // 2. Extraer y asegurar cadenas no nulas mediante desestructuración
  const [, dayStr = '', monthStr = '', yearStr = ''] = match;

  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10);
  const year = parseInt(yearStr, 10);

  // 3. Validar rangos calendáricos reales
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const dateObj = new Date(year, month - 1, day);
  return (
    dateObj.getFullYear() === year &&
    dateObj.getMonth() === month - 1 &&
    dateObj.getDate() === day
  );
}

export function parseCliArguments(): CliOptions {
  const { values } = parseArgs({
    options: {
      date: { type: 'string', short: 'd' },
      processId: { type: 'string', short: 'p' },
      limit: { type: 'string', short: 'l', default: '3' },
    },
    strict: true,
  });

  if (!values.date && !values.processId) {
    console.error('❌ Error: Debes proporcionar al menos un parámetro: --date (-d) o --processId (-p).');
    process.exit(1);
  }

  if (values.date && !isValidDateFormat(values.date)) {
    console.error(`❌ Error: El parámetro de fecha "${values.date}" debe tener el formato DD/MM/AAAA.`);
    process.exit(1);
  }

  return {
    date: values.date,
    processId: values.processId,
    limit: values.limit ? parseInt(values.limit, 10) : 3,
  };
}