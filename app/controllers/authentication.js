import bcrypt from 'bcrypt'
import jsonwebtoken from 'jsonwebtoken';
import dotenv from 'dotenv';
import database from '../database.js';
import { schemas } from '../schemas.js';
import { UserSchemas } from '../schemas/user.js';
import { TelegramInfo } from '../schemas/Telegram/telegramInfo.js';
import { TelegramInfoServices } from './telegramInfo.js';
import { authorization } from '../middlewares/authorization.js';
import { methods as utils } from '../utils/hashing.js';
import Stripe from 'stripe';
import { OAuth2Client } from 'google-auth-library';
import { authMethods } from '../schemas/auth_methods.js';
dotenv.config();
const client_id = process.env.GOOGLE_CLIENT_ID
const secret_id = process.env.GOOGLE_OAUTH
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function login(req, res) {
    const result = UserSchemas.validateLogin(req.body);
    if (!result.success) {
        return res.status(400).send({ status: "Error", message: JSON.parse(result.error.message) });
    }

    const { email, password } = result.data;

    const { rows } = await database.execute({
        sql: "SELECT * FROM users WHERE email = ?",
        args: [email]
    });
    const comprobarUser = rows[0];

    if (!comprobarUser) {
        return res.status(404).send({ status: "Error", message: "Login failed" })
    }

    if(comprobarUser.auth_method !== authMethods.PASSWORD){
        return res.status(404).send({status: "Error", message: "Authentication method no valid"})
    }

    const isPasswordValid = await bcrypt.compare(password, comprobarUser.password)
    if (!isPasswordValid) {
        return res.status(404).send({ status: "Error", message: "Login failed" })
    }

    const token = jsonwebtoken.sign({ username: comprobarUser.username, email }, process.env.JWT_SECRET_KEY, { expiresIn: process.env.EXPIRATION_TIME });

    const cookiesOptions = {
        expires: new Date(Date.now() + process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000), // 1 day
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
        path: "/",
        maxAge: process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000
    };

    res.cookie("access_token", token, cookiesOptions);
    return res.status(200).send({ status: "Success", message: `Login successful`, username: comprobarUser.username, token, img_perfil: comprobarUser.img_perfil, onboarding_ended: comprobarUser.onboarding_ended });
}

async function register(req, res) {
    const result = UserSchemas.validateRegisterSchema(req.body);
    if (!result.success) {
        return res.status(400).send({ status: "Error", message: JSON.parse(result.error.message) });
    }


    const { username, email, password, name } = result.data;

    const { rows: userRows } = await database.execute({
        sql: "SELECT * FROM users WHERE email = ?",
        args: [email]
    });
    const comprobarUser = userRows[0];

    if (comprobarUser) {
        return res.status(404).send({ status: "Error", message: "User already created" })
    }

    const hash = await utils.hashValue(10, password);

    const { rows: emailRows } = await database.execute({
        sql: "SELECT * FROM users WHERE email = ?",
        args: [email]
    });
    if (emailRows.length > 0) {
        return res.status(400).send({ status: "Error", message: "Email already exists" });
    }
    const customer_account = await stripe.customers.create({
        name: name,
        individual_name: name,
        email: email,
        metadata: {
            username: username
        }
    });


    const insertResult = await database.execute({
        sql: "INSERT INTO users (username, email, password, name, auth_method, stripe_customer_account) VALUES (?, ?, ?, ?, ?, ?)",
        args: [username, email, hash, name,authMethods.PASSWORD, customer_account.id]
    });


    if (insertResult.rowsAffected === 0) {
        return res.status(500).send({ status: "Error", message: "Failed to register user" });
    }



    const token = jsonwebtoken.sign({ username: username }, process.env.JWT_SECRET_KEY, { expiresIn: process.env.EXPIRATION_TIME });

    const cookiesOptions = {
        expires: new Date(Date.now() + process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000), // 1 day
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
        path: "/",
        maxAge: process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000
    };

    res.cookie("access_token", token, cookiesOptions);
    return res.status(201).send({ status: "Success", message: `User registered successfully ${username}`, token });

}

async function oauthGoogle(req, res) {
    res.header("Access-Control-Allow-origin", "http://localhost:5173")
    res.header("Referrer-Policy", "no-referrer-when-downgrade")
    const method = req.query.method;
    let redirectUrl
    switch (method) {
        case "login":
            redirectUrl = 'http://localhost:4000/api/auth/oauth/login'
            break;
        case "register":
            redirectUrl = 'http://localhost:4000/api/auth/oauth/register'
            break;
        default:
            return res.status(400).send({ status: "Error", message: "Invalid method" });
    }
    const oauth2Client = new OAuth2Client(
        client_id,
        secret_id,
        redirectUrl
    )

    const authorizeUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: 'profile openid email',
        prompt: 'consent'
    })
    res.status(200).json({ url: authorizeUrl })

}

async function logout(req, res) {
    res.clearCookie("access_token");
    return res.status(200).send({ status: "Success", message: "Logout successful" });
}

async function validate(req, res) {
    try {

        const token = req.cookies.access_token

        if (!token) {
            return res.status(401).send({ status: "Error", message: "No token provided" });
        }
        const findUser = await authorization.reviseCookie(req);
        if (!findUser) {
            return res.status(401).send({ status: "Error", message: "Invalid token" });
        }


        const user = {
            username: findUser.username,
            email: findUser.email,
            img_perfil: findUser.img_perfil,
            ciudad: findUser.ciudad,
            onboarding_ended: findUser.onboarding_ended,
            role: findUser.role
        }
        return res.status(200).send({ status: "Success", message: "Token is valid", token, data: user });
    } catch (error) {
        res.clearCookie("access_token");
        return res.status(401).send({ status: "Error", message: "Invalid token" });
    }
}

async function existEmail(req, res) {
    const { email } = req.query;
    const { rows: emailCheckRows } = await db.execute({
        sql: "SELECT * FROM users WHERE email = ?",
        args: [email]
    });
    const comprobarUser = emailCheckRows[0];
    if (comprobarUser) {
        return res.status(404).send({ status: "Error", message: "Email already exists" })
    }
    return res.status(200).send({ status: "Success", message: "Email not exists" });
}


export const methods = {
    login,
    register,
    oauthGoogle,
    logout,
    validate,
    existEmail
};
