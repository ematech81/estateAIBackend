import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { getPublishedPostBySlug, listPublishedPosts } from './blog.service';
import { listBlogPostsSchema } from './blog.validation';

// Both public — no auth. This module only ever reads published posts.
export const list = asyncHandler(async (req: Request, res: Response) => {
  const input = listBlogPostsSchema.parse(req.query);
  const result = await listPublishedPosts(input);
  res.status(200).json(result);
});

export const getBySlug = asyncHandler(async (req: Request, res: Response) => {
  const post = await getPublishedPostBySlug(req.params.slug);
  res.status(200).json({ post });
});
