import express from "express"
import path from "path"
import z from "zod"
import cookieParser from "cookie-parser"
import morgan from "morgan"
import cors from "cors"
import { authorization } from "./middlewares/authorization.js"
import { fileURLToPath } from "url"
import {methods as authentication} from "./controllers/authentication.js"
import { TelegramInfoServices as telegramInfo } from "./controllers/telegramInfo.js"
import {database} from "./database.js"

//Configuracion del servidor
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.disable("x-powered-by") // Desactiva el encabezado x-powered-by
app.set("port",4000)
app.listen(app.get("port"), () => {
    console.log("Servidor iniciado en el puerto " + app.get("port"))
})


//Configuracion de la carpeta de archivos estaticos
app.use(express.static(__dirname + "\\public"))
app.use(morgan("dev")) // Middleware para registrar las peticiones HTTP en la consola
app.use(express.json())
app.use(cookieParser())
app.use(cors({
    origin: "http://localhost:5173", // Cambia esto a la URL de tu frontend
    methods: "GET,POST,PUT,PATCH,DELETE",
    credentials: true // Permite el uso de cookies
}))


// Middleware 
// app.use((req, res, next) => {
//     console.log("Mi primer middleware");

//     next();
// });

//funcionalidades de la aplicacion
app.get("/api/test",authorization.isLoged, async (req, res) => {
    res.status(200).send({status: "Success", message: "API is working correctly"})
})

app.get("/api/users", authorization.isLoged, async (req, res) => {
    try {
        const connection = await database.getConnection();
        const resultado = await connection.query("SELECT * FROM users");
        return res.status(200).json(resultado[0]); // El resultado es un array, así que devolvemos el primer elemento
    } catch (error) {
        console.error("Error fetching users:", error);
        return res.status(500).json({ status: "Error", message: "Failed to fetch users" });
    }
});

app.get("/api/users/:id", authorization.isLoged, async (req, res) => {
    const { id } = req.params;
    try {
        const connection = await database.getConnection();
        const resultado = await connection.query(" WHERE username = ?", [id]);
        if (resultado[0].length === 0) {
            return res.status(404).json({ status: "Error", message: "User not found" });
        }
        return res.status(200).json(resultado[0][0]);
    } catch (error) {
        console.error("Error fetching user:", error);
        return res.status(500).json({ status: "Error", message: "Failed to fetch user" });
    }
});

app.get("/",(req, res)=> res.sendFile(__dirname + "/pages/login.html"))
app.post("/api/auth/login",(req, res)=> authentication.login(req, res))
app.post("/api/auth/register",(req, res)=> authentication.register(req, res))
app.get("/api/auth/logout",(req, res)=> authentication.logout(req, res))
app.post("/api/auth/refresh",(req, res)=> authentication.refresh(req, res))
app.get("/api/auth/validate",(req, res)=> authentication.validate(req, res))

app.get("/api/telegram-info", authorization.isLoged, (req, res) => telegramInfo.getAll(req, res))
app.get("/api/telegram-info/:id", authorization.isLoged, (req, res) => telegramInfo.getById(req, res))
app.post("/api/telegram-info", authorization.isLoged, (req, res) => telegramInfo.create(req, res))
app.put("/api/telegram-info/:id", authorization.isLoged, (req, res) => telegramInfo.updatePut(req, res))
app.patch("/api/telegram-info/:id", authorization.isLoged, (req, res) => telegramInfo.updatePatch(req, res))
app.delete("/api/telegram-info/:id", authorization.isLoged, (req, res) => telegramInfo.remove(req, res))
app.post("/api/telegram-info/bulk", authorization.isLoged, (req, res) => telegramInfo.bulkCreate(req, res))

app.use((req, res) => {
    res.status(404).sendFile(__dirname + "/pages/404.html");
})