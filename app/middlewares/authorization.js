import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import { users } from "../controllers/authentication.js";
import { database } from "../database.js";
dotenv.config()

async function isLoged(req, res, next) {
    const logueado = await reviseCookie(req);
    if (!logueado ) {
        return res.status(403).send({ status: "Error", message: "Access denied. Admins only." });
    }

    // Aquí podrías verificar si el usuario tiene el rol de administrador, accediendo a la base de datos
    if (logueado) { // Cambia esto a la lógica de verificación de administrador
        next(); // El usuario esta logueado, continuar con la siguiente función middleware
    } else {
        res.status(403).send({ status: "Error", message: "Access denied. Admins only." });
    }

}

function onlyAdmin(req, res, next) {
    const logueado = reviseCookie(req);
    if (!logueado) {
        return res.status(403).send({ status: "Error", message: "Access denied. Admins only." });
    }

    if(logueado.role === "admin") {
        next(); // El usuario es un administrador, continuar con la siguiente función middleware
    }
    else {
        res.status(403).send({ status: "Error", message: "Access denied. Admins only." });
    }
}

async function onlyUser(req, res, next) {
    const logueado = await reviseCookie(req);
    // Aquí podrías verificar si el usuario tiene el rol de usuario
    // Por ejemplo, podrías verificar un campo en el token JWT o en la sesión del usuario
    if (logueado && logueado.role === 'user') {
        next(); // El usuario es un usuario normal, continuar con la siguiente función middleware
    } else {
        res.status(403).send({ status: "Error", message: "Access denied. Users only." });
    }
}

async function reviseCookie(req){
    try{

    const cookieJWT = req.headers.cookie.split("; ").find(cookie => cookie.trim().startsWith("jwt=")).slice(4);
    if (!cookieJWT) {
        return false;
    }
    const decodificado = jsonwebtoken.verify(cookieJWT, process.env.JWT_SECRET_KEY);
     console.log("Cookie decodificada:", decodificado);


    const connection = await database.getConnection();
    const resultado = await connection.query("SELECT * FROM users WHERE username = ?", [decodificado.username]);
    const findUser = resultado[0][0]; 
    if(!findUser) {
        return false;
    }
    else{
        return findUser;
    }
    }
    catch (error) {
        console.error("Error al verificar la cookie:", error);
        return false;
    }
}

export const authorization = {
    isLoged,
    reviseCookie,
    onlyAdmin,
    onlyUser
};