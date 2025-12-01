import {CocheSchemas} from "../schemas/coche.js";
import dotenv from "dotenv";
dotenv.config();
import database from "../database.js";

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

    const insertResult = await database.execute({
        sql:"INSERT INTO cars (matricula, marca, modelo, color, tipo_combustible, numero_plazas, user, year) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        args: [car.matricula, car.marca, car.modelo, car.color, car.tipo_combustible, car.num_plazas, car.user, car.year]
    });
    result = insertResult
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
    if(!result || result.rowsAffected === 0){
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
    const keys = Object.keys(value);
    if (keys.length === 0) {
        return res.status(400).send({status: "Error", message: "No fields to update"});
    }
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const args = [...keys.map(k => value[k]), id_coche];
    const result = await database.execute({
        sql: `UPDATE cars SET ${setClause} WHERE id_coche = ?`,
        args
    });
    if(result.rowsAffected === 0){
        return res.status(500).send({status: "Error", message: "Failed to update car"})
    }
    return res.status(200).send({status: "Success", message: "Car updated successfully", car})
}

async function removeCar (req, res) {
    const {id_coche} = req.params;
    const result = await database.execute({
        sql: "DELETE FROM cars WHERE id_coche = ?",
        args: [id_coche]
    });
    if(result.rowsAffected === 0){
        return res.status(500).send({status: "Error", message: "Failed to delete car"})
    }
    return res.status(200).send({status: "Success", message: "Car deleted successfully"})
}

async function getCar (req, res) {
    const {id_coche} = req.params;
    const { rows } = await database.execute({
        sql: "SELECT * FROM cars WHERE id_coche = ?",
        args: [id_coche]
    });
    if(rows.length === 0){
        return res.status(404).send({status: "Error", message: "Car not found"})
    }
    return res.status(200).send({status: "Success", message: "Car found successfully", car: rows[0]})
}

async function getCarsByUsername (req, res) {
    const {username} = req.params;
    console.log(username)
    const userQuery = await database.execute({
        sql: "SELECT * FROM users WHERE username = ?",
        args: [username]
    });
    if(userQuery.rows.length === 0){
        return res.status(404).send({status: "Error", message: "User not found"})
    }
    const carsQuery = await database.execute({
        sql: "SELECT * FROM cars WHERE user = ?",
        args: [username]
    });
    console.log(carsQuery.rows)
    return res.status(200).send({status: "Success", message: "Cars found successfully", cars: carsQuery.rows})
}

export const methods = {
    createCar,
    updateCar,
    removeCar,
    getCar,
    getCarsByUsername
}
