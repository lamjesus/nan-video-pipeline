# Documentation image (Astro Starlight) served as static files with nginx.
# Target: NaN Cloud Apps (https://nan.builders/docs/apps) or GitHub Pages.
#
# IMPORTANT (NaN Cloud): the platform runs containers as a non-root, restricted
# user (Kubernetes/OpenShift style). Stock `nginx:alpine` listens on port 80,
# which is privileged (<1024) and unbindable by a non-root user, so the pod
# crash-loops and the app stays "pending" with no reachable backend (router 404).
# We use `nginx-unprivileged`, which runs as UID 101 and listens on 8080.
#
# --> In the NaN Cloud panel set "Container port" to 8080.
#
# Local build:
#   docker build -t nan-video-demo .
#   docker run -p 8080:8080 nan-video-demo   # -> http://localhost:8080
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
# On NaN Cloud the docs are served at the root of the subdomain.
ENV SITE_BASE=/
ENV SITE_URL=https://hackathon-mlorentedev-nan-video-demo.apps.nan.builders
RUN yarn build

FROM nginxinc/nginx-unprivileged:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
EXPOSE 8080
