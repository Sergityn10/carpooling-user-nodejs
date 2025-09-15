import bcrypt from 'bcrypt'
import jsonwebtoken from 'jsonwebtoken';
import dotenv from 'dotenv';
import { database } from '../database.js';
import { schemas } from '../schemas.js';
import { UserSchemas } from '../schemas/user.js';
import { TelegramInfo } from '../schemas/Telegram/telegramInfo.js';
import { TelegramInfoServices } from './telegramInfo.js';
import { authorization } from '../middlewares/authorization.js';
dotenv.config();

async function login(req, res) {

    const result = UserSchemas.validateLogin(req.body);
    if (!result.success) {
        return res.status(400).send({status: "Error", message: JSON.parse(result.error.message)});
    }
    const { username, password } = result.data;

    const connection = await database.getConnection();
    const resultado = await connection.query("SELECT * FROM users WHERE username = ?", [username]);
    const comprobarUser = resultado[0][0]; 

    if(!comprobarUser){
        return res.status(404).send({status: "Error",message: "Login failed"})
    }

    const isPasswordValid = await bcrypt.compare(password, comprobarUser.password) 

    if(!isPasswordValid) {
        return res.status(404).send({status: "Error",message: "Login failed"})
    }

    const token = jsonwebtoken.sign({username: comprobarUser.username}, process.env.JWT_SECRET_KEY, {expiresIn: process.env.EXPIRATION_TIME});

    const cookiesOptions = {
        expires: new Date(Date.now() +  process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000), // 1 day
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
    };
    res.cookie("access_token", token, cookiesOptions);
    return res.status(200).send({status: "Success", message: "Login successful", token});
}

async function register(req, res) {
    const result = UserSchemas.validateUser(req.body);
    if (!result.success) {
        return res.status(400).send({status: "Error", message: JSON.parse(result.error.message)});
    }

    const telegramInfo = TelegramInfo.validateTelegramInfoSinUser(req.body)

    const { username, email, password } = result.data;
    const connection = await database.getConnection();
    const resultado = await connection.query("SELECT * FROM users WHERE username = ?", [username]);
    const comprobarUser = resultado[0][0]; 
    console.log(comprobarUser);

    if(comprobarUser){
        return res.status(404).send({status: "Error",message: "User already created"})
    }
    
    const salt = await bcrypt.genSalt(10)
    const hash = await bcrypt.hash(password,salt)

    const emailExists = await connection.query("SELECT * FROM users WHERE email = ?", [email]);
    if (emailExists[0].length > 0) {
        return res.status(400).send({status: "Error", message: "Email already exists"});
    }

    const newUserQuery = await connection.query("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", [username, email, hash]);

    console.log(telegramInfo)
    if(telegramInfo.success){
        //Se guarda la informacion de telegram en la base de datos
        await TelegramInfoServices.create(req, res)
    }
    
    if(newUserQuery[0].affectedRows === 0) {
        return res.status(500).send({status: "Error", message: "Failed to register user"});
    }
    console.log(newUserQuery);

    return res.status(201).send({status: "Success", message: `User registered successfully ${username}`});

}

async function logout(req, res){
    res.clearCookie("access_token");
    return res.status(200).send({status: "Success", message: "Logout successful"});
}

async function validate(req, res){
    const token = req.cookies.access_token;
    console.log(token)
    if(!token){
        return res.status(401).send({status: "Error", message: "No token provided"});
    }

    try {
        const findUser = await authorization.reviseCookie(req);
        if(!findUser){
            return res.status(401).send({status: "Error", message: "Invalid token"});
        }
        const user = {
            username: findUser.username,
            email: findUser.email
        }
        return res.status(200).send({status: "Success", message: "Token is valid",token, data: user});
    } catch (error) {
        res.clearCookie("access_token");
        return res.status(401).send({status: "Error", message: "Invalid token"});
    }
}


export const methods = {
    login,
    register,
    logout,
    validate
};
