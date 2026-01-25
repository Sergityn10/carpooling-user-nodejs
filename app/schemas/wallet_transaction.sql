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
  FOREIGN KEY (stripe_payment_intent_id) REFERENCES payment_intents(stripe_payment_id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_account_id ON wallet_transactions(wallet_account_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_stripe_payment_intent_id ON wallet_transactions(stripe_payment_intent_id);

--mysql
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wallet_account_id INT NOT NULL,
    user_id INT NOT NULL,
    currency VARCHAR(10) NOT NULL,
    id_reserva VARCHAR(255) NULL,
    type ENUM('deposit', 'reservation_payment', 'reservation_revenue', 'commision', 'refund', 'refund_reversal', 'adjustment') NOT NULL,
    amount INT NOT NULL,
    balance_before INT NOT NULL,
    balance_after INT NOT NULL,
    description TEXT NULL,
    stripe_payment_intent_id VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Relaciones (Foreign Keys)
    CONSTRAINT fk_trans_wallet_acc 
        FOREIGN KEY (wallet_account_id) REFERENCES wallet_accounts(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_trans_user 
        FOREIGN KEY (user_id) REFERENCES users(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_trans_reserva 
        FOREIGN KEY (id_reserva) REFERENCES reservas(id_reserva) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_trans_stripe_pi 
        FOREIGN KEY (stripe_payment_intent_id) REFERENCES payment_intents(stripe_payment_id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Índices para optimizar reportes y auditorías
CREATE INDEX idx_wallet_transactions_wallet_account_id ON wallet_transactions(wallet_account_id);
CREATE INDEX idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX idx_wallet_transactions_created_at ON wallet_transactions(created_at);
CREATE INDEX idx_wallet_transactions_stripe_pi ON wallet_transactions(stripe_payment_intent_id);