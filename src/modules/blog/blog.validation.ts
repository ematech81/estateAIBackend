import { z } from 'zod';

// Slug is optional on input — server-derived from title when omitted (see
// blog.service.ts's slugify/uniqueSlug). When given, it's an SEO override
// the admin typed deliberately, so it's validated strictly rather than
// silently slugified for them.
const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const createBlogPostSchema = z.object({
  title: z.string().min(3).max(200),
  slug: z.string().regex(slugPattern, 'Use lowercase letters, numbers, and hyphens only').optional(),
  excerpt: z.string().min(10).max(300),
  bodyMarkdown: z.string().min(20),
  coverImage: z.string().url().optional(),
  tags: z.array(z.string().min(1).max(30)).max(8).default([]),
  status: z.enum(['draft', 'published']).default('draft'),
});
export type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>;

export const updateBlogPostSchema = createBlogPostSchema.partial();
export type UpdateBlogPostInput = z.infer<typeof updateBlogPostSchema>;

export const listBlogPostsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(24).default(9),
  tag: z.string().optional(),
});
export type ListBlogPostsInput = z.infer<typeof listBlogPostsSchema>;
