/**
 * Opciones ingresadas por la línea de comandos (CLI)
 */
export interface CliOptions {
  date?: string | undefined;
  processId?: string | undefined;
  limit: number;
}