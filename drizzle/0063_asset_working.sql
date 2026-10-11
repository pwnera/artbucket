-- An agent at work on an asset, for the app to show while it lasts (PUT /api/v1/assets/{id}/working).
ALTER TABLE "assets" ADD COLUMN "working" jsonb;
