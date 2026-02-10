CREATE TABLE telegram_info (
    user_id INTEGER NOT NULL,
    id BIGINT NOT NULL,
    username_telegram VARCHAR(255),
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255),
    chat_id BIGINT,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);