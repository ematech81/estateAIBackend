import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { create, generateDraft, getById, listMine, search, update } from './listing.controller';

export const listingRouter = Router();

// Public. '/mine' is a literal path and must stay registered before the
// '/:id' param route below it, or Express would treat "mine" as an id.
listingRouter.get('/', search);
listingRouter.get('/mine', requireAuth, listMine);
listingRouter.get('/:id', getById);

// Authenticated.
listingRouter.post('/draft', requireAuth, generateDraft);
listingRouter.post('/', requireAuth, create);
listingRouter.patch('/:id', requireAuth, update);
