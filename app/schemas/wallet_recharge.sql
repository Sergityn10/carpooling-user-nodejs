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

--mysql
CREATE TABLE IF NOT EXISTS wallet_recharges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount INT NOT NULL,
    currency VARCHAR(10) NOT NULL,
    description TEXT NULL,
    status ENUM('pending', 'succeeded', 'failed', 'canceled', 'expired') NOT NULL DEFAULT 'pending',
    stripe_checkout_session_id VARCHAR(255) NOT NULL,
    stripe_payment_intent_id VARCHAR(255) DEFAULT NULL,
    stripe_event_id VARCHAR(255) DEFAULT NULL,
    stripe_payment_status VARCHAR(100) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Restricciones de Unicidad
    UNIQUE KEY uk_stripe_checkout (stripe_checkout_session_id),
    UNIQUE KEY uk_stripe_event_recharge (stripe_event_id),

    -- Relaciones
    CONSTRAINT fk_recharge_user 
        FOREIGN KEY (user_id) REFERENCES users(id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Índices de optimización
CREATE INDEX idx_wallet_recharges_user_id ON wallet_recharges(user_id);
CREATE INDEX idx_wallet_recharges_status ON wallet_recharges(status);
CREATE INDEX idx_wallet_recharges_created_at ON wallet_recharges(created_at);