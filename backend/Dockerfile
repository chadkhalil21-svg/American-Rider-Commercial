# Staging candidate for Google Cloud Run. Do NOT route live Stripe traffic here
# until durable scheduled work, secret provisioning and rollback have passed.
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /srv
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
USER node
EXPOSE 8080
CMD ["node","server.js"]
