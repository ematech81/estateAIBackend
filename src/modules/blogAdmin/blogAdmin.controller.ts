import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import {
  createBlogPost,
  deleteBlogPost,
  getPostByIdForAdmin,
  listAllPostsForAdmin,
  updateBlogPost,
} from '../blog/blog.service';
import { createBlogPostSchema, updateBlogPostSchema } from '../blog/blog.validation';

// All five behind requireAuth + requireAdmin (see blogAdmin.routes.ts).
// Every status (draft and published) is fair game here, unlike the public
// blog.controller.ts which only ever touches published posts.

export const listAll = asyncHandler(async (_req: Request, res: Response) => {
  const posts = await listAllPostsForAdmin();
  res.status(200).json({ posts });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const post = await getPostByIdForAdmin(req.params.id);
  res.status(200).json({ post });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const input = createBlogPostSchema.parse(req.body);
  const post = await createBlogPost(req.user.sub, input);
  res.status(201).json({ post });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const input = updateBlogPostSchema.parse(req.body);
  const post = await updateBlogPost(req.params.id, input);
  res.status(200).json({ post });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await deleteBlogPost(req.params.id);
  res.status(204).send();
});
