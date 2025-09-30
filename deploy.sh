#!/usr/bin/env bash
set -euo pipefail

# config
REPO_URL="https://github.com/buberlo/What-are-the-odds"
APP_NAME="what-are-the-odds"
APP_NS="default"
DOMAIN="whate-are-the-odds.com"
INGRESS_CLASS="public"
REGISTRY="localhost:32000"             # microk8s registry
IMAGE_BASE="${REGISTRY}/${APP_NAME}"
TLS_SECRET="whate-are-the-odds-com-tls"
CLUSTER_ISSUER="letsencrypt-dns"
FORCE_SSL_REDIRECT="true"

need(){ command -v "$1" >/dev/null 2>&1 || { echo "missing: $1"; exit 1; }; }
need git; need docker; need kubectl

# sync to upstream default branch
if [ ! -d .git ]; then
  git clone --depth 1 "$REPO_URL" ./
fi
git remote set-url origin "$REPO_URL"
git fetch origin --prune
DEFBR="$(git remote show origin | sed -n 's/.*HEAD branch: //p' | head -n1)"; DEFBR="${DEFBR:-main}"
git checkout -B "$DEFBR" || git checkout "$DEFBR"
git reset --hard "origin/${DEFBR}"

# ensure Dockerfile + nginx.conf
[ -f Dockerfile ] || cat > Dockerfile <<'DOCKER'
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
DOCKER

[ -f nginx.conf ] || cat > nginx.conf <<'NGINX'
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
  location /assets/ { try_files $uri =404; }
}
NGINX

# build + push image
SHA="$(git rev-parse --short HEAD)"
IMG_SHA="${IMAGE_BASE}:${SHA}"
IMG_LATEST="${IMAGE_BASE}:latest"
docker build -t "${IMG_SHA}" -t "${IMG_LATEST}" .
docker push "${IMG_SHA}"
docker push "${IMG_LATEST}"

# ensure k8s manifest
[ -f k8s.yaml ] || cat > k8s.yaml <<YAML
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${APP_NAME}
  labels: { app: ${APP_NAME} }
spec:
  replicas: 1
  selector: { matchLabels: { app: ${APP_NAME} } }
  template:
    metadata: { labels: { app: ${APP_NAME} } }
    spec:
      containers:
        - name: web
          image: ${IMAGE_BASE}:latest
          imagePullPolicy: IfNotPresent
          ports: [{ containerPort: 80 }]
          readinessProbe: { httpGet: { path: "/", port: 80 }, initialDelaySeconds: 2, periodSeconds: 5 }
          livenessProbe:  { httpGet: { path: "/", port: 80 }, initialDelaySeconds: 10, periodSeconds: 10 }
---
apiVersion: v1
kind: Service
metadata:
  name: ${APP_NAME}
  labels: { app: ${APP_NAME} }
spec:
  type: ClusterIP
  selector: { app: ${APP_NAME} }
  ports:
    - name: http
      port: 80
      targetPort: 80
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${APP_NAME}
  annotations:
    cert-manager.io/cluster-issuer: ${CLUSTER_ISSUER}
    nginx.ingress.kubernetes.io/force-ssl-redirect: "${FORCE_SSL_REDIRECT}"
    nginx.ingress.kubernetes.io/from-to-www-redirect: "true"
spec:
  ingressClassName: ${INGRESS_CLASS}
  tls:
    - hosts: ["${DOMAIN}","www.${DOMAIN}"]
      secretName: ${TLS_SECRET}
  rules:
    - host: ${DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: ${APP_NAME}, port: { number: 80 } } }
    - host: www.${DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: ${APP_NAME}, port: { number: 80 } } }
YAML

# apply and roll to immutable image
kubectl apply -n "${APP_NS}" -f k8s.yaml
kubectl -n "${APP_NS}" set image "deployment/${APP_NAME}" web="${IMG_SHA}" || true
kubectl -n "${APP_NS}" rollout status "deployment/${APP_NAME}"

# output
echo "commit: ${SHA}"
echo "image : ${IMG_SHA}"
echo "open  : https://${DOMAIN}"
