CREATE TYPE "public"."comment_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "community_comments" ADD COLUMN "status" "comment_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
UPDATE "community_comments" SET "status" = 'approved';