# NaN Video Pipeline

De un tema a un video corto narrado (9:16), usando solo los modelos del cluster NaN.

## Desarrollo local

```bash
yarn install
yarn dev        # http://localhost:4321
```

## Docker

```bash
docker build -t nan-video-demo .
docker run -p 8080:8080 nan-video-demo   # http://localhost:8080
```

La imagen usa `nginx-unprivileged` y escucha en el puerto **8080** (no-root), para
ser compatible con clusters con seguridad restringida (NaN Cloud / Kubernetes).

## Desplegar en NaN Cloud Apps

1. Conecta este repo en el panel de NaN Cloud.
2. Dockerfile: `Dockerfile` · Build context: `.`
3. **Container port: `8080`** y marca "Expose over HTTP".
4. URL asignada automáticamente (`*.apps.nan.builders`).

> El puerto **debe** ser 8080: la plataforma no autodetecta el `EXPOSE`, y nginx
> corre como usuario no-root (no puede usar el puerto 80).

## Desplegar en GitHub Pages (plan B)

Automático vía `.github/workflows/deploy-pages.yml` en cada push a `master`.

1. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. La `base` se deriva del nombre del repo en tiempo de build, así que la URL es:
   `https://<owner>.github.io/<repo>/`.

Para construir el mismo sitio en local con la base de Pages:

```bash
SITE_BASE=/nan-video-pipeline-demo/ SITE_URL=https://mlorentedev.github.io yarn build
```
