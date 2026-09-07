/**
 * Gestor Singleton de Cookies de Sesión.
 * Mantiene un único punto centralizado de lectura/escritura de la cabecera Cookie
 * para toda la aplicación.
 */
export class CookieManager {
  private static instance: CookieManager;
  private currentCookies: string = '';

  // El constructor privado evita que se creen instancias con 'new CookieManager()'
  private constructor() {}

  /**
   * Obtiene la instancia única de CookieManager
   */
  public static getInstance(): CookieManager {
    if (!CookieManager.instance) {
      CookieManager.instance = new CookieManager();
    }
    return CookieManager.instance;
  }

  /**
   * Retorna el string de la cabecera 'Cookie' guardado actualmente
   */
  public getCookies(): string {
    return this.currentCookies;
  }

  /**
   * Guarda o actualiza el string de la cabecera 'Cookie'
   */
  public setCookies(cookies: string): void {
    if (cookies) {
      this.currentCookies = cookies;
    }
  }

  /**
   * Limpia las cookies almacenadas
   */
  public clear(): void {
    this.currentCookies = '';
  }
}