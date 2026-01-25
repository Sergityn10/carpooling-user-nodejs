CREATE TABLE IF NOT EXISTS payment_intents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stripe_payment_id TEXT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'eur' CHECK (currency IN ('eur', 'usd', 'gbp', 'jpy', 'aud')),
    description TEXT NULL,
    destination_account TEXT NULL,
    sender_account TEXT NULL,
    state TEXT NOT NULL,
    client_secret TEXT NULL,
    checkout_session_id TEXT NULL,
    id_reserva TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_reserva) REFERENCES reservas(id_reserva),
    FOREIGN KEY (sender_account) REFERENCES accounts(stripe_account_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_checkout_session_id ON payment_intents(checkout_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_stripe_payment_id ON payment_intents(stripe_payment_id);

--MYSQL
CREATE TABLE IF NOT EXISTS payment_intents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stripe_payment_id VARCHAR(255) NULL,
    amount INT NOT NULL,
    currency ENUM('eur', 'usd', 'gbp', 'jpy', 'aud') NOT NULL DEFAULT 'eur',
    description TEXT NULL,
    destination_account VARCHAR(255) NULL,
    sender_account VARCHAR(255) NULL,
    state VARCHAR(50) NOT NULL,
    client_secret VARCHAR(255) NULL,
    checkout_session_id VARCHAR(255) NULL,
    id_reserva INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Índices únicos
    UNIQUE INDEX idx_payment_intents_checkout_session_id (checkout_session_id),
    UNIQUE INDEX idx_payment_intents_stripe_payment_id (stripe_payment_id),

    -- Relaciones
    CONSTRAINT fk_reserva_payment 
        FOREIGN KEY (id_reserva) REFERENCES reservas(id_reserva),
    CONSTRAINT fk_sender_account 
        FOREIGN KEY (sender_account) REFERENCES accounts(stripe_account_id)
) ENGINE=InnoDB;