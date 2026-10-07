# Stage 1: Build Vite React App
FROM node:20-alpine AS build
WORKDIR /app

# pin pnpm to the version the lockfile was written with (lockfileVersion 9.0 + allowBuilds)
RUN npm i -g pnpm@11.5.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
