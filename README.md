# 🚀 Desafío Técnico: Scraper Judicial Resiliente (TRF5)

Solución de extracción de datos, navegación de actas judiciales y descarga resiliente de documentos desde el portal público **TRF5** utilizando **TypeScript** puro sin automatización de navegador.

---

## 🛠️ Tecnologías y Herramientas

- **Lenguaje:** TypeScript (Modo estricto)
- **Entorno:** Node.js (ES Modules)
- **Cliente HTTP:** Axios (Peticiones HTTP directas, manejo de cookies y sesiones JSF)[cite: 1, 3]
- **HTML Parser:** Cheerio (Extracción rápida con selectores CSS)[cite: 1, 3]

---

## 🏛️ Arquitectura y Aspectos Técnicos

1. **HTTP Puro (Sin Headless Browsers):**  
   Cumple estrictamente con la restricción de **no utilizar Puppeteer, Playwright o Selenium**[cite: 1, 3]. Todo el flujo de navegación, estado de vista (`javax.faces.ViewState`) y sesiones JSF/Seam se resuelve mediante peticiones HTTP directas (GET/POST)[cite: 1, 3].

2. **Resiliencia y Control de Rate Limit (HTTP 429):**  
   Implementación de **Exponential Backoff** en el cliente de peticiones[cite: 1, 3]. Ante respuestas con código HTTP 429 (*Too Many Requests*), el sistema incrementa de forma exponencial el tiempo de espera antes de reintentar la solicitud[cite: 1, 3].

3. **Manejo de Errores y Registro de Auditoría:**  
   Si la descarga de un documento falla tras superar el número máximo de reintentos, el incidente se registra en el archivo `failed_documents.json`[cite: 1, 3] para su posterior auditoría sin detener la ejecución global[cite: 1, 3].

4. **Diseño Modular y Escalable:**  
   Estructurado mediante clases orientadas a servicios (`ScraperService`, `TableParser`, `PdfDownloaderService`, `CookieManager`, etc.)[cite: 2], facilitando el mantenimiento y la separación de responsabilidades.

---

## 📁 Estructura del Repositorio

```text
.
├── src/
│   ├── clients/       # Clientes HTTP y manejo de resiliencia
│   ├── parsers/       # Extracción y parsing de datos HTML
│   ├── services/      # Servicios principales de Scraping y Descargas
│   ├── types/         # Interfaces y definiciones de TypeScript
│   ├── utils/         # Helpers (Cookies, logs, etc.)
│   └── index.ts       # Punto de entrada principal de la aplicación
├── docs/              # Documentación técnica adicional
├── .gitignore         # Exclusión de artefactos y descargas pesadas
├── package.json       # Configuración del proyecto y dependencias
├── README.md          # Documentación general
└── tsconfig.json      # Configuración del compilador TypeScript
```

## ⚙️ Requisitos Previos

- **Node.js** (v20.x o superior)
- **npm** (v9.x o superior)
- **Conexión VPN activa** (si se requiere para el portal judicial)

> 💡 **Nota:** Si ejecutas el proyecto mediante **Docker**, no es necesario instalar Node.js v20+ en tu sistema host, ya que el contenedor incluye la versión `node:20-alpine` preconfigurada.

---

## 🚀 Instalación y Ejecución

1. **Clonar el repositorio:**
    ```bash
   git clone <URL_DE_TU_REPOSITORIO>
   cd <NOMBRE_DE_LA_CARPETA>


2. **Instalar dependencias:**
    npm install



3. **Compilar el proyecto:**
    npm run build



4. **Ejecutar en producción / desarrollo:**
    npm start



##  Indicaciones para ejecución 


1. **Modalidades:**

    La implementación permite invocarse en dos modalidades, por fecha (1 sólo dia), ó por id_expediente (id del proceso judicial)

* **`Por id Expediente`**: El identificador del expdiente en el site.

    ```bash
   npm run start -- --processId 0002035-77.2009.4.05.8200
   ```

* **`Por Fecha - Día`**: Día en formato DD/MM/YYYY, y segundo parámetro restricción Limit (default 30 ya que es la limitación establecida en el site)
    ```bash
   npm run start -- --date 21/08/2026 --limit 2 
   ```
      
2. **Scripts de conveniencia:**

    Hay 2 scripts a nivel del package.json, para hacer invocaciones de muestra

* **`start:id_process`**: Invoca por processId de ejemplo, y la muestra es con el ID 0803294-73.2015.4.05.8100

    ```bash
   npm run start:id_process
   ```

* **`start:date`**: Invoca por fecha 21/08/2026 y limite 3.

    ```bash
   npm run start:date
   ```
## 📊 Archivos de Salida

* **`output/`**: Resultados procesados o reportes generados. Se genera un directorio independiente por cada ejecución.

  * **Ubicación y Estructura:**  
    Los nombres de los subdirectorios reflejan el tipo de llamada, el filtro de búsqueda y el timestamp de la ejecución.

  * **Ejemplos de carpetas generadas:**  
    `./output/RUN_BY_DATE_21-08-2026_AT_2026-09-07_08-12-17`  
    `./output/RUN_BY_PROC_0803294-73.2015.4.05.8100_AT_2026-09-07_08-12-30`

  * **Contenido de cada subdirectorio:**  
    Cada subdirectorio de ejecución contiene 3 carpetas internas y los informes finales:
    - `./html`: Copias HTML capturadas durante la extracción.
    - `./pdf`: Archivos PDF descargados y organizados.
    - `./reportes`: Archivos consolidados de resumen (JSON y CSV).

* **`failed_documents.json`**: Registro detallado de fallos con timestamps y errores HTTP (si aplican).


---

## 🐳 Ejecución opcional mediante Docker

Si prefieres ejecutar el proyecto en un contenedor aislado en lugar de tu entorno local de Node.js:

1. **Construir la imagen:**
   ```bash
   docker build -t scraper-trf5 .
   ```

2. **Ejecutar mapeando el volumen de salidas:**

    Con el parámetro -v, los reportes, HTMLs y PDFs generados por la app se guardan directamente en la carpeta ./output de tu máquina física:

   ```bash
   docker run --rm -v "${PWD}/output:/app/output" scraper-trf5
   ```


    Ejecución con argumentos CLI predefinidos (recomendado):

   ```bash
   docker run --rm -v "${PWD}/output:/app/output" scraper-trf5 npm start -- --date 21/08/2026 --limit 3
   ```


---

## 📄 Licencia

Este proyecto fue desarrollado con fines de evaluación técnica para el desafío de extracción de datos en TRF5.
    
