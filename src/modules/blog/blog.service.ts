import { isValidObjectId } from 'mongoose';
import { BlogPost, IBlogPost } from '../../models/BlogPost';
import { ApiError } from '../../utils/ApiError';
import { CreateBlogPostInput, ListBlogPostsInput, UpdateBlogPostInput } from './blog.validation';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

// Appends -2, -3, ... on collision. excludeId lets an update check
// uniqueness against every OTHER post without tripping on its own slug.
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop -- sequential by nature (each check depends on the last), and collisions are rare
  while (await BlogPost.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

// Strips `author` down to nothing for public responses — it's just an
// internal ObjectId ref, not sensitive, but public post shapes don't need
// it (same "public shape helper" convention as toPublicListing).
function toPublicPost(post: IBlogPost) {
  const { author: _author, ...rest } = post.toObject();
  void _author;
  return rest;
}

export async function createBlogPost(authorId: string, input: CreateBlogPostInput) {
  const slug = await uniqueSlug(input.slug ? slugify(input.slug) : slugify(input.title));
  const publishedAt = input.status === 'published' ? new Date() : undefined;
  return BlogPost.create({ ...input, slug, author: authorId, publishedAt });
}

export async function updateBlogPost(id: string, input: UpdateBlogPostInput) {
  const post = await BlogPost.findById(id);
  if (!post) {
    throw ApiError.notFound('Post not found');
  }

  // Slug only changes if the caller explicitly sent one — editing the
  // title alone must never silently change a post's (possibly already
  // indexed/shared) URL.
  if (input.slug != null) {
    post.slug = await uniqueSlug(slugify(input.slug), id);
  }
  const { slug: _slug, ...rest } = input;
  void _slug;
  Object.assign(post, rest);

  if (input.status === 'published' && !post.publishedAt) {
    post.publishedAt = new Date();
  }

  await post.save();
  return post;
}

export async function deleteBlogPost(id: string) {
  const deleted = await BlogPost.findByIdAndDelete(id);
  if (!deleted) {
    throw ApiError.notFound('Post not found');
  }
}

export async function listPublishedPosts({ page, limit, tag }: ListBlogPostsInput) {
  const filter: Record<string, unknown> = { status: 'published' };
  if (tag) filter.tags = tag;

  const skip = (page - 1) * limit;
  const [posts, total] = await Promise.all([
    BlogPost.find(filter).sort({ publishedAt: -1 }).skip(skip).limit(limit),
    BlogPost.countDocuments(filter),
  ]);

  return {
    posts: posts.map(toPublicPost),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getPublishedPostBySlug(slug: string) {
  const post = await BlogPost.findOne({ slug, status: 'published' });
  if (!post) {
    throw ApiError.notFound('Post not found');
  }
  return toPublicPost(post);
}

export async function listAllPostsForAdmin() {
  return BlogPost.find().sort({ createdAt: -1 });
}

export async function getPostByIdForAdmin(id: string) {
  if (!isValidObjectId(id)) {
    throw ApiError.notFound('Post not found');
  }
  const post = await BlogPost.findById(id);
  if (!post) {
    throw ApiError.notFound('Post not found');
  }
  return post;
}
