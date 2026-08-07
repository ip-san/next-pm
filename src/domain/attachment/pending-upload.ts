// Shared between upload-token.ts (rejecting an expired token at redemption time) and
// application/attachments/prune-pending-uploads.ts (actually deleting the row/file once
// expired) — both must agree on what "expired" means, so this lives in neither of them.
// Mirrors Redmine's Attachment.prune default of pruning uploads older than 1 day.
export const PENDING_UPLOAD_EXPIRY_MS = 24 * 60 * 60 * 1000;
