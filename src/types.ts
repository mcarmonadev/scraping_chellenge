export interface DocumentItem {
  /* Identificador principal del expediente (Prioriza el Número CNJ, de lo contrario usa el ID interno) */
  id: string;

  /* Número Único de Proceso formato CNJ (ej: "0800821-57.2024.4.05.8308") */
  processNumber?: string;

  /* ID interno/técnico del componente de la tabla de JSF (ej: "131219") */
  internalId?: string;

  /* Token hash para consultar el detalle del expediente en el endpoint de navegación */
  ca?: string;

  /* Título completo extraído del proceso */
  title: string;

  /* Partes involucradas en el proceso */
  parties?: string;

  /* Última actualización o movimiento registrado */
  lastMovement?: string;

  /* Metadatos o información adicional de la fila */
  details?: {
    rowNumber?: string;
    [key: string]: any;
  };
}
// Sub-entidades para el Detalle de Expediente
export interface ParteInvolucrada {
  nombre: string;
  documento?: string; // CPF / CNPJ o Registro OAB
  rol?: string;       // APELANTE, APELADO, ADVOGADO, etc.
  situacion: string;  // Ativo, etc.
}

export interface MovimientoItem {
  fechaHora: string;
  descripcion: string;
}

export interface DocumentoAdjunto {
  id: string;
  titulo: string;
  fecha: string;
  urlPdf?: string;
  esCertidaoConsolidada?: boolean; // Identifica si es el botón 'IMPRIMIR'
  pagina?: number;
  formatoDocumento?: 'REPORTE_HTML' | 'ARCHIVO_PDF' | undefined;
}

// Entidad Principal de la Vista de Detalle
export interface ProcesoDetalle {
  processNumber: string;
  fechaDistribucion?: string;
  claseJudicial?: string;
  asunto?: string;
  jurisdiccion?: string;
  orgaoJulgadorColegiado?: string;
  orgaoJulgador?: string;
  direccion?: string;
  procesoReferencia?: string;
  poloAtivo: ParteInvolucrada[];
  poloPasivo: ParteInvolucrada[];
  movimientos: MovimientoItem[];
  documentos: DocumentoAdjunto[];
}

// Registro de Auditoría de Descargas (exigido por el examen)
export interface FailedDocumentLog {
  processNumber: string;
  documentId: string;
  documentTitle?: string;
  url: string;            // Exigido por el flujo del descargador de PDFs
  failedAt: string;       // Timestamp ISO del error
  attemptsMade: number;   // Reintentos realizados
  lastError: string;      // Motivo del fallo (reason / HTTP Status)
}
