FROM node:alpine
WORKDIR /app

COPY package*.json .
RUN npm install && npm cache clean --force

COPY . .

RUN npx prisma generate

EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push && npm run prisma:seed && npm run dev"]
