import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        TanStackRouterVite({
            routesDirectory: './src/routes',
            generatedRouteTree: './src/routeTree.gen.ts',
            routeFileIgnorePrefix: '-',
            quoteStyle: 'single',
        }),
        react({
            babel: {
                plugins: [
                    [
                        '@locator/babel-jsx/dist',
                        { env: 'development' },
                    ],
                ],
            },
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 3000,
        host: true,
        allowedHosts: ["mac.teerut.com"]
    },
    preview: {
        port: 3000,
        host: true,
        allowedHosts: ["mac.teerut.com"]
    },
})
