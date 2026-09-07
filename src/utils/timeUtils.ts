export class TimeUtils {
  /**
   * Pausa la ejecución por un número exacto de milisegundos.
   * @param ms Milisegundos a esperar
   */
  public static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Pausa la ejecución por un tiempo aleatorio entre un mínimo y un máximo (jitter).
   * Ideal para evitar rate-limiting y bloqueos por comportamiento de bot.
   * @param minMs Tiempo mínimo de espera en milisegundos
   * @param maxMs Tiempo máximo de espera en milisegundos
   */
  public static async delay(minMs: number, maxMs: number): Promise<number> {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await TimeUtils.sleep(ms);
    return ms; // Retorna los ms calculados por si quieres imprimir el log exacto
  }
}