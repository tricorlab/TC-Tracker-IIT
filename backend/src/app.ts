import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.config.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.middleware.js';
import { validateOrigin, validateCsrfToken } from './middlewares/csrf.middleware.js';

const app = express();

// Enable trust proxy so Express resolves req.ip correctly from reverse proxies (Nginx, Render, Cloudflare)
app.set('trust proxy', 1);

const trustedOrigin = config.frontendUrl.replace(/\/$/, '');

// Enable strict CORS: credentials are only permitted for the explicitly trusted frontend origin
app.use(
  cors({
    origin: (requestOrigin, callback) => {
      // Allow requests with no origin (e.g. server-to-server or test runners)
      if (!requestOrigin) return callback(null, true);
      const normalized = requestOrigin.replace(/\/$/, '');
      if (normalized === trustedOrigin) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy blocked access from origin: ${requestOrigin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'x-csrf-token'],
  })
);

// Standard HTTP Security Headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Cookie parsing middleware
app.use(cookieParser());

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global CSRF Protection: Validate Origin & Anti-CSRF token on all state-changing methods
app.use(validateOrigin);
app.use(validateCsrfToken);

// Normalize double slashes in incoming request URLs (e.g. //api -> /api)
app.use((req, _res, next) => {
  if (req.url && req.url.startsWith('//')) {
    req.url = req.url.replace(/^\/+/, '/');
  }
  next();
});

// Root health/welcome endpoint
app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'TC Tracker Backend API is running',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
    },
  });
});

// REST API routes (support both /api and fallback /api/api if client baseURL included /api)
app.use('/api/api', apiRouter);
app.use('/api', apiRouter);

// 404 Route handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
  });
});

// Centralized error handling middleware
app.use(errorHandler);

export default app;
