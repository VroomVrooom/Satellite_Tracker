# ---- Build stage ----
FROM node:20 AS build
WORKDIR /app

# Copy dependency files
COPY frontend/package*.json ./
RUN npm ci

# Copy ONLY the contents of frontend (not the folder)
COPY frontend/ ./
RUN npm run build

# ---- Runtime stage ----
FROM nginx:alpine

# Remove default Nginx config and add SPA config
RUN rm -f /etc/nginx/conf.d/default.conf
COPY frontend/nginx-spa.conf /etc/nginx/conf.d/default.conf

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
