FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_FEATURE_LINK_DARES=0
ARG VITE_FEATURE_PROOFS=0
ENV VITE_FEATURE_LINK_DARES=$VITE_FEATURE_LINK_DARES
ENV VITE_FEATURE_PROOFS=$VITE_FEATURE_PROOFS
RUN npm run build
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
