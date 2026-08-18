import { Schema, model, Document, Types } from 'mongoose';

// Admin-authored content for SEO (Section-13-style content marketing — not
// part of the original master build prompt, added later). Body is stored as
// raw Markdown; rendering to HTML happens on the frontend at read time via
// react-markdown, never trusted/rendered as raw HTML server-side.

export type BlogPostStatus = 'draft' | 'published';

export interface IBlogPost extends Document {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  coverImage?: string;
  tags: string[];
  status: BlogPostStatus;
  author: Types.ObjectId;
  // Set once, the first time status becomes 'published' — never cleared or
  // reset by later edits, so a post's public URL and date stay stable even
  // if it's unpublished and republished later (see blog.service.ts).
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const blogPostSchema = new Schema<IBlogPost>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    excerpt: { type: String, required: true, trim: true },
    bodyMarkdown: { type: String, required: true },
    coverImage: { type: String, trim: true },
    tags: { type: [String], default: [] },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    publishedAt: { type: Date },
  },
  { timestamps: true },
);

blogPostSchema.index({ status: 1, publishedAt: -1 });

export const BlogPost = model<IBlogPost>('BlogPost', blogPostSchema);
