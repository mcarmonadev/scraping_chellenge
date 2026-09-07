import { ScraperService } from './services/ScraperService.js';

// URL Base del PJe
const BASE_URL = 'https://pjett.trf5.jus.br';

/**
 * Helper sencillo para parsear argumentos de la CLI (--date, --processId, --limit)
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const params: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg?.startsWith('--')) {
      const key = arg.replace(/^--/, '');
      const nextVal = args[i + 1];
      if (nextVal && !nextVal.startsWith('--')) {
        params[key] = nextVal;
        i++;
      } else {
        params[key] = 'true';
      }
    }
  }
  return params;
}

async function main() {
  const args = parseArgs();
  
  //Extraer parámetros aceptando variaciones de nombre común
  const date = args.date || args.fecha || '';
  //const processId = args.processId || args.process || args.proceso;
  //const date = '21/08/2026'//args.date || args.fecha || '';
  const processId = args.processId || args.process || '';
  const limit = args.limit ? parseInt(args.limit, 10) : 3;
  

  if (!date && !processId) {
    console.log(`
                  ⚠️  Debes proporcionar al menos un parámetro de búsqueda.

                      Ejemplos de uso:
                        1. Por fecha:      npm run start -- --date 21/08/2026 --limit 2
                        2. Por proceso:    npm run start -- --processId 0803294-73.2015.4.05.8100 
    `);
    process.exit(1);
  }

  const scraper = new ScraperService(BASE_URL);

  try {
    if (processId) {
      console.log(`🎯 Modo de búsqueda: NÚMERO DE PROCESO (${processId})`);
      const result = await scraper.scrapeByProcessId({ processId });
      console.log(`\n🎉 Finalizado con éxito. Procesados: ${result.processedCount}`);
    } else if (date) {
      console.log(`📅 Modo de búsqueda: FECHA (${date}) | Límite: ${limit}`);
      const result = await scraper.scrapeByDate({ date, limit });
      console.log(`\n🎉 Finalizado con éxito. Procesados: ${result.processedCount} de ${result.totalFound} encontrados.`);
    }
  } catch (error: any) {
    console.error('💥 Error fatal durante la ejecución:', error.message || error);
    process.exit(1);
  }
}

main();