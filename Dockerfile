# Используем официальный образ Node.js на базе Alpine для меньшего размера
FROM node:20-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json (если есть)
COPY package*.json ./

# Устанавливаем зависимости
# Если есть package-lock.json используем ci, иначе install
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

# Копируем остальные файлы приложения
COPY . .

# Создаем непривилегированного пользователя для безопасности
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Переключаемся на непривилегированного пользователя
USER nodejs

# Открываем порт (если бот использует веб-хуки, измените на нужный)
# EXPOSE 3000

# Запускаем приложение
CMD ["node", "bot.js"]