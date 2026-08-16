import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { create, listMine, updateStatus } from './lead.controller';

export const leadRouter = Router();

leadRouter.post('/', create); // public
leadRouter.get('/mine', requireAuth, listMine);
leadRouter.patch('/:id', requireAuth, updateStatus);
