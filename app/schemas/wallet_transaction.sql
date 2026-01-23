CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_account_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  currency TEXT NOT NULL,
  id_reserva TEXT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit','reservation_payment','reservation_revenue','commision','refund','refund_reversal', 'adjustment')),
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT NULL,
  stripe_payment_intent_id TEXT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (wallet_account_id) REFERENCES wallet_accounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (id_reserva) REFERENCES reservas(id_reserva) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (stripe_payment_intent_id) REFERENCES payment_intents(payment_id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_account_id ON wallet_transactions(wallet_account_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status ON wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_stripe_payment_intent_id ON wallet_transactions(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_stripe_event_id ON wallet_transactions(stripe_event_id);
