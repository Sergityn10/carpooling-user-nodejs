import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const databaseConnection = mysql.createConnection({
    host: process.env.DATABASE_HOST || 'localhost',
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || 'password',
    database: process.env.DATABASE_NAME || 'carpooling'
})

const getConnection = async() => {
    return databaseConnection
}

export const database=
 { getConnection };