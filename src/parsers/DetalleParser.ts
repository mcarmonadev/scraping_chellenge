import * as cheerio from 'cheerio';
import type { ProcesoDetalle, ParteInvolucrada, MovimientoItem, DocumentoAdjunto } from '../types.js';

export class DetalleParser {
  public static parseDetalleHtml(html: string, processNumber: string, currentPage: number = 1): ProcesoDetalle {
    const $ = cheerio.load(html);

    // 0. Eliminar scripts y estilos inline
    $('script, style').remove();

    // Helper para extracción de campos del encabezado
    const extractProperty = (label: string): string => {
      let valor = '';
      $('.propertyView').each((_, el) => {
        const textLabel = $(el).find('.name').text().trim();
        if (textLabel.toLowerCase().includes(label.toLowerCase())) {
          valor = $(el).find('.value').text().trim();
        }
      });
      return valor.replace(/\s+/g, ' ');
    };

    const fechaDistribucion = extractProperty('Data da Distribuição');
    const claseJudicial = extractProperty('Classe Judicial');
    const asunto = extractProperty('Assunto');
    const jurisdiccion = extractProperty('Jurisdição');
    const orgaoJulgadorColegiado = extractProperty('Órgão Julgador Colegiado');
    const orgaoJulgador = extractProperty('Órgão Julgador');
    const direccion = extractProperty('Endereço');
    const procesoReferencia = extractProperty('Processo referência');

    // Helper para validar si un string es realmente el nombre de una parte/persona
    const isValidPartyName = (name: string): boolean => {
      if (!name) return false;
      const invalidKeywords = [
        'dados do processo',
        'número processo',
        'jurisdição',
        'órgano julgador',
        'visualizar documentos',
        'distribuído',
        'redistribuído',
        'juntada',
        'desentranhado',
        'cancelada',
        'recebidos',
      ];
      const lower = name.toLowerCase();
      // Si contiene palabras clave de movimientos o encabezados, no es una parte
      return !invalidKeywords.some((kw) => lower.includes(kw));
    };

    // 1. Extraer Polos Filtrados
    const extractPolo = (containerSelector: string): ParteInvolucrada[] => {
      const partes: ParteInvolucrada[] = [];

      $(containerSelector).find('tr, div.row').each((_, el) => {
        const textRow = $(el).text().trim();
        if (!textRow || textRow.toLowerCase().includes('participante')) return;

        const tds = $(el).find('td');
        if (tds.length >= 1) {
          const nombre = $(tds[0]).text().trim().replace(/\s+/g, ' ');
          const situacion = tds.length > 1 ? $(tds[1]).text().trim() : 'Ativo';

          if (isValidPartyName(nombre)) {
            // Evitar duplicados
            if (!partes.some((p) => p.nombre === nombre)) {
              partes.push({ nombre, situacion: situacion || 'Ativo' });
            }
          }
        }
      });

      return partes;
    };

    // Aplicamos selectores para polo activo y pasivo
    const poloAtivo = extractPolo('div[id*="poloAtivo"], fieldset:contains("Polo ativo"), tr:contains("Polo ativo")');
    const poloPasivo = extractPolo('div[id*="poloPassivo"], fieldset:contains("Polo Passivo"), tr:contains("Polo Passivo")');

    // 2. Extraer Movimientos Fila por Fila
    const movimientos: MovimientoItem[] = [];
    $('div[id*="processoEvento"] tbody tr, table[id*="processoEvento"] tbody tr').each((_, tr) => {
      const text = $(tr).text().trim().replace(/\s+/g, ' ');
      const match = text.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})\s*-\s*(.+)/);

      if (match && match[1] && match[2]) {
        movimientos.push({
          fechaHora: match[1].trim(),
          descripcion: match[2].trim(),
        });
      }
    });

    // 3. Extraer Documentos Adjuntos
    const documentos: DocumentoAdjunto[] = [];
    const fechaActual = new Date().toISOString().split('T')[0] ?? '';



    // A) Botón IMPRIMIR (Certidão Consolidada / Expediente Completo)
    const $btnImprimir = $('input[value*="Imprimir" i], input[value*="IMPRIMIR"], a[onclick*="reportPDF.seam"], input[onclick*="reportPDF.seam"]').first();

    if ($btnImprimir.length > 0) {
      const onclickAttr = $btnImprimir.attr('onclick') || $btnImprimir.attr('href') || '';
      
      // Extraemos la URL limpia del PDF (reportPDF.seam?idProcessoTrf=...)
      const matchUrl = onclickAttr.match(/'(reportPDF\.seam[^']+)'/) || onclickAttr.match(/'(https?:\/\/[^']+|\/pjeconsulta\/[^']+)'/);
      
      // Garantizamos que siempre sea un string (nunca undefined)
      const urlConsolidado: string = matchUrl?.[1] ?? onclickAttr ?? '';

      documentos.push({
        id: 'doc_IMPRIMIR_COMPLETO',
        titulo: 'Certidão Consolidada / Expediente Completo (IMPRIMIR)',
        fecha: fechaActual,
        urlPdf: `/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/${urlConsolidado}`,
        esCertidaoConsolidada: true,
        pagina: currentPage,
        formatoDocumento: 'ARCHIVO_PDF'
      });
    }


    // B) Documentos individuales
    $('a[onclick*="openPopUp"], a[href*="listView.seam"], a[onclick*="documentoSemLoginHTML"]').each((idx, a) => {
      const $a = $(a);

      // 1. Tomar el texto del botón y limpiar el prefijo accesorio "Visualizar documentos"
      const rawTitle = $a.text().trim() || $a.parents('tr').find('td').first().text().trim();      
      const titleClean = rawTitle.replace(/^Visualizar documentos\s*/i, '').trim();

      const onclickAttr = $a.attr('onclick') || $a.attr('href') || '';

      // 2. Extraer la URL de origen (href u onclick según corresponda)
      const hrefAttr = $a.attr('href') || '';  
      const urlFinal = (hrefAttr && hrefAttr !== '#') ? hrefAttr : onclickAttr;

      // 3. Determinar el formato examinando el ícono FontAwesome del tag <i>
      const $icon = $a.find('i');
      let formato: 'REPORTE_HTML' | 'ARCHIVO_PDF' = 'REPORTE_HTML';

      if ($icon.hasClass('fa-file-pdf-o') || hrefAttr.includes('listView.seam')) {
        formato = 'ARCHIVO_PDF';
      } else if ($icon.hasClass('fa-external-link') || onclickAttr.includes('documentoSemLoginHTML')) {
        formato = 'REPORTE_HTML';
      }      

      if (titleClean) {
        documentos.push({
          id: `doc_${idx + 1}`,
          titulo: titleClean,
          fecha: fechaActual,
          urlPdf: urlFinal,
          esCertidaoConsolidada: false,
          pagina: currentPage,
          formatoDocumento: formato
        });
      }
    });

    return {
      processNumber,
      fechaDistribucion,
      claseJudicial,
      asunto,
      jurisdiccion,
      orgaoJulgadorColegiado,
      orgaoJulgador,
      direccion,
      procesoReferencia,
      poloAtivo,
      poloPasivo,
      movimientos,
      documentos,
    };
  }

  /**
   * Extrae el total de páginas del paginador slider de RichFaces.
   * Si no existe el slider en el HTML, retorna 1 por omisión.
   */
  public static obtenerTotalPaginas(html: string): number {
    const $ = cheerio.load(html);

    // Intentar leer la celda que indica el número máximo del slider
    const numMaxTexto = $('td.rich-inslider-right-num').text().trim();
    if (numMaxTexto) {
      const total = parseInt(numMaxTexto, 10);
      if (!isNaN(total)) return total;
    }

    // Alternativa: Si no encuentra el slider pero sólo hay 1 página
    return 1;
  }  
  
}