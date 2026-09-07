# 1. Imagen base ligera con Node.js
FROM node:20-alpine

# 2. Directorio de trabajo
WORKDIR /app

# 3. Copiar manifiestos e instalar dependencias
COPY package*.json ./
RUN npm ci

# 4. Copiar código fuente y archivos de configuración
COPY tsconfig.json ./
COPY src/ ./src/

# 5. Compilar TypeScript a JavaScript (dist/)
RUN npm run build

# 6. Crear la carpeta de salida por defecto
RUN mkdir -p output

# 7. Comando por defecto al arrancar el contenedor
CMD ["npm", "start"]