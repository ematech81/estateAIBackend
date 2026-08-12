import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';
import { listingRouter } from './modules/listings/listing.routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN }));
  app.use(express.json());
  if (env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  app.use('/api/auth', authRouter);
  app.use('/api/listings', listingRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
