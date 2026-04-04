import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const communityComments = sqliteTable('community_comments', {
  id: text('id').primaryKey(), // nanoid
  communityId: text('community_id').notNull(),
  nickname: text('nickname').notNull().default('匿名'),
  content: text('content').notNull(),
  ipHash: text('ip_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const communityImages = sqliteTable('community_images', {
  id: text('id').primaryKey(), // nanoid
  communityId: text('community_id').notNull(),
  url: text('url').notNull(),
  caption: text('caption'),
  uploaderIpHash: text('uploader_ip_hash').notNull(),
  uploadedAt: integer('uploaded_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
