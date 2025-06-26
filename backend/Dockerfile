# Gunakan Node.js image sebagai base
FROM node:18-alpine

# Set working directory di dalam kontainer
WORKDIR /app

# Copy package.json dan package-lock.json terlebih dahulu untuk mengoptimalkan layer cache
# Karena Dockerfile ini ada di dalam folder 'backend', dan context build akan diatur ke 'backend'
# Maka, perintah COPY akan relatif terhadap folder 'backend' itu sendiri./
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy sisa kode aplikasi backend dari folder 'backend' ke WORKDIR /app
# Karena konteks build adalah 'backend', '.' merujuk pada isi folder 'backend'
COPY . .

# Expose port yang digunakan aplikasi Express Anda
EXPOSE 3003

# Command untuk menjalankan aplikasi
CMD ["npm", "start"]