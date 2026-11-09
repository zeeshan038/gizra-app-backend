-- Modern FCM tokens can exceed 191 chars; driver table already uses 255+.
ALTER TABLE vendors
  ALTER COLUMN firebase_token TYPE varchar(512),
  ALTER COLUMN fcm_token_web TYPE varchar(512);
