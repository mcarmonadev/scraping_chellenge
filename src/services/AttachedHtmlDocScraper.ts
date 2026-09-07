import fs from 'fs';
import path from 'path';
import { ResilientHttpClient } from '../clients/httpClient.js';
import type { DocumentoAdjunto } from '../types.js';
import { ScrapingOutputManager } from './ScrapingOutputManager.js';
import { TipoScraping } from '../types/scrapingReport.js';
import { CookieManager } from '../utils/cookieManager.js';
import iconv from 'iconv-lite';


export interface PDFScrapingResult {
  success: boolean;
  filePath?: string;
  htmlContent?: string;
  error?: string;
}

  /**
   *Implementa el scraping para los documentos HTML 
   *  En el previo scraping de Detalle del Expediente "Dados do Processo", hay
   *  documento en formato PDF para descargar directo, y hay documentos HTML que se visualizan por Browser
   *  Esta clase implementa el scraping de el último caso: doc HTML, para poder obtener el botón Descargar PDF "GERAR PDF"
   *  que ya que dicho botón tiene los parámetros para descargar la versión PDF del mismo archivo
   */
export class AttachedHtmlDocScraper {
  private httpClient: ResilientHttpClient;
  private baseDir: string;

  constructor(httpClient: ResilientHttpClient, baseDir = './downloads/html_investigacion') {
    this.httpClient = httpClient;
    this.baseDir = baseDir;
  }

  /**
   * Obtiene el contenido del Documento HTML intermedio
   * A partir del HTML extrae valores necesarios para proceder su descarga como PDF (Boton GERAR PDF)
   */
  public async scrapDocumentHtmlFile(
    processNumber: string,
    doc: DocumentoAdjunto,
    outputManager?: ScrapingOutputManager
  ): Promise<PDFScrapingResult> {
    const targetUrl = this.resolveInitialUrl(doc);
    console.log(`targetUrl:  ${targetUrl}`)

      if (!targetUrl) {
          const errorMsg = `No se pudo extraer una URL válida para el documento ID: ${doc.id}`;
          
          // 🔴 Registro de fallo por URL inválida
          if (outputManager) {
            outputManager.registrarFallo({
              tipo: TipoScraping.HTML_DOCUMENTO,
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

    // Carpeta de almacenamiento: si existe outputManager se guarda en la carpeta de la corrida (RUN_...)
    const safeFolderName = processNumber.replace(/[^a-zA-Z0-9]/g, '_');
    const baseFolder = outputManager
      ? path.join('./output', outputManager.getExecutionId(), 'html')
      : this.baseDir;

    const targetFolder = path.join(baseFolder, safeFolderName);

    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    
    const prefix = doc.esCertidaoConsolidada ? 'CONSOLIDADO_' : 'DOC_';
    const safeTitle = doc.titulo.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25);
    const fileName = `${prefix}${doc.id}_${safeTitle}.html`;
    const filePath = path.join(targetFolder, fileName);


    try {
        // Petición GET aprovechando la Cookie y la resiliencia nativa de httpClient
        const activeCookies = CookieManager.getInstance().getCookies();
        const response = await this.httpClient.get<string>(targetUrl, {
            headers: {                
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',            
            'Cookie': activeCookies,
            },
            timeout: 25000,
            responseEncoding: 'binary',
        });

        //const htmlData = response.data;        
        const htmlData = iconv.decode(Buffer.from(response.data, 'binary'), 'iso-8859-1');

        // Guardar el HTML recibido para inspección
        fs.writeFileSync(filePath, htmlData, 'utf-8');

        if (outputManager) {
          outputManager.registrarExito({
            tipo: TipoScraping.HTML_DOCUMENTO,
            numeroProceso: processNumber,
            idProcDocBin: doc.id,
            tituloDocumento: doc.titulo,
            rutaArchivoDescargado: filePath,
            contexto: { esCertidaoConsolidada: doc.esCertidaoConsolidada }
          });
        }

      return {
        success: true,
        filePath,
        htmlContent: htmlData,
      };
    } catch (error: any) {

        const errorMessage = error instanceof Error ? error.message : String(error);

        // 🔴 Registro de fallo en la petición HTTP o guardado
        if (outputManager) {
          outputManager.registrarFallo({
            tipo: TipoScraping.HTML_DOCUMENTO,
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

  /**
   * Resuelve la URL inicial (HTML/Intermedia) del documento html
   */
  private resolveInitialUrl(doc: DocumentoAdjunto): string | null {
    let targetUrl = doc.urlPdf|| '';

    // Si viene dentro de openPopUp('...', 'https://...')
    if (!targetUrl.startsWith('http')) {
      const match = targetUrl.match(/https?:\/\/[^\s'"]+/);
      targetUrl = match ? match[0] : '';
    }

    return targetUrl || null;
  }

}