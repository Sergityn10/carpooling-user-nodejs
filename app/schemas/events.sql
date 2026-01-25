CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payment_intent_id TEXT NULL,
  data TEXT NOT NULL,
  source TEXT NOT NULL,
  processing_error TEXT NULL,
  status TEXT NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_event_id ON events(event_id);

--MYSQL
CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payment_intent_id VARCHAR(255) DEFAULT NULL,
    data JSON NOT NULL,
    source VARCHAR(100) NOT NULL,
    processing_error TEXT DEFAULT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE INDEX idx_events_event_id (event_id)
) ENGINE=InnoDB;