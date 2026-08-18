import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middleware/auth.middleware';
import { create, getOne, listAll, remove, update } from './blogAdmin.controller';

export const blogAdminRouter = Router();

// A blanket router.use() is safe here specifically because every single
// route on this router is admin-only — there's no public route mixed in
// (unlike listings/users, where per-route auth is required and a blanket
// call would have broken the public routes).
blogAdminRouter.use(requireAuth, requireAdmin);
blogAdminRouter.get('/', listAll);
blogAdminRouter.get('/:id', getOne);
blogAdminRouter.post('/', create);
blogAdminRouter.patch('/:id', update);
blogAdminRouter.delete('/:id', remove);
