-- Keep at most one active share link per ticket, including concurrent requests.
CREATE UNIQUE INDEX "share_links_one_active_per_ticket_key"
ON "share_links"("ticket_id")
WHERE "revoked_at" IS NULL;
