#--------------------------------------------------------------------------------------------------
#  STAGE 1: Build the Project
#--------------------------------------------------------------------------------------------------

FROM node:22.15-alpine3.21 AS builder

# Establecer el directorio de trabajo
WORKDIR /usr/src/app

# Copiar archivos necesarios para instalar dependencias
COPY yarn.lock ./
COPY package.json ./
COPY tsconfig*.json ./

# Variables de entorno para la etapa de construcción
ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

# Instalar dependencias
RUN yarn install --frozen-lockfile

# Copiar el resto del código fuente
COPY . .

# Construir el proyecto
RUN yarn build

# Reducir el tamaño eliminando dependencias de desarrollo
RUN yarn install --production --frozen-lockfile && yarn cache clean


#--------------------------------------------------------------------------------------------------
#  STAGE 2: Configurar la imagen para producción
#--------------------------------------------------------------------------------------------------

FROM node:22.15-alpine3.21

# Establecer el directorio de trabajo
WORKDIR /usr/src/app

# Copiar dependencias instaladas y código compilado desde la etapa anterior
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY package.json ./

# Exponer puerto
EXPOSE 3000

ARG MONGO_DB_ENV=ath-mongo
ENV API_KEY=${API_KEY}
ENV APP_NAME=${APP_NAME}
ENV DB_HOST=${DB_HOST}
ENV ENVIRONMENT=${ENVIRONMENT}
ENV FIREBASE_CREDENTIALS=${FIREBASE_CREDENTIALS}
ENV JWT_SECRET=${JWT_SECRET}
ENV NODE_ENV=${NODE_ENV}
ENV PORT=${PORT}
ENV REDIS_HOST=${REDIS_HOST}
ENV REDIS_PASSWORD=${REDIS_PASSWORD}
ENV REDIS_PORT=${REDIS_PORT}
ENV REDIS_ROOT_KEY=${REDIS_ROOT_KEY}
ENV REDIS_TTL=${REDIS_TTL}
ENV SA_EMAIL=${SA_EMAIL}
ENV SA_PWD=${SA_PWD}
ENV SEED_ENABLED_VAULT=${SEED_ENABLED_VAULT}
ENV SEED_ENABLED=${SEED_ENABLED}
ENV SMS_API_URL=${SMS_API_URL}
ENV SMS_TOKEN=${SMS_TOKEN}
ENV VAULT_ADDR=${VAULT_ADDR}
ENV VAULT_KV_MOUNT=${VAULT_KV_MOUNT}
ENV VAULT_NAMESPACE=${VAULT_NAMESPACE}
ENV VAULT_ROLE_ID=${VAULT_ROLE_ID}
ENV VAULT_SECRET_ID=${VAULT_SECRET_ID}
ENV VAULT_TOKEN=${VAULT_TOKEN}

# Run Project
CMD ["node", "dist/main"]
