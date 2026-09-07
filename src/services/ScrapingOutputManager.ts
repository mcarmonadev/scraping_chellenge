import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  EventoScraping,
  TipoScraping,
  ReporteEjecucion
} from '../types/scrapingReport.js';

// Helper de formateo para fecha y hora legible (AAAA-MM-DD_HH-mm-ss)
function meFormatearFechaIso(fecha: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  const anio = fecha.getFullYear();
  const mes = pad(fecha.getMonth() + 1);
  const dia = pad(fecha.getDate());
  
  const horas = pad(fecha.getHours());
  const minutos = pad(fecha.getMinutes());
  const segundos = pad(fecha.getSeconds());

  return `${anio}-${mes}-${dia}_${horas}-${minutos}-${segundos}`;
}

export class ScrapingOutputManager {
  private executionId!: string;
  private fechaInicio!: string;
  private listadoInicial: any[] = [];
  private detallesExpedientes: any[] = [];
  private eventos: EventoScraping[] = [];
  private startTime: number;

  constructor(customExecutionId?: string) {
    if (customExecutionId) {
      this.executionId = customExecutionId;
      this.fechaInicio = new Date().toISOString();
    }    
    this.startTime = Date.now(); // Guardamos la marca de tiempo de inicio
  }  

  /**
   * Genera el ID único de la corrida una vez que se conocen los parámetros de entrada.
   * Formato: RUN_BY_PROC_<VALOR>_AT_<FECHA> o RUN_BY_DATE_<VALOR>_AT_<FECHA>
   */
  public generateExecutionId(
    queryType: 'BY_DATE' | 'BY_PROCESS_ID',
    paramValue: string
  ): string {
    const ahora = new Date();
    const fechaFormateada = meFormatearFechaIso(ahora); // Retorna AAAA-MM-DD_HH-mm-ss

    // Sanitizar el parámetro para no romper carpetas en el SO (ej. 21/08/2026 -> 21-08-2026)
    const valorLimpio = paramValue.replace(/\//g, '-').replace(/\s+/g, '_');

    // Mapear el prefijo limpio
    const prefijo = queryType === 'BY_PROCESS_ID' ? 'BY_PROC' : 'BY_DATE';

    // Estructura limpia y semántica sin UUID: RUN_BY_PROC_0803294-73..._AT_2026-09-06_22-15-14
    this.executionId = `RUN_${prefijo}_${valorLimpio}_AT_${fechaFormateada}`;
    this.fechaInicio = ahora.toISOString();

    return this.executionId;
  }

  public getExecutionId(): string {
    return this.executionId;
  }

  /**
   * Guarda el listado inicial capturado tras la búsqueda principal
   */
  public setListadoInicial(listado: any[]): void {
    this.listadoInicial = listado;
  }

  /**
   * Agrega el detalle/metadata parseado de un expediente (Soporta objeto individual o Array)
   */
  public agregarDetalleExpediente(detalle: any): void {
    if (Array.isArray(detalle)) {
      this.detallesExpedientes.push(...detalle);
    } else {
      this.detallesExpedientes.push(detalle);
    }
  }

  /**
   * Registra un evento de ÉXITO
   */
  public registrarExito(params: {
    tipo: TipoScraping;
    numeroProceso?: string;
    idProcDocBin?: string;
    tituloDocumento?: string;
    rutaArchivoDescargado?: string;
    contexto?: Record<string, any>;
  }): void {
    const nuevoEvento: EventoScraping = {
      id: uuidv4(),
      executionId: this.executionId,
      tipo: params.tipo,
      esExito: true,
      intentosRealizados: 1,
      timestamp: new Date().toISOString(),
      ...(params.numeroProceso && { numeroProceso: params.numeroProceso }),
      ...(params.idProcDocBin && { idProcDocBin: params.idProcDocBin }),
      ...(params.tituloDocumento && { tituloDocumento: params.tituloDocumento }),
      ...(params.rutaArchivoDescargado && { rutaArchivoDescargado: params.rutaArchivoDescargado }),
      ...(params.contexto && { contexto: params.contexto }),
    };

    this.eventos.push(nuevoEvento);
    console.log(`✅ [ÉXITO][${params.tipo}] Proceso: ${params.numeroProceso || params.idProcDocBin || 'N/A'}`);
  }

  /**
   * Registra un evento de FALLO
   */
  public registrarFallo(params: {
    tipo: TipoScraping;
    mensajeError: string;
    numeroProceso?: string;
    idProcDocBin?: string;
    intentosRealizados?: number;
    ultimoCodigoHttp?: number;
    contexto?: Record<string, any>;
  }): void {
    const nuevoEvento: EventoScraping = {
      id: uuidv4(),
      executionId: this.executionId,
      tipo: params.tipo,
      esExito: false,
      intentosRealizados: params.intentosRealizados || 1,
      mensajeError: params.mensajeError,
      timestamp: new Date().toISOString(),
      ...(params.numeroProceso && { numeroProceso: params.numeroProceso }),
      ...(params.idProcDocBin && { idProcDocBin: params.idProcDocBin }),
      ...(params.ultimoCodigoHttp !== undefined && { ultimoCodigoHttp: params.ultimoCodigoHttp }),
      ...(params.contexto && { contexto: params.contexto }),
    };

    this.eventos.push(nuevoEvento);
    console.warn(`⚠️ [FALLO][${params.tipo}] Proceso: ${params.numeroProceso || params.idProcDocBin || 'N/A'} - Error: ${params.mensajeError}`);
  }

  /**
   * Genera y retorna la ruta para guardar archivos binarios asociándolos a la corrida actual
   */
  public getPdfFolderForProcess(numeroProceso: string, baseOutputDir: string = './output'): string {
    const processFolder = path.join(
      baseOutputDir,
      this.executionId,
      'pdfs',
      numeroProceso.replace(/[^a-zA-Z0-9_-]/g, '_')
    );
    if (!fs.existsSync(processFolder)) {
      fs.mkdirSync(processFolder, { recursive: true });
    }
    return processFolder;
  }

  /**
   * Construye el DTO global acumulativo
   */
  public obtenerEstadoEjecucion(): ReporteEjecucion {
    const exitos = this.eventos.filter((e) => e.esExito);
    const fallos = this.eventos.filter((e) => !e.esExito);

    // Guardamos la marca de tiempo final
    const endTime = Date.now();
    const duracionMs = endTime - this.startTime;
    const duracionSegundos = (duracionMs / 1000).toFixed(2);
    const minutos = Math.floor(duracionMs / 60000);
    const segundosRestantes = ((duracionMs % 60000) / 1000).toFixed(1);
    
    return {
      executionId: this.executionId,
      fechaInicio: this.fechaInicio,
      fechaFin: new Date().toISOString(),
      timing: {
        startTime: new Date(this.startTime).toLocaleTimeString(),
        endTime: new Date(endTime).toLocaleTimeString(),
        duracionMilisegundos: duracionMs,
        duracionSegundos,
        duracion: `${duracionSegundos}s (${minutos}m ${segundosRestantes}s)`
      },
      resumen: {
        totalEncontrados: this.listadoInicial.length,
        totalProcesados: this.detallesExpedientes.length,
        totalExitosos: exitos.length,
        totalFallidos: fallos.length,
      },
      listadoInicial: this.listadoInicial,
      detallesExpedientes: this.detallesExpedientes,
      eventos: this.eventos,
    };
  }

  /**
   * Exporta los reportes consolidados (JSON maestro, CSV de éxitos y CSV de fallos)
   */
  public async guardarReportesFinales(baseOutputDir: string = './output'): Promise<void> {
    const runDir = path.join(baseOutputDir, this.executionId);
    const reportesDir = path.join(runDir, 'reportes');

    if (!fs.existsSync(reportesDir)) {
      fs.mkdirSync(reportesDir, { recursive: true });
    }

    const estadoGlobal = this.obtenerEstadoEjecucion();
    const exitos = this.eventos.filter((e) => e.esExito);
    const fallos = this.eventos.filter((e) => !e.esExito);




    // 1. JSON Maestro
    const jsonPath = path.join(reportesDir, 'resumen_ejecucion.json');
    fs.writeFileSync(jsonPath, JSON.stringify(estadoGlobal, null, 2), 'utf-8');

    // 2. CSV Éxitos
    const csvExitosPath = path.join(reportesDir, 'exitosos.csv');
    const csvExitosHeader = 'executionId,id,timestamp,tipo,numeroProceso,idProcDocBin,tituloDocumento,rutaArchivoDescargado\n';
    const csvExitosRows = exitos.map((e) => {
      const tituloLimpio = `"${(e.tituloDocumento || '').replace(/"/g, '""')}"`;
      return `${e.executionId},${e.id},${e.timestamp},${e.tipo},${e.numeroProceso || ''},${e.idProcDocBin || ''},${tituloLimpio},"${e.rutaArchivoDescargado || ''}"`;
    }).join('\n');
    fs.writeFileSync(csvExitosPath, csvExitosHeader + csvExitosRows, 'utf-8');

    // 3. CSV Fallos
    const csvFallosPath = path.join(reportesDir, 'fallidos.csv');
    const csvFallosHeader = 'executionId,id,timestamp,tipo,numeroProceso,idProcDocBin,intentosRealizados,ultimoCodigoHttp,mensajeError\n';
    const csvFallosRows = fallos.map((f) => {
      const msgLimpio = `"${(f.mensajeError || '').replace(/"/g, '""')}"`;
      return `${f.executionId},${f.id},${f.timestamp},${f.tipo},${f.numeroProceso || ''},${f.idProcDocBin || ''},${f.intentosRealizados},${f.ultimoCodigoHttp || ''},${msgLimpio}`;
    }).join('\n');
    fs.writeFileSync(csvFallosPath, csvFallosHeader + csvFallosRows, 'utf-8');

    //Formateamos a segundos y minutos para la consola
    const timing = estadoGlobal.timing;
    //console.log(`\n================================================================`);
    console.log(`\n========================== TIMING ==============================`);
    console.log(`   🏁 Proceso finalizado`);
    console.log(`   ⏱️  Tiempo de inicio : ${timing.endTime}`);
    console.log(`   ⏱️  Tiempo de fin    : ${timing.endTime}`);
    console.log(`   ⏱️  Duración total   : ${timing.duracion}`);
    console.log(`================================================================\n`);

    console.log(`\n📊 ==================== REPORTES GENERADOS ====================`);
    console.log(`   Execution ID:     ${this.executionId}`);
    console.log(`   Total Exitosos:   ${exitos.length}`);
    console.log(`   Total Fallidos:   ${fallos.length}`);
    console.log(`   ------------------------------------------------------------`);
    console.log(`   📄 JSON Maestro:  ${jsonPath}`);
    console.log(`   📗 CSV Éxitos:    ${csvExitosPath}`);
    console.log(`   📕 CSV Fallos:    ${csvFallosPath}`);
    console.log(`===============================================================\n`);
  }

  /**
   * Guarda una fotografía (snapshot) en JSON del estado actual en memoria 
   * para inspección rápida en desarrollo.
   */
  public hacerDumpTemporal(outputDir: string = './output'): string {
    const tempFolder = path.join(outputDir, this.executionId, 'debug');
    
    if (!fs.existsSync(tempFolder)) {
      fs.mkdirSync(tempFolder, { recursive: true });
    }

    const exitos = this.eventos.filter((e) => e.esExito);
    const fallos = this.eventos.filter((e) => !e.esExito);

    const snapshotData = {
      executionId: this.executionId,
      fechaInicio: this.fechaInicio,
      timestampSnapshot: new Date().toISOString(),
      resumenActual: {
        totalEncontrados: this.listadoInicial.length,
        totalProcesados: this.detallesExpedientes.length,
        totalExitosos: exitos.length,
        totalFallidos: fallos.length
      },
      listadoInicial: this.listadoInicial,
      detallesExpedientes: this.detallesExpedientes,
      exitos: exitos,
      fallos: fallos,
      eventosTotales: this.eventos
    };

    const dumpPath = path.join(tempFolder, 'snapshot_temp.json');
    fs.writeFileSync(dumpPath, JSON.stringify(snapshotData, null, 2), 'utf-8');
    
    console.log(`📸 [DEBUG DUMP] Estado actual volcado a: ${dumpPath}`);
    return dumpPath;
  }
}