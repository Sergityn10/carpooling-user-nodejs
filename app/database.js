import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';
dotenv.config();

const database = createClient({
    url: process.env.DB_URL,
    authToken: process.env.DB_TOKEN,
});

export default database;