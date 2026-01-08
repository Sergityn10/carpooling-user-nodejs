CREATE TABLE IF NOT EXISTS wallet_recharges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  description TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','canceled','expired')),
  stripe_checkout_session_id TEXT NOT NULL,
  stripe_payment_intent_id TEXT NULL,
  stripe_event_id TEXT NULL,
  stripe_payment_status TEXT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (stripe_checkout_session_id),
  UNIQUE (stripe_event_id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_recharges_user_id ON wallet_recharges(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_recharges_status ON wallet_recharges(status);
CREATE INDEX IF NOT EXISTS idx_wallet_recharges_created_at ON wallet_recharges(created_at);
