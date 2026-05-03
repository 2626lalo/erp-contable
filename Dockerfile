FROM node:18-alpine

# Instalar Tesseract para OCR
RUN apk add --no-cache tesseract-ocr

# Instalar servidor web
RUN npm install -g http-server

# Crear directorio de trabajo
WORKDIR /app

# Copiar todos los archivos
COPY . .

# Exponer puerto
EXPOSE 8080

# Comando para servir archivos estáticos
CMD ["http-server", "-p", "8080", "-c-1", "--cors", "-a", "0.0.0.0"]
