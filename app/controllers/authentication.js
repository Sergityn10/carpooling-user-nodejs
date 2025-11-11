import bcrypt from 'bcrypt'
import jsonwebtoken from 'jsonwebtoken';
import dotenv from 'dotenv';
import { database } from '../database.js';
import { schemas } from '../schemas.js';
import { UserSchemas } from '../schemas/user.js';
import { TelegramInfo } from '../schemas/Telegram/telegramInfo.js';
import { TelegramInfoServices } from './telegramInfo.js';
import { authorization } from '../middlewares/authorization.js';
import {methods as utils} from '../utils/hashing.js';
import Stripe from 'stripe';
dotenv.config();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function login(req, res) {
    const result = UserSchemas.validateLogin(req.body);
    if (!result.success) {
        return res.status(400).send({status: "Error", message: JSON.parse(result.error.message)});
    }
    
    const { email, password } = result.data;

    const connection = await database.getConnection();
    const resultado = await connection.query("SELECT * FROM users WHERE email = ?", [email]);
    const comprobarUser = resultado[0][0]; 

    if(!comprobarUser){
        return res.status(404).send({status: "Error",message: "Login failed"})
    }

    const isPasswordValid = await bcrypt.compare(password, comprobarUser.password) 
    console.log(isPasswordValid)
    if(!isPasswordValid) {
        return res.status(404).send({status: "Error",message: "Login failed"})
    }

    const token = jsonwebtoken.sign({username: comprobarUser.username}, process.env.JWT_SECRET_KEY, {expiresIn: process.env.EXPIRATION_TIME});

    const cookiesOptions = {
        expires: new Date(Date.now() +  process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000), // 1 day
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000
    };

    res.cookie("access_token", token, cookiesOptions);
    return res.status(200).send({status: "Success", message: `Login successful`, username: comprobarUser.username, token, img_perfil: comprobarUser.img_perfil, onboarding_ended: comprobarUser.onboarding_ended});
}

async function register(req, res) {
    const result = UserSchemas.validateRegisterSchema(req.body);
    if (!result.success) {
        return res.status(400).send({status: "Error", message: JSON.parse(result.error.message)});
    }


    const { username, email, password, name } = result.data;
    const connection = await database.getConnection();
    const resultado = await connection.query("SELECT * FROM users WHERE username = ?", [username]);
    const comprobarUser = resultado[0][0]; 

    if(comprobarUser){
        return res.status(404).send({status: "Error",message: "User already created"})
    }
    
    const hash = await utils.hashValue(10, password);

    const emailExists = await connection.query("SELECT * FROM users WHERE email = ?", [email]);
    if (emailExists[0].length > 0) {
        return res.status(400).send({status: "Error", message: "Email already exists"});
    }
    const customer_account = await stripe.customers.create({
        name: name,
        individual_name: name,
        email: email,
        metadata: {
            username: username
        }
    });

    const newUserQuery = await connection.query("INSERT INTO users (username, email, password, name, stripe_customer_account) VALUES (?, ?, ?, ?, ?)", [username, email, hash, name, customer_account.id]);

    
    if(newUserQuery[0].affectedRows === 0) {
        return res.status(500).send({status: "Error", message: "Failed to register user"});
    }



        const token = jsonwebtoken.sign({username: username}, process.env.JWT_SECRET_KEY, {expiresIn: process.env.EXPIRATION_TIME});

    const cookiesOptions = {
        expires: new Date(Date.now() +  process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000), // 1 day
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000
    };

    res.cookie("access_token", token, cookiesOptions);
    return res.status(201).send({status: "Success", message: `User registered successfully ${username}`, token});

}

async function logout(req, res){
    res.clearCookie("access_token");
    return res.status(200).send({status: "Success", message: "Logout successful"});
}

async function validate(req, res){
    try {

    const token = req.cookies.access_token

    if(!token){
        return res.status(401).send({status: "Error", message: "No token provided"});
    }
        const findUser = await authorization.reviseCookie(req);
        if(!findUser){
            return res.status(401).send({status: "Error", message: "Invalid token"});
        }


        const user = {
            username: findUser.username,
            email: findUser.email,
            img_perfil: findUser.img_perfil,
            onboarding_ended: findUser.onboarding_ended,
            role: findUser.role
        }
        return res.status(200).send({status: "Success", message: "Token is valid",token, data: user});
    } catch (error) {
        res.clearCookie("access_token");
        return res.status(401).send({status: "Error", message: "Invalid token"});
    }
}

async function existEmail(req, res){
    const { email } = req.query;
    const connection = await database.getConnection();
    const resultado = await connection.query("SELECT * FROM users WHERE email = ?", [email]);
    const comprobarUser = resultado[0][0]; 
    if(comprobarUser){
        return res.status(404).send({status: "Error",message: "Email already exists"})
    }
    return res.status(200).send({status: "Success", message: "Email not exists"});
}


export const methods = {
    login,
    register,
    logout,
    validate,
    existEmail
};
