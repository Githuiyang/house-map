CREATE TABLE "community_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"nickname" text DEFAULT '匿名' NOT NULL,
	"content" text NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_images" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"url" text NOT NULL,
	"caption" text,
	"uploader_ip_hash" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
