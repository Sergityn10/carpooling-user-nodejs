import {CocheSchemas} from "../schemas/coche.js";
import dotenv from "dotenv";
dotenv.config();
import { database } from "../database.js";

async function createCar (req, res) {
    const data = CocheSchemas.validateCocheSinId(req.body);
    if(!data.success){
        return res.status(400).send({status: "Error", message: data.error.message})
    }

    const user = req.user
    const car = {
        ...data.data,
        user: user.username
    }
    console.log(car)
    let result;
    try{

    const connection = await database.getConnection();
    [result] = await connection.query("INSERT INTO cars (matricula, marca, modelo, color, tipo_combustible, numero_plazas, user,year) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [car.matricula, car.marca, car.modelo, car.color, car.tipo_combustible, car.num_plazas, car.user, car.year]);
    }
    catch(error){
        console.log(error.code)
        console.log(error.message)

        switch(error.code){
            case "ER_DUP_ENTRY":
                return res.status(400).send({status: "Error", message: "Car already exists"})
            default:
                return res.status(500).send({status: "Error", message: "Failed to create car"})
        }
    }
    if(result.affectedRows === 0){
        return res.status(500).send({status: "Error", message: "Failed to create car"})
    }
    return res.status(200).send({status: "Success", message: "Car created successfully", car})
}

async function updateCar (req, res) {
    const {error, value} = CocheSchemas.validateCochePartial(req.body);
    if(error){
        return res.status(400).send({status: "Error", message: error.message})
    }
    const {id_coche} = req.params;
    const connection = await database.getConnection();
    const [result] = await connection.query("UPDATE cars SET ? WHERE id_coche = ?", [value, id_coche]);
    if(result.affectedRows === 0){
        return res.status(500).send({status: "Error", message: "Failed to update car"})
    }
    return res.status(200).send({status: "Success", message: "Car updated successfully", car})
}

async function removeCar (req, res) {
    const {id_coche} = req.params;
    const connection = await database.getConnection();
    const [result] = await connection.query("DELETE FROM cars WHERE id_coche = ?", [id_coche]);
    if(result.affectedRows === 0){
        return res.status(500).send({status: "Error", message: "Failed to delete car"})
    }
    return res.status(200).send({status: "Success", message: "Car deleted successfully"})
}

async function getCar (req, res) {
    const {id_coche} = req.params;
    const connection = await database.getConnection();
    const [result] = await connection.query("SELECT * FROM cars WHERE id_coche = ?", [id_coche]);
    if(result.length === 0){
        return res.status(404).send({status: "Error", message: "Car not found"})
    }
    return res.status(200).send({status: "Success", message: "Car found successfully", car: result[0]})
}

async function getCarsByUsername (req, res) {
    const {username} = req.params;
    console.log(username)
    const connection = await database.getConnection();
    const existUser = await connection.query("SELECT * FROM users WHERE username = ?", [username]);
    if(existUser.length === 0){
        return res.status(404).send({status: "Error", message: "User not found"})
    }
    const [result] = await connection.query("SELECT * FROM cars WHERE user = ?", [username]);
    console.log(result)
    return res.status(200).send({status: "Success", message: "Cars found successfully", cars: result})
}

export const methods = {
    createCar,
    updateCar,
    removeCar,
    getCar,
    getCarsByUsername
}
