FROM node:20.11-alpine3.19 AS development

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "npm run migration:run && npm run seed && npm run start:dev"]