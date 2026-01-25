CREATE TABLE IF NOT EXISTS wallet_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  balance INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (user_id, currency)
);

CREATE INDEX IF NOT EXISTS idx_wallet_accounts_user_id ON wallet_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_currency ON wallet_accounts(currency);

--mysql
CREATE TABLE IF NOT EXISTS wallet_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'eur',
    balance INT NOT NULL DEFAULT 0, -- Mantengo INT asumiendo que son céntimos
    status ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Restricciones y Relaciones
    CONSTRAINT fk_wallet_user 
        FOREIGN KEY (user_id) REFERENCES users(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    
    -- El UNIQUE compuesto asegura que un usuario no tenga dos carteras de la misma moneda
    UNIQUE KEY idx_user_currency (user_id, currency)
) ENGINE=InnoDB;

-- Índices adicionales para optimizar búsquedas
CREATE INDEX idx_wallet_currency ON wallet_accounts(currency);