-- Add telegram_id column to users table for Telegram login support
ALTER TABLE users ADD COLUMN telegram_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
