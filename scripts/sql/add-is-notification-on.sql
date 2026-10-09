-- Run once on prod if columns missing (deploy also uses prisma db push).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_notification_on BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_notification_on BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE delivery_men ADD COLUMN IF NOT EXISTS is_notification_on BOOLEAN NOT NULL DEFAULT true;
