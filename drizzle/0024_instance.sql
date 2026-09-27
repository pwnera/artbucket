CREATE TABLE "instance" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	CONSTRAINT "instance_singleton_check" CHECK ("instance"."singleton")
);
