import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { create, generateDraft, listMine, search, update } from './listing.controller';

export const listingRouter = Router();

// Public — must be registered before requireAuth below.
listingRouter.get('/', search);

listingRouter.use(requireAuth);

listingRouter.post('/draft', generateDraft);
listingRouter.post('/', create);
listingRouter.get('/mine', listMine);
listingRouter.patch('/:id', update);
