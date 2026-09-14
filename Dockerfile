FROM node:alpine
WORKDIR /app

RUN apk add --no-cache curl && \
    wget -O /tmp/stripe.tar.gz https://github.com/stripe/stripe-cli/releases/download/v1.50.5/stripe_1.50.5_linux_x86_64.tar.gz && \
    tar -xzf /tmp/stripe.tar.gz -C /usr/local/bin/ stripe && \
    rm /tmp/stripe.tar.gz && \
    chmod +x /usr/local/bin/stripe && \
    apk del curl

COPY package*.json .
RUN npm install && npm cache clean --force

COPY . .

RUN npx prisma generate

EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push && npm run prisma:seed & stripe listen --api-key ${STRIPE_SECRET_KEY} --forward-to http://localhost:4000/api/webhook/stripe --forward-connect-to http://localhost:4000/api/webhook/stripe & npm run dev"]
