CREATE TABLE IF NOT EXISTS wallet_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_account_id INTEGER NOT NULL,
  wallet_transaction_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  currency TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','succeeded','failed','canceled')),
  method TEXT NOT NULL DEFAULT 'standard' CHECK (method IN ('standard','instant')),
  idempotency_key TEXT NOT NULL,
  stripe_payout_id TEXT NULL,
  stripe_payout_status TEXT NULL,
  stripe_event_id TEXT NULL,
  failure_reason TEXT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (wallet_account_id) REFERENCES wallet_accounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (idempotency_key),
  UNIQUE (stripe_payout_id),
  UNIQUE (stripe_event_id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_payouts_user_id ON wallet_payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_payouts_wallet_account_id ON wallet_payouts(wallet_account_id);
CREATE INDEX IF NOT EXISTS idx_wallet_payouts_status ON wallet_payouts(status);
CREATE INDEX IF NOT EXISTS idx_wallet_payouts_created_at ON wallet_payouts(created_at);

--mysql
CREATE TABLE IF NOT EXISTS wallet_payouts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wallet_account_id INT NOT NULL,
    wallet_transaction_id INT NOT NULL,
    user_id INT NOT NULL,
    currency VARCHAR(10) NOT NULL,
    amount INT NOT NULL,
    status ENUM('pending', 'processing', 'succeeded', 'failed', 'canceled') NOT NULL DEFAULT 'pending',
    method ENUM('standard', 'instant') NOT NULL DEFAULT 'standard',
    idempotency_key VARCHAR(255) NOT NULL,
    stripe_payout_id VARCHAR(255) DEFAULT NULL,
    stripe_payout_status VARCHAR(100) DEFAULT NULL,
    stripe_event_id VARCHAR(255) DEFAULT NULL,
    failure_reason TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Restricciones de Unicidad
    UNIQUE KEY uk_idempotency (idempotency_key),
    UNIQUE KEY uk_stripe_payout (stripe_payout_id),
    UNIQUE KEY uk_stripe_event (stripe_event_id),

    -- Relaciones (Foreign Keys)
    CONSTRAINT fk_payout_wallet_acc 
        FOREIGN KEY (wallet_account_id) REFERENCES wallet_accounts(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_payout_wallet_trans 
        FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_payout_user 
        FOREIGN KEY (user_id) REFERENCES users(id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Índices de optimización
CREATE INDEX idx_wallet_payouts_user_id ON wallet_payouts(user_id);
CREATE INDEX idx_wallet_payouts_wallet_account_id ON wallet_payouts(wallet_account_id);
CREATE INDEX idx_wallet_payouts_status ON wallet_payouts(status);
CREATE INDEX idx_wallet_payouts_created_at ON wallet_payouts(created_at);