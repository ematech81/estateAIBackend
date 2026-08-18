import { Router } from 'express';
import { getBySlug, list } from './blog.controller';

// Public reads only. Admin writes live under a completely separate prefix
// (/api/blog-admin, see modules/blogAdmin/) rather than nested under this
// one — avoids any literal-path-vs-:slug ordering foot-gun entirely (the
// same class of bug already guarded against for /listings/mine).
export const blogRouter = Router();

blogRouter.get('/', list);
blogRouter.get('/:slug', getBySlug);
