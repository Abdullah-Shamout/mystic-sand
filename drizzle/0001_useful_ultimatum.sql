CREATE SEQUENCE "public"."ms_order_seq" INCREMENT BY 1 MINVALUE 20000 MAXVALUE 99999 START WITH 20000 CACHE 1;--> statement-breakpoint
ALTER TABLE "inventory_moves" DROP CONSTRAINT "inventory_moves_variant_id_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_moves" ALTER COLUMN "variant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider_payment_id" text;--> statement-breakpoint
ALTER TABLE "inventory_moves" ADD CONSTRAINT "inventory_moves_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;