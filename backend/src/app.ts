import express from 'express';
import cors from 'cors';
import { config } from './config/env.config.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.middleware.js';

const app = express();

// Enable CORS
app.use(
  cors({
    origin: config.frontendUrl || '*',
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// REST API routes
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
