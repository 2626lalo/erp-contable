FROM node:18-alpine

# Instalar Tesseract para OCR
RUN apk add --no-cache tesseract-ocr

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos
COPY . .

# Instalar http-server
RUN npm install -g http-server

# Exponer puerto
EXPOSE 8080

# Comando para servir archivos estáticos
CMD ["http-server", "-p", "8080", "-c-1", "--cors", "-a", "0.0.0.0"]
