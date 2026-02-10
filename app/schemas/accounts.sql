CREATE TABLE IF NOT EXISTS accounts (
  stripe_account_id TEXT PRIMARY KEY NOT NULL,
  default_account INTEGER DEFAULT 0,
  user_id INTEGER NOT NULL,
  charges_enabled INTEGER NOT NULL DEFAULT 0,
  transfers_enabled INTEGER NOT NULL DEFAULT 0,
  details_submitted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

--MYSQL
CREATE TABLE IF NOT EXISTS accounts (
    stripe_account_id VARCHAR(255) PRIMARY KEY NOT NULL,
    default_account TINYINT(1) DEFAULT 0,
    user_id INT NOT NULL,
    charges_enabled TINYINT(1) NOT NULL DEFAULT 0,
    transfers_enabled TINYINT(1) NOT NULL DEFAULT 0,
    details_submitted TINYINT(1) NOT NULL DEFAULT 0,
    
    CONSTRAINT fk_user_accounts
        FOREIGN KEY (user_id) 
        REFERENCES users(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) ENGINE=InnoDB;