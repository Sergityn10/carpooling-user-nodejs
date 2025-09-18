import dotenv from 'dotenv';
dotenv.config();
import { UserSchemas } from '../schemas/user.js';
import { authorization } from '../middlewares/authorization.js';
import { database } from '../database.js';
import {methods as utils} from '../utils/hashing.js';
async function updateUserPatch(req, res) {
    const result = UserSchemas.validateUserSchemaPartial(req.body);
    if (!result.success) {
        return res.status(400).send({status: "Error", message: JSON.parse(result.error.message)});
    }
    const { username } = req.params;
    
    //Comprobar si el usuario existe y es el mismo que está logueado
    const findUser = await authorization.reviseCookie(req);
    if(!findUser || findUser.username !== username){
        return res.status(401).send({status: "Error", message: "Unauthorized"});
    }

    const connection = await database.getConnection();
    const resultado = await connection.query("SELECT * FROM users WHERE username = ?", [username]);
    const user = resultado[0][0];
    if(!user){
        return res.status(404).send({status: "Error", message: "User not found"});
    }

    if(result.data.password){
        result.data.password = await utils.hashValue(10, result.data.password);
    }

    const updateUserQuery = await connection.query("UPDATE users SET ? WHERE username = ?", [result.data, username]);
    if(updateUserQuery[0].affectedRows === 0){
        return res.status(500).send({status: "Error", message: "Failed to update user"});
    }
    return res.status(200).send({status: "Success", message: "User updated successfully"});
}

async function removeUser(req, res) {
    const { username } = req.params;
    
    //Comprobar si el usuario existe y es el mismo que está logueado
    // const findUser = await authorization.reviseCookie(req);
    // if(!findUser || findUser.username !== username){
    //     return res.status(401).send({status: "Error", message: "Unauthorized"});
    // }

    const connection = await database.getConnection();
    const resultado = await connection.query("SELECT * FROM users WHERE username = ?", [username]);
    const user = resultado[0][0];
    if(!user){
        return res.status(404).send({status: "Error", message: "User not found"});
    }

    const deleteUserQuery = await connection.query("DELETE FROM users WHERE username = ?", [username]);
    if(deleteUserQuery[0].affectedRows === 0){
        return res.status(500).send({status: "Error", message: "Failed to delete user"});
    }
    return res.status(200).send({status: "Success", message: "User deleted successfully"});
}

export const methods = {
    updateUserPatch,
    removeUser
}