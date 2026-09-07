import { ResilientHttpClient } from '../clients/httpClient.js';
import { TableParser } from '../parsers/TableParser.js';
import { type DocumentItem } from '../types.js';
import { ProcesoDetalleService } from './ProcesoDetalleService.js';
//import fs from 'fs'; // Asegúrate de tener la importación si no está arriba
import { AttachedHtmlDocScraper } from './AttachedHtmlDocScraper.js'
import { CookieManager } from '../utils/cookieManager.js';
import { PdfDownloaderService } from './PdfDownloaderService.js'
import { ScrapingOutputManager } from './ScrapingOutputManager.js'; 

type ScrapingQueryType = 'BY_DATE' | 'BY_PROCESS_ID';

export interface ScrapeOptions {
  paramValue: string;    // Fecha en formato DD/MM/AAAA (ej: "21/08/2026") o Número de expediente/proceso (ej: "0000000-00.2026.4.05.0000")
  limit?: number;  // Tamaño de muestra (ej: 3, 5, 10 o los 30)
  queryType: ScrapingQueryType;
}

export interface ScrapeDateParams {
  date: string;    // Fecha en formato DD/MM/AAAA (ej: "21/08/2026")
  limit?: number;  // Tamaño de muestra (ej: 3, 5, 10 o los 30)
}

export interface ScrapeProcessParams {
  processId: string; // Número de expediente/proceso (ej: "0000000-00.2026.4.05.0000")
}

export interface ScrapingResult {
  queriedParam: string;
  totalFound: number;
  processedCount: number;
  documents: DocumentItem[];
}

export class ScraperService {
  private httpClient: ResilientHttpClient;
  private procesoDetalleService: ProcesoDetalleService;  
  private htmlDocScraper: AttachedHtmlDocScraper;
  private pdfDownloader: PdfDownloaderService;  
  private outputManager: ScrapingOutputManager;

  constructor(baseUrl: string) {
    this.httpClient = new ResilientHttpClient(baseUrl);
    this.procesoDetalleService = new ProcesoDetalleService(this.httpClient);    
    this.htmlDocScraper = new AttachedHtmlDocScraper(this.httpClient);
    this.pdfDownloader = new PdfDownloaderService(this.httpClient);
    this.outputManager = new ScrapingOutputManager();
  }
  /**
   * Búsqueda por FECHA ( Rango de un solo día)
   */
  public async scrapeByDate(options: ScrapeDateParams): Promise<ScrapingResult> {
    const { date, limit = 30 } = options;
    console.log(`🚀 Iniciando consulta para la fecha: ${date} (Límite muestra: ${limit})...`);
    //const [dia, mes, anio] = date.split('/');    const mesAnio = `${mes}/${anio}`;
    const executionOptions: ScrapeOptions = {
      paramValue: date,
      queryType: 'BY_DATE',
      limit
    };
    return await this.doScraping(executionOptions);
  }
  /**
   * Búsqueda por NÚMERO DE PROCESO
   */
  public async scrapeByProcessId(options: ScrapeProcessParams): Promise<ScrapingResult> {
    const { processId } = options;
    const executionOptions: ScrapeOptions = {
      paramValue: processId,
      queryType: 'BY_PROCESS_ID',
      limit: 1
    };
    console.log(`🚀 Iniciando consulta por Número de Proceso: ${processId}...`);

    return await this.doScraping(executionOptions);
  }
  
  public async doScraping(options: ScrapeOptions): Promise<ScrapingResult> {

    const { limit } = options;    

    // 🚀 Instanciar el gestor central de la ejecución
    console.log(`🚀 Iniciando corrida ID: ${this.outputManager.generateExecutionId(options.queryType, options.paramValue)}`);

    // 1. Obtener la página inicial para extraer el ViewState e inicalizar la sesión y sus coockies
    const initialResponse = await this.httpClient.get('/pjeconsulta/ConsultaPublica/listView.seam', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const initialHtml = initialResponse.data as string;
    const viewState = TableParser.extractViewState(initialHtml);

    if (!viewState) {
      throw new Error('No se pudo extraer el ViewState inicial de la página.');
    }
    console.log(`🔑 ViewState obtenido exitosamente.`);

    const params = this.initalizateSearchParams(options, viewState);

    const cookies = initialResponse.headers['set-cookie'];
    const cookieHeader = cookies ? cookies.map((c) => c.split(';')[0]).join('; ') : '';
    CookieManager.getInstance().setCookies(cookieHeader);

    //Ejecutar la petición POST de búsqueda
    console.log(`📡 Enviando POST de búsqueda ${options.queryType}...`);
    const activeCookies = CookieManager.getInstance().getCookies();

    let searchResponse: any;
        try {    
          searchResponse = await this.httpClient.post(
          '/pjeconsulta/ConsultaPublica/listView.seam',
          params.toString(),
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'Faces-Request': 'partial/ajax',
              'Cookie': activeCookies,
            },
          }
        );
    } catch (error: any) {
      const isNetworkError =
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.message?.includes('timeout') ||
        error.message?.includes('Network Error');

      if (isNetworkError) {
        console.error('\n❌ Error de Conexión: No se pudo establecer comunicación con el servidor del PJe.');
        console.error('💡 Sugerencia: Verifica que tu VPN esté activa y conectada correctamente.\n');
      } else {
        console.error('💥 Error durante la petición POST de búsqueda:', error.message || error);
      }
      process.exit(1);
    }

    const searchResultHtml = searchResponse.data as string;

    if (!TableParser.tieneResultadosValidos(searchResultHtml)) {
      console.log(`ℹ️  El expediente ${"numeroExpediente"} no existe o no hay resultados para el día utilizado como parámetro de búsqueda.`);
      //return []; // Interrumpe el flujo; no procesa ni descarga nada.
      process.exit(0)
    }

    
    // Parsear los resultados con TableParser
    const allFoundExpedients = TableParser.parseTableResults(searchResultHtml);
    console.log(`📌 Se encontraron ${allFoundExpedients.length} expediente(s) en la tabla.`);

    // Aplicar la muestra según el límite configurado
    const selectedExpedients = allFoundExpedients.slice(0, limit);
    console.log(`✂️ Procesando muestra acotada de ${selectedExpedients.length} expediente(s).`);

    // Guardar fotografía del listado inicial
    this.outputManager.setListadoInicial(selectedExpedients);

    // Extraer via scrapping detalles de los expedientes incluyendo lista de documentos de cada expediente
    const detallesExtraidos = await this.procesoDetalleService.scrapAllExpedientsDetails(selectedExpedients, this.outputManager);

    // ITERACIÓN Y DESCARGA DE PDFS DE DOCUMENTOS
    const failedDocuments: any[] = [];
    // Calcular el total global de documentos a procesar, para imprimir el progreso en curso
    const totalDocumentosGlobal = detallesExtraidos.reduce((acumulado, caso) => { return acumulado + (caso.documentos ? caso.documentos.length : 0);}, 0);
    console.log(`\n🌍 Se procesarán ${totalDocumentosGlobal} documento(s) en total distribuidos en ${detallesExtraidos.length} expediente(s).\n`);
    let docCounter = 0; // Contador incremental global

    for (let i = 0; i < detallesExtraidos.length; i++) {//Iteración por cada Expediente
      const caso = detallesExtraidos[i]!;
      const processNumber = caso.processNumber || selectedExpedients[i]?.processNumber || `CASO_${i + 1}`;

      if (!caso.documentos || caso.documentos.length === 0) {
        console.log(`⚠️ El expediente ${processNumber} no registra documentos adjuntos.`);
        continue;
      }

      console.log(`\n\n📑 Procesando ${caso.documentos.length} documento(s) para el expediente: ${processNumber}`);
      
      //fs.writeFileSync('./downloads/ZZZ_.json', JSON.stringify(caso.documentos, null, 4))

      for (const doc of caso.documentos) {
        docCounter++;
        const progressTag = `[${docCounter}/${totalDocumentosGlobal}]`;
        console.log(`\n\n🌐 Procesando documento: ${progressTag} - (${doc.formatoDocumento}) Procesando documento: "${doc.titulo}" \n`);

        try {
          /**
           * Procesa los documentos iterando del listado de documentos adjuntos del expediente 
           * Descarga documentos PDF desde 2 casos:
           *  A) Si el formato del doc es un documento HTML (REPORTE_HTML) debe hacerle scraping al archivo html como si clickease el documento en ui
           *        porque el documento html tiene un botón "GERAR PDF" donde un atributo contiene los parámetros para descarga su versión PDF
           *      
           *    El scraping de la versión html el archivo ser realiza mediante el método this.htmlDocScraper.scrapDocumentHtmlFile
           * 
           *    Si lograr obtener su contenido html éxitosamente, ya puede ir con esos parámetros a descargar el PDF mediante pdfDownloader.downloadPdfFromHtml
           * 
           *  B) Si es el formato del doc es PDF desde a este punto ya viene indicado y ya se habia scrapeado antes la url necesaria para 
           *      ir a descargarlo, esa url se obtuvo desde la ui del expdiente en el listado, asi que ya lo podemos
           *      descargar mediante this.pdfDownloader.downloadPdfFromURL 
           * 
           *  El outputManager recibirá información sobre los fallos que hayan, por eso es pasado como parámetro en los 2 ambos casos (3 llamadas)
           */

          if(doc.formatoDocumento==="ARCHIVO_PDF"){          

              const resPdf = await this.pdfDownloader.downloadPdfFromURL(processNumber, doc, this.outputManager);
              if (resPdf.success && resPdf.filePath) {
                console.log(`   ✅ PDF guardado exitosamente en: ${resPdf.filePath}`);
                doc.urlPdf = resPdf.filePath;
              } else {
                console.error(`   ❌ Falló la descarga de PDF para "${doc.titulo}": ${resPdf.error}`);
                failedDocuments.push({
                  processNumber,
                  documentId: doc.id,
                  documentTitle: doc.titulo,
                  failedAt: new Date().toISOString(),
                  lastError: resPdf.error || 'Fallo al descargar PDF binario'
                });
              }                        

          }else{// Es REPORTE_HTML
              // Paso A: Obtener HTML del documento intermedio
              const resDocHtml = await this.htmlDocScraper.scrapDocumentHtmlFile(processNumber, doc, this.outputManager);                 
              if (!resDocHtml.success || !resDocHtml.htmlContent) {
                failedDocuments.push({
                  processNumber,
                  documentId: doc.id,
                  documentTitle: doc.titulo,
                  failedAt: new Date().toISOString(),
                  lastError: resDocHtml.error || 'Error obteniendo HTML intermedio'
                });
                continue;
              }          
              // Paso B: Descargar el PDF usando el HTML obtenido directamente en memoria
              const resPdf =  await this.pdfDownloader.downloadPdfFromHtml(processNumber, doc, resDocHtml.htmlContent, this.outputManager);
              if (resPdf.success && resPdf.filePath) {
                console.log(`   ✅ PDF guardado exitosamente en: ${resPdf.filePath}`);
                doc.urlPdf = resPdf.filePath;
              } else {
                console.error(`   ❌ Falló la descarga de PDF para "${doc.titulo}": ${resPdf.error}`);
                failedDocuments.push({
                  processNumber,
                  documentId: doc.id,
                  documentTitle: doc.titulo,
                  failedAt: new Date().toISOString(),
                  lastError: resPdf.error || 'Fallo al descargar PDF binario'
                });
              }
          }
        } catch (error: any) {
          console.error(`   💥 Excepción capturada en documento "${doc.titulo}": ${error.message || error}`);
          failedDocuments.push({
            processNumber,
            documentId: doc.id,
            documentTitle: doc.titulo,
            failedAt: new Date().toISOString(),
            lastError: error.message || 'Error inesperado durante la descarga'
          });
        }
      }

    }

    //CONSOLIDAR REPORTES FINALES (Genera el JSON consolidado y los CSV)
    await this.outputManager.guardarReportesFinales();

    return {
      queriedParam: options.paramValue,
      totalFound: allFoundExpedients.length,
      processedCount: selectedExpedients.length, //estos corresponden al descarte por el parámetro limit
      documents: selectedExpedients,
    };
  }  


  public initalizateSearchParams(options: ScrapeOptions, viewState:string): URLSearchParams{    
    const params = new URLSearchParams();
    
    params.append('AJAXREQUEST', '_viewRoot');
    params.append('fPP', 'fPP');
    params.append('javax.faces.ViewState', viewState);
    params.append('fPP:j_id244', 'fPP:j_id244'); // Acción del botón Pesquisar
    params.append('AJAX:EVENTS_COUNT', '1');

    params.append('autoScroll', '');
    params.append('mascaraProcessoReferenciaRadio', 'on');
    params.append('fPP:j_id162:processoReferenciaInput', '');
    params.append('fPP:dnp:nomeParte', '');
    params.append('fPP:j_id180:nomeAdv', '');
    params.append('fPP:j_id189:classeJudicial', '');
    params.append('fPP:j_id189:sgbClasseJudicial_selection', '');
    params.append('tipoMascaraDocumento', 'on');
    params.append('fPP:dpDec:documentoParte', '');
    params.append('fPP:Decoration:numeroOAB', '');
    params.append('fPP:Decoration:j_id223', '');
    params.append('fPP:Decoration:estadoComboOAB', 'org.jboss.seam.ui.NoSelectionConverter.noSelectionValue');
        
    if(options.queryType==='BY_DATE'){
      
      const { paramValue: date, limit = 30 } = options;      
      console.log(`🚀 Iniciando consulta para la fecha: ${date} (Límite muestra: ${limit})...`);

      // Preparar el Payload AJAX de RichFaces / JSF
      const [dia, mes, anio] = date.split('/');
      const mesAnio = `${mes}/${anio}`;

      // Filtro con la misma fecha en inicio y fin
      params.append('fPP:dataAutuacaoDecoration:dataAutuacaoInicioInputDate', date);
      params.append('fPP:dataAutuacaoDecoration:dataAutuacaoInicioInputCurrentDate', mesAnio);
      params.append('fPP:dataAutuacaoDecoration:dataAutuacaoFimInputDate', date);
      params.append('fPP:dataAutuacaoDecoration:dataAutuacaoFimInputCurrentDate', mesAnio);
      params.append('fPP:numProcesso-inputNumeroProcessoDecoration:numProcesso-inputNumeroProcesso', '');

    }else{//Fallback es BY_PROCESS_ID

      const { paramValue: processId } = options;   
      console.log(`🚀 Iniciando consulta para el expediente: ${processId}`);

      // 1. Obtener la fecha actual del sistema (ej: "09/2026")[cite: 5]
      const ahora = new Date();
      const mesActual = String(ahora.getMonth() + 1).padStart(2, '0'); // Garantiza 2 dígitos (01 a 12)
      const anioActual = ahora.getFullYear();
      const mesAnioActual = `${mesActual}/${anioActual}`;

      // Inyectar las fechas vacías para Date pero con el mes/año actual en CurrentDate      
      // Filtro con la misma fecha en inicio y fin, es un requisito en el 
      // endpoint, si el filtro es id-proceso, de lo contrario trae algo asi como 'todos los registros'
      // Eso para CurrentDate, lo otros de fecha InputDate, son los que permanecen vacíos
      params.append('fPP:dataAutuacaoDecoration:dataAutuacaoInicioInputDate', '');
      params.append('fPP:dataAutuacaoDecoration:dataAutuacaoInicioInputCurrentDate', mesAnioActual);
      params.append('fPP:dataAutuacaoDecoration:dataAutuacaoFimInputDate', '');
      params.append('fPP:dataAutuacaoDecoration:dataAutuacaoFimInputCurrentDate', mesAnioActual);
      params.append('fPP:numProcesso-inputNumeroProcessoDecoration:numProcesso-inputNumeroProcesso', processId);

    }

    return params

  }  

}
