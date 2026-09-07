import { ResilientHttpClient } from '../clients/httpClient.js';
import { saveDetailHtml } from '../utils/fileUtils.js';
import { type DocumentItem, type ProcesoDetalle } from '../types.js'; // 👈 Importamos ProcesoDetalle
import { DetalleParser } from '../parsers/DetalleParser.js';
import { CookieManager } from '../utils/cookieManager.js';
import { TipoScraping } from '../types/scrapingReport.js';
import { ScrapingOutputManager } from './ScrapingOutputManager.js';
import { TimeUtils } from '../utils/timeUtils.js';
import querystring from 'querystring';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import path from 'path';
import fs from 'fs'; 


export const delay = (ms: number, jitter: number = 500): Promise<void> => {
  const randomJitter = Math.floor(Math.random() * jitter);
  return new Promise((resolve) => setTimeout(resolve, ms + randomJitter));
};

export class ProcesoDetalleService {

  constructor(private httpClient: ResilientHttpClient) {}

  /**
   * Procesa la lista de expedientes seleccionados y devuelve los detalles parseados acumulados
   */
  public async scrapAllExpedientsDetails(documents: DocumentItem[], outputManager?: ScrapingOutputManager): Promise<ProcesoDetalle[]> { // 👈 Retorna un array de ProcesoDetalle
    console.log(`\n🔄 Iniciando descarga y parseo de ${documents.length} expediente(s) de detalle...`);
    const resultadosParseados: ProcesoDetalle[] = [];

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];

      if (!doc) continue;

      const identifier = doc.processNumber || doc.id;

      if (!doc.ca) {
        if (outputManager) {
          outputManager.registrarFallo({
            tipo: TipoScraping.HTML_DETALLE,
            numeroProceso: identifier,
            mensajeError: 'El expediente no contiene el token "ca" requerido para consultar el detalle',
            intentosRealizados: 1,
            contexto: { doc }
          });
        }
        console.warn(`⚠️ [${i + 1}/${documents.length}] El proceso ${identifier} no posee token 'ca'. Saltando...`);
        continue;
      }

      console.log(`[${i + 1}/${documents.length}] 📥 Solicitando detalle de: ${identifier} (ca: ${doc.ca.substring(0, 8)}...)`);

      try {
        // 🟢 Se pasa outputManager como tercer parámetro
        const { savedPath, parsedData } = await this.scrap_SingleExpedient_Details(identifier, doc.ca, outputManager);
        console.log(`   💾 HTML guardado en: ${savedPath}`);

        resultadosParseados.push(parsedData);

        if (outputManager) {
          outputManager.agregarDetalleExpediente(parsedData);
          outputManager.registrarExito({
            tipo: TipoScraping.HTML_DETALLE,
            numeroProceso: identifier,
            rutaArchivoDescargado: savedPath,
            contexto: { totalDocumentosEncontrados: parsedData.documentos?.length || 0 }
          });
        }

        if (i < documents.length - 1) {
          console.log('   ⏳ Aplicando pausa de cortesía (1.5s)...');
          await delay(1500, 500);
        }
      } catch (error: any) {
        console.error(`   ❌ Error al obtener detalle de ${identifier}: ${error.message}`);
        
        if (outputManager) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          outputManager.registrarFallo({
            tipo: TipoScraping.HTML_DETALLE,
            numeroProceso: identifier,
            mensajeError: errorMessage,
            intentosRealizados: error.config?.['retryCount'] || 1,
            ultimoCodigoHttp: error.response?.status,
            contexto: { identifier, ca: doc.ca }
          });
        }

        await delay(3000);
      }
    }

    console.log('\n🎉 Procesamiento de HTMLs de detalle finalizado.');
    return resultadosParseados;
  }


  /**
   * Obtiene, almacena el HTML y retorna los datos parseados del detalle de un proceso.
   */
  public async scrap_SingleExpedient_Details(
    processNumberOrId: string, 
    tokenCa: string,
    outputManager?: ScrapingOutputManager // 👈 Agregado para determinar la ruta
  ): Promise<{ savedPath: string; parsedData: ProcesoDetalle }> { // 👈 Retorna ProcesoDetalle
    const urlDetalle = `/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/listView.seam?ca=${tokenCa}`;

    const activeCookies = CookieManager.getInstance().getCookies();
    const response = await this.httpClient.get<string>(urlDetalle, {
      responseEncoding: 'binary',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cookie': activeCookies,
      },
    });

    const htmlBrutoDecodificado = iconv.decode(Buffer.from(response.data, 'binary'), 'iso-8859-1');
    //fs.writeFileSync('./downloads/debug_detalle_crudo.html', htmlBrutoDecodificado, 'utf-8');

    // 🟢 Determinar la ruta según la presencia de outputManager
    let savedPath: string;
    if (outputManager) {
      const safeFolderName = processNumberOrId.replace(/[^a-zA-Z0-9]/g, '_');
      const targetDir = path.join('./output', outputManager.getExecutionId(), 'html', safeFolderName);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      savedPath = path.join(targetDir, `detalle_${safeFolderName}.html`);
      fs.writeFileSync(savedPath, htmlBrutoDecodificado, 'utf-8');
    } else {
      savedPath = saveDetailHtml(processNumberOrId, htmlBrutoDecodificado);
    }
    
    // Asumimos que parseDetalleHtml retorna la estructura ProcesoDetalle
    const parsedData = DetalleParser.parseDetalleHtml(htmlBrutoDecodificado, processNumberOrId, 1) as ProcesoDetalle;

      //fs.writeFileSync('./downloads/ZZZ3_.json', JSON.stringify(parsedData.documentos, null, 4))

    // Extraer el 'ca' token de la URL si viene presente
    const caMatch = urlDetalle.match(/ca=([^&]+)/);
    const caToken = caMatch ? caMatch[1] : '';

    // 2. Determinar si hay más de 1 página
    const totalPaginas = DetalleParser.obtenerTotalPaginas(htmlBrutoDecodificado);

    if (totalPaginas > 1) {
      console.log(`📊 Detectadas ${totalPaginas} páginas de documentos. Iniciando recorrido AJAX...`);

      const $ = cheerio.load(htmlBrutoDecodificado);
      let viewStateActual = $('input[name="javax.faces.ViewState"]').val() as string || 'j_id4';

      for (let pagina = 2; pagina <= totalPaginas; pagina++) {
        console.log(`🔄 Solicitando página ${pagina} de ${totalPaginas}...`);

        const { html, nuevoViewState } = await this.solicitarPaginaDocumentos(caToken!, viewStateActual, pagina);
        viewStateActual = nuevoViewState;

        // Pasamos 'pagina' como 3er parámetro para que los documentos 
        // de esta respuesta AJAX queden marcados con su número de página correcto
        const detallePagina = DetalleParser.parseDetalleHtml(html, processNumberOrId, pagina);
      
        if (parsedData.documentos && detallePagina.documentos) {
          parsedData.documentos.push(...detallePagina.documentos);
        }

        const tiempoEsperado = await TimeUtils.delay(1200, 1400);
        console.log(`[WAIT] Pausa después de paginación en lista documentos de ${tiempoEsperado}ms finalizada.`);

      }
    }


    console.log(`📄 [${processNumberOrId}] PARSEADO CON ÉXITO! Docs encontrados: ${parsedData.documentos?.length || 0}`);

    return { savedPath, parsedData };
  }

  /**
   * Pide una página específica de anexos/documentos vía AJAX POST
   */
  private async solicitarPaginaDocumentos(
    caToken: string,
    viewStateActual: string,
    numeroPagina: number
  ): Promise<{ html: string; nuevoViewState: string }> {

    const payload = querystring.stringify({
      'AJAXREQUEST': 'j_id146:j_id569',
      'j_id146:j_id653:j_id654': String(numeroPagina),
      'j_id146:j_id653': 'j_id146:j_id653',
      'autoScroll': '',
      'javax.faces.ViewState': viewStateActual,
      'j_id146:j_id653:j_id655': 'j_id146:j_id653:j_id655',
      'AJAX:EVENTS_COUNT': '1',
    });

    const url = `/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/listView.seam${caToken ? `?ca=${caToken}` : ''}`;
        
    const response = await this.httpClient.post(url, payload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Faces-Request': 'partial/ajax',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': CookieManager.getInstance().getCookies(),
      },
    });

    const htmlRespuesta = response.data as string;
    const $ = cheerio.load(htmlRespuesta);
    const nuevoViewState = $('input[name="javax.faces.ViewState"]').val() as string || viewStateActual;

    return { html: htmlRespuesta, nuevoViewState };
  }

}