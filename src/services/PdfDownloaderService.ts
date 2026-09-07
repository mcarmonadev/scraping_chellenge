import fs from 'fs';
import path from 'path';
import { ResilientHttpClient } from '../clients/httpClient.js';
import { CookieManager } from '../utils/cookieManager.js';
import { type DocumentoAdjunto } from '../types.js';
import querystring from 'querystring';
import * as cheerio from 'cheerio';
import { TimeUtils } from '../utils/timeUtils.js';
import { ScrapingOutputManager } from './ScrapingOutputManager.js';
import { TipoScraping } from '../types/scrapingReport.js';

export interface PdfDownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

  /**
   * Clase que implementa 2 diferentes tipos de descargas de archivos PDF
   *  
   *  Caso 1: Pdf a partir de Documento HTML
   *            Estos son documentos que se renderizan como HTML y tienen un botón "GERAR PDF", 
   *            Este html ya viene de rutinas previas, y viene como input, de ese htmml 
   *            tiene que ser obtenidos los parámetros para realizar este tipo de descarga
   *            ya que trae parámetros dinámicos para la descarga de PDF solo 
   *            disponible en el botón "GERAR PDF" de la ui en el Documento html 
   * 
   *  Caso 2: Pdf descargado de la URL   * 
   *            Este caso es simple, ya la url del PDF está disponible, fué scrapeada sin ningún html intermedio
   *            Esta misma URL ha sido antes scrapeada desde la ui de Detalle del Expediente "Detalhe do Processo"
   *            Esto es llegar y descargar
   * 
   *  Ambos casos regitran el PDF en el directorio establecido por el outputManager, y retornan el error si no lo lograse
   *  En el caso del documento HTML, el contenido también es registrado en el directorio de output en cuestión
   * 
   */
export class PdfDownloaderService {
  private httpClient: ResilientHttpClient;
  private downloadsDir: string;

  constructor(httpClient: ResilientHttpClient, outputDir: string = './downloads/pdfs') {
    this.httpClient = httpClient;
    this.downloadsDir = outputDir;

    /*if (!fs.existsSync(this.downloadsDir)) {
      fs.mkdirSync(this.downloadsDir, { recursive: true });
    }*/
  }

  /**
   * Extrae los parámetros 'ca', 'idProcDocBin' y 'ViewState' del HTML del documento
   * y efectúa la petición POST para descargar el PDF.
   */
  public async downloadPdfFromHtml(
    processNumber: string,
    docMetadata: DocumentoAdjunto,
    documentHtml: string,
    outputManager?: ScrapingOutputManager // 👈 Habilitado para trazabilidad
  ): Promise<PdfDownloadResult> {
    try {
      // 1. Extraer token ca e idProcDocBin con Regex
      const caMatch = documentHtml.match(/'ca':'([^']+)'/);
      const idProcDocBinMatch = documentHtml.match(/'idProcDocBin':'([^']+)'/);

      const ca = caMatch ? caMatch[1] : null;
      const idProcDocBin = idProcDocBinMatch ? idProcDocBinMatch[1] : null;

      // Extraer ViewState local o fallback al general
      //const viewStateMatch = documentHtml.match(/name="javax.faces.ViewState"\s+value="([^"]+)"/);

      // Cargar el HTML descargado en la instancia de Cheerio ($)
      const $ = cheerio.load(documentHtml);

      // Extraer el ViewState del formulario j_id42
      const viewState = $('form#j_id42 input[name="javax.faces.ViewState"]').val() as string;

      if (!ca || !idProcDocBin) {
        throw new Error('No se pudieron extraer los parámetros (ca / idProcDocBin) del botón GERAR PDF.');
      }

      //Espera aleatoria recomendada (Jitter entre 1.2s y 2.5s)
      const tiempoEsperado = await TimeUtils.delay(1050, 1300);
      console.log(`[WAIT] Pausa estratégica de ${tiempoEsperado}ms completada.`);

      // 2. Construir el payload form-urlencoded
      const params = new URLSearchParams();
      params.append('j_id42', 'j_id42');
      params.append('j_id42:downloadPDF', 'j_id42:downloadPDF');
      params.append('ca', ca);
      params.append('idProcDocBin', idProcDocBin);
      params.append('javax.faces.ViewState', viewState||'');

      const activeCookies = CookieManager.getInstance().getCookies();
      //console.log('El conjunto de los params es ', params)
      //console.log('Las activeCookies son ', activeCookies)
        const payload = querystring.stringify({
            'j_id42': 'j_id42',
            'javax.faces.ViewState': viewState||'',
            'j_id42:downloadPDF': 'j_id42:downloadPDF',
            'ca': ca,
            'idProcDocBin': idProcDocBin
        });
      const response = await this.httpClient.axiosInstance.post(
        '/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/documentoSemLoginHTML.seam',
        payload,
        {
          headers: {
            'cookie': activeCookies,
          },
          responseType: 'arraybuffer',
        }
      );

      // 4. Nombre sanitizado para el archivo PDF
      const destinationFolder = outputManager
        ? outputManager.getPdfFolderForProcess(processNumber)
        : this.downloadsDir;

      const sanitizedProc = processNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${sanitizedProc}_doc_${idProcDocBin}.pdf`;
      const fullPath = path.join(destinationFolder, fileName);      

      // 5. Guardar el archivo en disco
      fs.writeFileSync(fullPath, Buffer.from(response.data));


        // 🟢 Registrar éxito en ScrapingOutputManager
        if (outputManager) {
          outputManager.registrarExito({
            tipo: docMetadata.esCertidaoConsolidada ? TipoScraping.PDF_CONSOLIDADO : TipoScraping.PDF_DOCUMENTO,
            numeroProceso: processNumber,
            idProcDocBin: idProcDocBin,
            tituloDocumento: docMetadata.titulo,
            rutaArchivoDescargado: fullPath,
          });
        }

      return {
        success: true,
        filePath: fullPath
      };

    } catch (err: any) {

        const errorMessage = err instanceof Error ? err.message : String(err);

        // 🔴 Registrar fallo en ScrapingOutputManager
        if (outputManager) {
          outputManager.registrarFallo({
            tipo: docMetadata.esCertidaoConsolidada ? TipoScraping.PDF_CONSOLIDADO : TipoScraping.PDF_DOCUMENTO,
            numeroProceso: processNumber,
            idProcDocBin: docMetadata.id,
            mensajeError: errorMessage,
            intentosRealizados: err.config?.['retryCount'] || 1,
            ultimoCodigoHttp: err.response?.status,
            contexto: { processNumber, docMetadata }
          });
        }
      
      return {
        success: false,
        error: err.message || 'Error desconocido al descargar el PDF'
      };
    }
  }

  /**
   * Descarga directamente un documento adjunto de PDF 
   * Realiza una petición GET binaria conservando las cookies activas de la sesión.
   */
  public async downloadPdfFromURL(
    processNumber: string,
    doc: DocumentoAdjunto,
    outputManager?: ScrapingOutputManager
  ): Promise<PdfDownloadResult> {
    // 1. Extraer o normalizar la URL (Si viene relativa /pjeconsulta/..., la concatenamos con la base)
    let targetUrl = doc.urlPdf || '';
    if (targetUrl && !targetUrl.startsWith('http')) {
      const baseUrl = this.httpClient.axiosInstance.defaults.baseURL || 'https://pjett.trf5.jus.br';
      targetUrl = `${baseUrl.replace(/\/$/, '')}/${targetUrl.replace(/^\//, '')}`;
    }

    //Espera aleatoria recomendada (Jitter entre 1.2s y 2.5s)
    const tiempoEsperado = await TimeUtils.delay(1050, 1300);
    console.log(`[WAIT] Pausa estratégica de ${tiempoEsperado}ms completada.`);

    console.log(`[PDF Directo] targetUrl: ${targetUrl}`);
    
    if (!targetUrl) {
      const errorMsg = `No se pudo extraer una URL válida para el PDF directo (ID: ${doc.id})`;

      if (outputManager) {
        outputManager.registrarFallo({
          tipo: TipoScraping.PDF_DOCUMENTO,
          numeroProceso: processNumber,
          idProcDocBin: doc.id,
          mensajeError: errorMsg,
          intentosRealizados: 1,
          contexto: { doc }
        });
      }

      return {
        success: false,
        error: errorMsg,
      };
    }

    // 2. Determinar la carpeta de destino dinámicamente según la ejecución (RUN_...)
    const destinationFolder = outputManager
      ? outputManager.getPdfFolderForProcess(processNumber)
      : path.join('./downloads', 'pdfs', processNumber.replace(/[^a-zA-Z0-9_-]/g, '_'));

    if (!fs.existsSync(destinationFolder)) {
      fs.mkdirSync(destinationFolder, { recursive: true });
    }

    // 3. Formatear el nombre del archivo PDF
    const prefix = doc.esCertidaoConsolidada ? 'CONSOLIDADO_' : 'DOC_';
    const safeTitle = doc.titulo.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 25);
    const fileName = `${prefix}${doc.id}_${safeTitle}.pdf`;
    const filePath = path.join(destinationFolder, fileName);

    try {
      const activeCookies = CookieManager.getInstance().getCookies();

      console.log(`targetUrl!!! `, targetUrl);

      // 4. Petición GET con responseType 'arraybuffer' para recibir el archivo binario intacto
      const response = await this.httpClient.axiosInstance.get(targetUrl, {
        headers: {
          'Accept': 'application/pdf,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Cookie': activeCookies,
        },
        timeout: 30000,
        responseType: 'arraybuffer',
      });

      // 5. Guardar el Buffer del PDF recibido en disco
      fs.writeFileSync(filePath, Buffer.from(response.data));

      if (outputManager) {
        outputManager.registrarExito({
          tipo: doc.esCertidaoConsolidada ? TipoScraping.PDF_CONSOLIDADO : TipoScraping.PDF_DOCUMENTO,
          numeroProceso: processNumber,
          idProcDocBin: doc.id,
          tituloDocumento: doc.titulo,
          rutaArchivoDescargado: filePath,
          contexto: { esCertidaoConsolidada: doc.esCertidaoConsolidada, formato: doc.formatoDocumento }
        });
      }

      return {
        success: true,
        filePath,
      };

    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (outputManager) {
        outputManager.registrarFallo({
          tipo: doc.esCertidaoConsolidada ? TipoScraping.PDF_CONSOLIDADO : TipoScraping.PDF_DOCUMENTO,
          numeroProceso: processNumber,
          idProcDocBin: doc.id,
          mensajeError: errorMessage,
          intentosRealizados: error.config?.['retryCount'] || 1,
          ultimoCodigoHttp: error.response?.status,
          contexto: { targetUrl, doc }
        });
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }


}