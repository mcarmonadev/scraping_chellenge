//import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';

export interface IHttpClient {
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
}

/**
 * Cliente HTTP encargado de la persistencia de sesión y resiliencia (Exponential Backoff ante 429).
 */
export class ResilientHttpClient implements IHttpClient {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      withCredentials: true,
      timeout: 20000,
    });
  }

  /**
   * Ejecuta peticiones HTTP envolviendo la llamada en una política de reintentos exponenciales ante 429
   */
  public async executeWithRetry<T>(
    requestFn: () => Promise<AxiosResponse<T>>,
    retries = 3,
    delayMs = 1500
  ): Promise<AxiosResponse<T>> {
    try {
      return await requestFn();
    } catch (error: any) {
      const is429 = error.response && error.response.status === 429;

      if (is429 && retries > 0) {
        console.warn(
          `⚠️ [HTTP 429] Demasiadas peticiones. Reintentando en ${delayMs / 1000}s... (Quedan ${retries} intentos)`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        // Incremento exponencial del tiempo de espera
        return this.executeWithRetry(requestFn, retries - 1, delayMs * 2);
      }

      throw error;
    }
  }

  public async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.executeWithRetry(() => this.client.get<T>(url, config));
  }

  public async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.executeWithRetry(() => this.client.post<T>(url, data, config));
  }

  public get axiosInstance(): AxiosInstance {
    return this.client;
  }
  
}