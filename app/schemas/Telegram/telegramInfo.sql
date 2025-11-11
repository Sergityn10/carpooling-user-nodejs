CREATE TABLE telegram_info (
    username VARCHAR(50) NOT NULL,
    id BIGINT NOT NULL,
    username_telegram VARCHAR(255),
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255),
    chat_id BIGINT,
    PRIMARY KEY (id),
    FOREIGN KEY (username) REFERENCES users(username)
);