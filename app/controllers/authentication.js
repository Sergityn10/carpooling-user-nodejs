import bcrypt from 'bcrypt'
import jsonwebtoken from 'jsonwebtoken';
import dotenv from 'dotenv';
import { database } from '../database.js';
dotenv.config();
export const users =  [
    {
        username: "Sergio",
        email : "sergio@gmail.com",
        password : "hola"
    }
]


async function login(req, res) {

    const { username, password } = req.body;

    
    if(!username || !password) {
        return res.status(400).send({status: "Error", message: "All fields are required"});
        
    }
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
        path: '/'
    };
    res.cookie("jwt", token, cookiesOptions);
    return res.status(200).send({status: "Success", message: "Login successful", token});
}

async function register(req, res) {
    // Aquí iría la lógica de registro
    const { username, password,email } = req.body;

    
    if(!username || !password || !email) {
        return res.status(400).send({status: "Error", message: "All fields are required"});
        
    }
    const connection = await database.getConnection();
    const resultado = await connection.query("SELECT * FROM users WHERE username = ?", [username]);
    const comprobarUser = resultado[0][0]; 
    console.log(comprobarUser);

    if(comprobarUser){
        return res.status(404).send({status: "Error",message: "User already created"})
    }
    
    const salt = await bcrypt.genSalt(10)
    const hash = await bcrypt.hash(password,salt)

    const newUserQuery = await connection.query("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", [username, email, hash]);
    
    if(newUserQuery[0].affectedRows === 0) {
        return res.status(500).send({status: "Error", message: "Failed to register user"});
    }


    res.status(201).send({status: "Success", message: `User registered successfully ${newUser.username}`});

}

export const methods = {
    login,
    register
};
