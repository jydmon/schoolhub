# SchoolHub production image
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# --- deps ---
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# --- build ---
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
# Run migrations then start (use `prisma migrate deploy` once migrations exist).
CMD ["sh", "-c", "npx prisma migrate deploy || npx prisma db push; npm start"]
