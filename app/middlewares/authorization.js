import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import { users } from "../controllers/authentication.js";
dotenv.config()

function isLoged(req, res, next) {
    const logueado = reviseCookie(req);
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

function onlyUser(req, res, next) {
    const logueado = reviseCookie(req);
    // Aquí podrías verificar si el usuario tiene el rol de usuario
    // Por ejemplo, podrías verificar un campo en el token JWT o en la sesión del usuario
    if (logueado && logueado.role === 'user') {
        next(); // El usuario es un usuario normal, continuar con la siguiente función middleware
    } else {
        res.status(403).send({ status: "Error", message: "Access denied. Users only." });
    }
}

function reviseCookie(req){
    try{

    const cookieJWT = req.headers.cookie.split("; ").find(cookie => cookie.trim().startsWith("jwt=")).slice(4);
    if (!cookieJWT) {
        return false;
    }
    const decodificado = jsonwebtoken.verify(cookieJWT, process.env.JWT_SECRET_KEY) /* (err, decoded) => {
         if (err) {
             return res.status(403).send({ status: "Error", message: "Invalid token." });
         }
         if (decoded.role !== "admin") {
             return res.status(403).send({ status: "Error", message: "Access denied. Admins only." });
         }
         next();
     }); */
     console.log("Cookie decodificada:", decodificado);

    //Buscamos el usuario en la base de datos o lista de usuarios
    // Aquí deberías tener una lista de usuarios o una base de datos para buscar el usuario
    const findUser = users.find(user => user.username === decodificado.username);
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