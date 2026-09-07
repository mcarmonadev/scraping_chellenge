import * as cheerio from 'cheerio';
import { type DocumentItem } from '../types.js';

export class TableParser {
  /**
   * Extrae el ViewState del HTML inicial
   */
  public static extractViewState(html: string): string | null {
    if (!html) return null;
    const $ = cheerio.load(html);
    const viewState = $('input[name="javax.faces.ViewState"]').val();
    return viewState ? String(viewState) : null;
  }

  /**
   * Parsea la tabla de resultados del HTML retornado por la búsqueda AJAX
   */
  public static parseTableResults(html: string): DocumentItem[] {
    if (!html) return [];
    
    const $ = cheerio.load(html);
    const documents: DocumentItem[] = [];

    // Regex para identificar el número de proceso formato CNJ (ej: 0800821-57.2024.4.05.8308)
    const cnjRegex = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/;

    // Iterar sobre cada fila de la tabla de procesos
    $('tr.rich-table-row').each((index, element) => {
      // 1. Extraer el ID técnico/interno de JSF de la celda
      const cellId = $(element).find('td[id*="processosTable"]').first().attr('id') ?? '';
      const matchId = cellId.match(/processosTable:(\d+):/);
      const internalId: string = matchId && matchId[1] ? matchId[1] : `row-${index + 1}`;

      // 2. Extraer el token hash 'ca' del atributo 'onclick'
      const linkElement = $(element).find('a[onclick*="listView.seam"]');
      const onclickAttr = linkElement.attr('onclick') ?? '';
      const matchCa = onclickAttr.match(/ca=([a-f0-9]+)/);
      const tokenCa: string = matchCa && matchCa[1] ? matchCa[1] : '';

      // 3. Extraer el título completo y separar el Número CNJ de negocio
      const rawTitle: string = $(element).find('b.btn-block').text().trim() || 'Sin Título';
      const cnjMatch = rawTitle.match(cnjRegex);
      const processNumber: string = cnjMatch ? cnjMatch[0] : '';

      //if(processNumber!=='0803294-73.2015.4.05.8100')return true

      // 4. Extraer las partes (limpiando el botón interno)
      const tdFirst = $(element).find('td').first();
      const tdClone = tdFirst.clone();
      tdClone.find('a').remove();
      const parties: string = tdClone.text().trim() || 'Sin Información de Partes';

      // 5. Extraer la última movimentación
      const lastMovement: string = $(element).find('td').eq(2).text().trim() || 'Sin Movimentación';

      documents.push({
        id: processNumber || internalId, // Usamos el CNJ como ID principal si existe, de lo contrario el interno
        processNumber: processNumber,
        internalId: internalId,
        ca: tokenCa,
        title: rawTitle,
        parties: parties,
        lastMovement: lastMovement,
        details: {
          rowNumber: String(index + 1),
        },
      });
    });

    return documents;
  }

  /**
   * Determina si el HTML AJAX devuelto contiene filas de resultados.
   */
  public static tieneResultadosValidos(html: string): boolean {
    if (!html || html.trim().length === 0) return false;

    const $ = cheerio.load(html);

    // 1. Obtener la referencia exacta al tbody de la tabla de RichFaces
    const tbody = $('#fPP\\:processosTable\\:tb');

    // Si el tbody ni siquiera existe en el HTML recibido, no hay resultados
    if (tbody.length === 0) return false;

    // 2. Contar de forma directa cuántas filas <tr> residen como HIJOS DIRECTOS de ese tbody
    const cantidadFilas = tbody.children('tr').length;

    // Retorna true UNICAMENTE si hay 1 o más <tr> dentro de la etiqueta <tbody>
    return cantidadFilas > 0;
  }  


}