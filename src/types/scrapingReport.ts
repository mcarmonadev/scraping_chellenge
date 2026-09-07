import { v4 as uuidv4 } from 'uuid';

/**
 * Categorías explícitas para distinguir cada fase y tipo de recurso dentro del pipeline.
 */
export enum TipoScraping {
  HTML_DETALLE = 'HTML_DETALLE',          // Consulta o parseo del detalle general del expediente
  HTML_DOCUMENTO = 'HTML_DOCUMENTO',      // Fetching del HTML intermedio para obtener token/botón GERAR PDF
  PDF_DOCUMENTO = 'PDF_DOCUMENTO',        // Descarga del binario PDF individual
  PDF_CONSOLIDADO = 'PDF_CONSOLIDADO'     // Descarga del PDF unificado del expediente
}

/**
 * DTO genérico único para registrar cualquier evento (Éxito o Fallo)
 */
export interface EventoScraping {
  id: string;                 // UUID del evento
  executionId: string;        // ID de la corrida (Ej: RUN_20260903_120000_a1b2)
  tipo: TipoScraping;         // HTML_DETALLE | HTML_DOCUMENTO | PDF_DOCUMENTO | PDF_CONSOLIDADO
  esExito: boolean;           // true = Éxito | false = Fallo
  numeroProceso?: string;     // Identificador del expediente
  idProcDocBin?: string;      // ID único del documento (si aplica)
  tituloDocumento?: string;
  rutaArchivoDescargado?: string;
  intentosRealizados: number;
  ultimoCodigoHttp?: number;
  mensajeError?: string;
  timestamp: string;          // ISO Date
  contexto?: Record<string, any>;
}

/**
 * Estructura global acumulativa de la ejecución
 */
export interface ReporteEjecucion {
  executionId: string;
  fechaInicio: string;
  fechaFin?: string;
  timing: any,
  resumen: {
    totalEncontrados: number;
    totalProcesados: number;
    totalExitosos: number;
    totalFallidos: number;
  };
  listadoInicial: any[];
  detallesExpedientes: any[];
  eventos: EventoScraping[];
}