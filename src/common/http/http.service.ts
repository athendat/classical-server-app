// Nest Modules
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService as AxiosHttpService } from '@nestjs/axios';

// Third-Party Modules
import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

/**
 * Servicio que gestiona las solicitudes HTTP
 */
@Injectable()
export class HttpService {
  /**
   * Constructor
   *
   * @param httpService
   */
  constructor(private readonly _httpService: AxiosHttpService) {}

  // -----------------------------------------------------------------------------------------------------
  // @ Public methods
  // -----------------------------------------------------------------------------------------------------

  /**
   * Realiza una solicitud GET
   *
   * @param url
   * @param config
   * @returns
   */
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await firstValueFrom(
        this._httpService.get<T>(url, config),
      );
      return response.data;
    } catch (error) {
      this.#handleError(error);
    }
  }

  /**
   * Realiza una solicitud POST
   *
   * @param url
   * @param data
   * @param config
   * @returns
   */
  async post<T>(
    url: string,
    data: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response: AxiosResponse<T> = await firstValueFrom(
        this._httpService.post<T>(url, data, config),
      );
      return response.data;
    } catch (error) {
      this.#handleError(error);
    }
  }

  /**
   * Realiza una solicitud PUT
   *
   * @param url
   * @param data
   * @param config
   * @returns
   */
  async put<T>(
    url: string,
    data: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response: AxiosResponse<T> = await firstValueFrom(
        this._httpService.put<T>(url, data, config),
      );
      return response.data;
    } catch (error) {
      this.#handleError(error);
    }
  }

  /**
   * Realiza una solicitud DELETE
   *
   * @param url
   * @param config
   * @returns
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await firstValueFrom(
        this._httpService.delete<T>(url, config),
      );
      return response.data;
    } catch (error) {
      this.#handleError(error);
    }
  }

  // -----------------------------------------------------------------------------------------------------
  // @ Private methods
  // -----------------------------------------------------------------------------------------------------

  /**
   * Manejar errores de la solicitud HTTP
   *
   * @param error
   */
  #handleError(error: AxiosError): never {
    console.log({ error });
    console.log({ response: error.response });

    if (error.response) {
      // El servidor respondió con un estado diferente de 2xx
      const httpException = new HttpException(
        error.response.data || 'Error en la solicitud HTTP',
        error.response.status,
      );
      // Adjuntar el objeto de respuesta de Axios para que esté disponible en los consumidores
      (httpException as any).response = error.response;
      throw httpException;
    } else if (error.request) {
      // La solicitud se hizo pero no se recibió respuesta
      throw new HttpException(
        'No se recibió respuesta del servidor',
        HttpStatus.REQUEST_TIMEOUT,
      );
    } else {
      // Ocurrió un error al configurar la solicitud
      throw new HttpException(
        'Error al configurar la solicitud',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
