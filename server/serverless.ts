import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import { apiRouter } from './routes';
import { ensureDbConnected } from './db';

const app = express();

// 1. Compression Middleware (Memangkas ukuran transfer payload JSON)
app.use(
  compression({
    threshold: 1024, // Kompresi response >= 1KB
    level: 6,
    filter: (req, res) => {
      const contentType = res.getHeader('Content-Type') as string;
      if (contentType && /(image\/jpeg|image\/png|image\/webp|application\/pdf)/i.test(contentType)) {
        return false;
      }
      return compression.filter(req, res);
    },
  }) as any
);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));

// 2. Vercel Edge Caching & Response Optimization Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  // Edge CDN dan browser membedakan cache berdasarkan encoding (gzip/br)
  res.setHeader('Vary', 'Accept-Encoding');

  const fullUrl = req.originalUrl || req.url;
  const isGetOrHead = req.method === 'GET' || req.method === 'HEAD';

  if (!isGetOrHead) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return next();
  }

  // Private / Sensitive / Health routes: Jangan pernah di-cache di Edge
  if (
    fullUrl.includes('/health') ||
    fullUrl.includes('/admins') ||
    fullUrl.includes('/auth') ||
    fullUrl.includes('/database') ||
    fullUrl.includes('/check-status') ||
    req.headers.authorization
  ) {
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return next();
  }

  // Media view endpoint: Aset biner (Cache 7 hari di Edge, 24 jam di browser)
  if (fullUrl.includes('/media/view')) {
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    return next();
  }

  // Matches / Live Score: Cache singkat di Edge (15 detik) untuk meredam spam request
  if (fullUrl.includes('/matches')) {
    res.setHeader('Cache-Control', 'public, max-age=5, s-maxage=15, stale-while-revalidate=45');
    return next();
  }

  // Dataset publik turnamen yang jarang berubah (Config, Kategori, Sponsor)
  if (fullUrl.includes('/config') || fullUrl.includes('/categories') || fullUrl.includes('/sponsors')) {
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=120, stale-while-revalidate=600');
    return next();
  }

  // List pendaftaran publik
  if (fullUrl.includes('/registrations')) {
    res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=30, stale-while-revalidate=90');
    return next();
  }

  // Default fallback GET rute lainnya
  res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=60, stale-while-revalidate=300');
  next();
});

// 3. Database Connection Middleware (Aman dari Cold-Start Race Condition)
app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureDbConnected();
    next();
  } catch (err: any) {
    console.error('[Vercel Serverless DB Init Error]', err?.message || err);
    res.status(500).json({
      success: false,
      error: 'Database connection failed during cold-start',
    });
  }
});

// 4. API Routers
app.use('/api', apiRouter);
app.use('/', apiRouter);

// 5. 404 Fallback (Hanya dieksekusi jika tidak ada rute yang cocok)
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `API Route Not Found: ${req.method} ${req.originalUrl || req.url}`,
  });
});

// 6. Centralized Error Handlers (Ditaruh PALING BAWAH setelah semua router)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // Tangani payload request melebihi limit
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({
      success: false,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Ukuran payload data melebihi batas 4MB Vercel. Gunakan unggah berkas langsung ke cloud storage.',
    });
  }

  // Tangani format JSON invalid dari client
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_JSON',
      message: 'Format payload JSON tidak valid.',
    });
  }

  console.error('[API Serverless Error]', err);
  res.status(err.status || 500).json({
    success: false,
    error: err?.message || 'Internal Server Error',
  });
});

// Penanganan unhandled promise agar serverless container tidak exit diam-diam
if (typeof process !== 'undefined') {
  process.on('unhandledRejection', (reason: any) => {
    console.warn('[Vercel Serverless Non-Fatal Rejection]', reason?.message || reason);
  });
  process.on('uncaughtException', (err: any) => {
    console.warn('[Vercel Serverless Non-Fatal Exception]', err?.message || err);
  });
}

export default app;