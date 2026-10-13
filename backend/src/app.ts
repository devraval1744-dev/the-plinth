import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import apiRoutes from './routes/index';
import { errorHandler, notFound } from './middleware/error.middleware';

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true, // Required for httpOnly cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Body parsing ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(env.COOKIE_SECRET));

// ─── Logging ─────────────────────────────────────────────────────────────────

if (env.isDev) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api', apiRoutes);

// ─── Static file serving (local dev uploads) ──────────────────────────────────
// In production replace with cloud CDN / signed URLs

app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// ─── 404 & Error handlers ────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

export default app;
