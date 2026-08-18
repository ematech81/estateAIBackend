import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';
import { listingRouter } from './modules/listings/listing.routes';
import { userRouter } from './modules/users/user.routes';
import { leadRouter } from './modules/leads/lead.routes';
import { uploadRouter } from './modules/uploads/upload.routes';
import { analyticsRouter } from './modules/analytics/analytics.routes';
import { blogRouter } from './modules/blog/blog.routes';
import { blogAdminRouter } from './modules/blogAdmin/blogAdmin.routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

// In production, only the configured WEB_ORIGIN is allowed. In development,
// accept any localhost/127.0.0.1 origin regardless of port — Next.js's dev
// server auto-picks the next free port if its default is already taken
// (e.g. by an unrelated project also running locally), so pinning WEB_ORIGIN
// to one port makes CORS fail unpredictably rather than reflecting an actual
// security decision.
const corsOrigin: cors.CorsOptions['origin'] =
  env.NODE_ENV === 'production'
    ? env.WEB_ORIGIN
    : (origin, callback) => {
        if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      };

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());
  if (env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  app.use('/api/auth', authRouter);
  app.use('/api/listings', listingRouter);
  app.use('/api/users', userRouter);
  app.use('/api/leads', leadRouter);
  app.use('/api/uploads', uploadRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/blog', blogRouter);
  app.use('/api/blog-admin', blogAdminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
