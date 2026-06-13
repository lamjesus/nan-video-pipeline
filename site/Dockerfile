# Sirve SOLO la documentación (Astro Starlight) como estático con nginx.
# Pensado para una App de NaN (https://nan.builders/docs/apps): conecta este
# repo, build context = site/, puerto 80. La URL pública la da NaN
# (*.apps.nan.builders), sin depender de GitHub Pages / Actions.
#
# Build local de prueba:
#   docker build -t nan-video-docs site/
#   docker run -p 8080:80 nan-video-docs   # → http://localhost:8080
FROM node:22-alpine AS build
WORKDIR /site
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
# En una App de NaN la doc se sirve en la raíz del subdominio, no en /nan-video-pipeline.
ENV SITE_BASE=/
ENV SITE_URL=https://nan-video-docs.apps.nan.builders
RUN yarn build

FROM nginx:alpine
COPY --from=build /site/dist/ /usr/share/nginx/html/
EXPOSE 80
