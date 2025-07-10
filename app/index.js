import express from "express"
import path from "path"
import { authorization } from "./middlewares/authorization.js"
import { fileURLToPath } from "url"
import {methods as authentication} from "./controllers/authentication.js"
import cookieParser from "cookie-parser"
import morgan from "morgan"
import cors from "cors"
import {database} from "./database.js"

//Configuracion del servidor
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.set("port",4000)
app.listen(app.get("port"))
console.log(`Servidor corriendo en puerto ${app.get("port")}`)

//Configuracion de la carpeta de archivos estaticos
app.use(express.static(__dirname + "\\public"))
app.use(morgan("dev")) // Middleware para registrar las peticiones HTTP en la consola
app.use(express.json())
app.use(cookieParser())
app.use(cors({
    origin: "http://localhost:5173", // Cambia esto a la URL de tu frontend
    methods: "GET,POST,PUT,DELETE",
    credentials: true // Permite el uso de cookies
}))


//funcionalidades de la aplicacion
app.get("/api/test", authorization.isLoged, async (req, res) => {
    res.status(200).send({status: "Success", message: "API is working correctly"})
})

app.get("/api/usuarios", authorization.isLoged, async (req, res) => {
    try {
        const connection = await database.getConnection();
        const resultado = await connection.query("SELECT * FROM usuarios");
        return res.status(200).json(resultado[0]); // El resultado es un array, así que devolvemos el primer elemento
    } catch (error) {
        console.error("Error fetching users:", error);
        return res.status(500).json({ status: "Error", message: "Failed to fetch users" });
    }
});
app.get("/api/usuarios/:id", authorization.isLoged, async (req, res) => {
    const { id } = req.params;
    try {
        const connection = await database.getConnection();
        const resultado = await connection.query("SELECT * FROM usuarios WHERE id = ?", [id]);
        if (resultado[0].length === 0) {
            return res.status(404).json({ status: "Error", message: "User not found" });
        }
        return res.status(200).json(resultado[0][0]);
    } catch (error) {
        console.error("Error fetching user:", error);
        return res.status(500).json({ status: "Error", message: "Failed to fetch user" });
    }
});

app.get("/",authorization.isLoged,(req, res)=> res.sendFile(__dirname + "/pages/login.html"))
app.post("/api/auth/login",(req, res)=> authentication.login(req, res))
app.post("/api/auth/register",(req, res)=> authentication.register(req, res))