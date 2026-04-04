import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const communityComments = pgTable('community_comments', {
  id: text('id').primaryKey(), // nanoid
  communityId: text('community_id').notNull(),
  nickname: text('nickname').notNull().default('匿名'),
  content: text('content').notNull(),
  ipHash: text('ip_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const communityImages = pgTable('community_images', {
  id: text('id').primaryKey(), // nanoid
  communityId: text('community_id').notNull(),
  url: text('url').notNull(),
  caption: text('caption'),
  uploaderIpHash: text('uploader_ip_hash').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});
