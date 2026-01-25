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
    FOREIGN KEY (id_reserva) REFERENCES reservas(id_reserva)
    
);
-- MYSQL
CREATE TABLE IF NOT EXISTS payment_intents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stripe_payment_id VARCHAR(255) DEFAULT NULL,
    amount INT NOT NULL,
    currency ENUM('eur', 'usd', 'gbp', 'jpy', 'aud') NOT NULL DEFAULT 'eur',
    description TEXT DEFAULT NULL,
    destination_account VARCHAR(255) DEFAULT NULL,
    sender_account VARCHAR(255) DEFAULT NULL,
    state VARCHAR(50) NOT NULL,
    client_secret VARCHAR(255) DEFAULT NULL,
    checkout_session_id VARCHAR(255) DEFAULT NULL,
    id_reserva VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_reserva 
        FOREIGN KEY (id_reserva) 
        REFERENCES reservas(id_reserva)
        ON DELETE SET NULL 
        ON UPDATE CASCADE
) ENGINE=InnoDB;