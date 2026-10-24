import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api/fastlipa': {
        target: 'https://api.fastlipa.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fastlipa/, '')
      },
      '/api/palmpesa': {
        target: 'https://palmpesa.drmlelwa.co.tz',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/palmpesa/, '')
      },
      '/api/sonicpesa': {
        target: 'https://api.sonicpesa.com/api/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sonicpesa/, '')
      },
      '/api/snippe': {
        target: 'https://api.snippe.sh',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/snippe/, '')
      },
      '/api/azam-epg': {
        target: 'https://api.aztv.videoready.tv',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/azam-epg/, ''),
        headers: {
          'platform': 'web',
          'language': 'eng',
          'local': 'tz',
          'tenantCode': 'azamtv'
        }
      },
      '/api/cdn-token': {
        target: 'https://www.tweve.online',
        changeOrigin: true
      }
    }
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
