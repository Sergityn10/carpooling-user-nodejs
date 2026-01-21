CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_account_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  currency TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('recharge','debit','credit','refund','adjustment', 'reservation')),
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','canceled','expired')),
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT NULL,
  stripe_checkout_session_id TEXT NULL,
  stripe_payment_intent_id TEXT NOT NULL,
  stripe_event_id TEXT NULL,
  stripe_payment_status TEXT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (wallet_account_id) REFERENCES wallet_accounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (stripe_checkout_session_id),
  UNIQUE (stripe_event_id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_account_id ON wallet_transactions(wallet_account_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status ON wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_stripe_payment_intent_id ON wallet_transactions(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_stripe_event_id ON wallet_transactions(stripe_event_id);
