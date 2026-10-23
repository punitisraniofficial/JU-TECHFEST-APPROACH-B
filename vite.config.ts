import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import scanHandler from './api/scan-prescription.js';
import healthHandler from './api/health.js';

function paddleOcrDevPlugin(): Plugin {
  return {
    name: 'paddle-ocr-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/scan-prescription') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              (req as any).body = body ? JSON.parse(body) : {};
            } catch {
              (req as any).body = {};
            }
            const fakeRes: any = {
              status(code: number) {
                res.statusCode = code;
                return fakeRes;
              },
              setHeader(k: string, v: string) {
                res.setHeader(k, v);
                return fakeRes;
              },
              json(data: any) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
              },
              end(data?: any) {
                res.end(data);
              }
            };
            await scanHandler(req as any, fakeRes);
          });
          return;
        }

        if (req.url?.startsWith('/api/health') && req.method === 'GET') {
          const fakeRes: any = {
            status(code: number) {
              res.statusCode = code;
              return fakeRes;
            },
            setHeader(k: string, v: string) {
              res.setHeader(k, v);
              return fakeRes;
            },
            json(data: any) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
            },
            end(data?: any) {
              res.end(data);
            }
          };
          healthHandler(req as any, fakeRes);
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), paddleOcrDevPlugin()],
  server: {
    host: true,
    port: 3000,
    open: false
  }
});
