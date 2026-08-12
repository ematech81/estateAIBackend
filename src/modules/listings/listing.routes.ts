import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { create, generateDraft, listMine, update } from './listing.controller';

export const listingRouter = Router();

listingRouter.use(requireAuth);

listingRouter.post('/draft', generateDraft);
listingRouter.post('/', create);
listingRouter.get('/mine', listMine);
listingRouter.patch('/:id', update);
