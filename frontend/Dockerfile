FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# VITE_* values are public browser configuration, never server credentials.
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_KAKAO_JS_KEY
ARG VITE_GOOGLE_MAPS_API_KEY
ARG DEPLOY_SHA=development
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_KAKAO_JS_KEY=${VITE_KAKAO_JS_KEY}
ENV VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY}
RUN node -e 'if (!process.env.VITE_KAKAO_JS_KEY?.trim()) { console.error("Set a non-blank VITE_KAKAO_JS_KEY build argument to enable Kakao Maps."); process.exit(1); }' \
    && npm run build \
    && node -e 'require("fs").writeFileSync("build/deploy-version.json", JSON.stringify({commit: process.argv[1]}))' "$DEPLOY_SHA"

FROM nginx:stable-alpine
ARG DEPLOY_SHA=development
LABEL org.opencontainers.image.revision=${DEPLOY_SHA}
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/ /usr/share/nginx/html/
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=5 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
EXPOSE 80
