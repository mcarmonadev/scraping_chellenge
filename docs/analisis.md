# 🏛️ Mapeo de Arquitectura y Flujo de Scraping (TRF5)

Este documento detalla la secuencia de navegación, la gestión del estado de vista de JavaServer Faces (JSF / JBoss Seam) y el mecanismo de resiliencia implementado para la extracción de actas y descarga de documentos.

---

## 🔄 1. Diagrama de Secuencia del Flujo

```text
[Cliente Scraper]              [Portal TRF5 (JSF/Seam)]
       |                                  |
       |--- 1. GET (Página Inicial) ----->| (Obtiene cookies JSESSIONID + ViewState inicial)
       |<-- HTML + Cookies + ViewState ---|
       |                                  |
       |--- 2. POST (Búsqueda Form) ----->| (Envía parámetros: date / processId + ViewState)
       |<-- HTML (Tabla Resultados) ------| (Parsea IDs de procesos y enlaces a actas)
       |                                  |
       |=== BUCLE POR EXPEDIENTE / ACTA ==|
       |                                  |
       |--- 3. GET/POST (Detalle Acta) -->| (Obtiene enlaces a documentos/PDFs)
       |<-- HTML (Página Detalle) --------|
       |                                  |
       |--- 4. GET (Stream PDF) --------->| (Maneja redirects/descarga directa de binarios)
       |<-- Binary Buffer (application/pdf)|
       |                                  |
       |=== MANEJO DE RESILIENCIA ========|
       |                                  |
       |--- [Si HTTP 429] ----------------> Backoff Exponencial (Espera N segundos) -> Reintento
       |--- [Si Error Persistente] --------> Loggea en `failed_documents.json` -> Continúa
```


## 🛠️ 2. Mapeo Técnico de Endpoints e Interacciones

Step 1: Inicialización de Sesión

* **Método**: GET
* **Endpoint**: : /pjeconsulta/ConsultaPublica/listView.seam
* **Objetivo**: Establecer la sesión en el application server Java.
* **Salida**: Captura de la cookie de sesión JSESSIONID (gestionada mediante CookieManager) y extracción del valor semilla javax.faces.ViewState.

Step 2: Ejecución de Consulta (CLI Mode)

* **Método**: POST (application/x-www-form-urlencoded)
* **Endpoint**: /pjeconsulta/ConsultaPublica/listView.seam
* **Parámetros Clave**
    * **Modo Fecha**: dtInicio, dtFim, limit
    * **Modo Proceso**: numProcesso / processId
    * **Control JSF**: avax.faces.ViewState obtenido en el paso anterior.

* **Procesamiento**: TableParser (utilizando Cheerio) procesa la tabla HTML devuelta para estructurar el listado de expedientes y sus hipervínculos de acción.


Step 3: Navegación e Inspección de Actas

* **Método**: GET / POST
* **Endpoint**: /pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/documentoSemLoginHTML.seam
* **Procesamiento**: Mantenimiento activo y en cadena del token javax.faces.ViewState actualizado para prevenir excepciones de tipo ViewExpiredException. Se recuperan los identificadores de adjuntos (idProcDocBin) y tokens de autorización (ca).


Step 4: Descarga de Binarios (PDFs)


* **Método**: GET / POST
* **Tipo de Respuesta**: arraybuffer / stream
* **Procesamiento**: PdfDownloaderService realiza la llamada binaria y almacena el buffer de datos directamente en el disco.



## 🛠️ 3. Estrategia de Resiliencia y Auditoría

1. Manejo de Tasa Límite (HTTP 429):

    *  **Encapsulado dentro de ResilientHttpClient.**


    *  **Implementa una estrategia de Exponential Backoff que duplica progresivamente el tiempo de espera entre intentos cuando el servidor TRF5 responde con código 429 Too Many Requests.**


2. Auditoría de Errores y Tolerancia a Fallos:

    * **Si un documento falla tras agotar la cuota de reintentos, la ejecución no se interrumpe.**

    * **El evento se registra con detalle de timestamp, parámetros de la llamada y código HTTP en el archivo central failed_documents.json.**

3. Estructura de Salidas:

    * **Todos los resultados procesados se escriben en la carpeta `./output/RUN_<MODO>_<TIMESTAMP>/` dentro de subdirectorios dedicados para carpetas `/html`, `/pdf` y `/reportes`.**


