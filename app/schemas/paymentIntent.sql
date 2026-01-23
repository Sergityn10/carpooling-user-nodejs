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