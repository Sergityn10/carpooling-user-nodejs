import dotenv from 'dotenv';
dotenv.config();
import { UserSchemas } from '../schemas/user.js';
import { authorization } from '../middlewares/authorization.js';
import database from '../database.js';
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

    const {rows} = await database.execute({
        sql: "SELECT * FROM users WHERE username = ?", 
        args: [username]
    });
    console.log(rows)
    const user = rows[0];
    if(!user){
        return res.status(404).send({status: "Error", message: "User not found"});
    }

    if(result.data.password){   
        result.data.password = await utils.hashValue(10, result.data.password);
    }

    const keys = Object.keys(result.data);
    if (keys.length === 0) {
        return res.status(400).send({status: "Error", message: "No fields to update"});
    }
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const args = [...keys.map(k => result.data[k]), username];
    const updateUserQuery = await database.execute({
        sql: `UPDATE users SET ${setClause} WHERE username = ?`,
        args
    });
    if(updateUserQuery.rowsAffected === 0){
        return res.status(500).send({status: "Error", message: "Failed to update user"});
    }
    return res.status(200).send({status: "Success", message: "User updated successfully"});
}

async function updateMyUserPatch(req, res) {
    const result = UserSchemas.validateUserSchemaPartial(req.body);
    if (!result.success) {
        return res.status(400).send({status: "Error", message: JSON.parse(result.error.message)});
    }
    
    //Comprobar si el usuario existe y es el mismo que está logueado
    const findUser = req.user;
    console.log(`Actualizando a ${findUser.username}`)
    const resultado = await database.execute({
        sql: "SELECT * FROM users WHERE username = ?", 
        args: [findUser.username]
    });
    console.log(resultado)
    const user = resultado.rows[0];
    if(!user){
        return res.status(404).send({status: "Error", message: "User not found"});
    }

    if(result.data.password){
        result.data.password = await utils.hashValue(10, result.data.password);
    }

    const keys = Object.keys(result.data);
    if (keys.length === 0) {
        return res.status(400).send({status: "Error", message: "No fields to update"});
    }
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const args = [...keys.map(k => result.data[k]), findUser.username];
    const updateUserQuery = await database.execute({
        sql: `UPDATE users SET ${setClause} WHERE username = ?`,
        args
    });
    if(updateUserQuery.rowsAffected === 0){
        return res.status(500).send({status: "Error", message: "Failed to update user"});
    }
    return res.status(200).send({status: "Success", message: "User updated successfully"});
}

async function removeUser(req, res) {
    const { username } = req.params;
    
    //Comprobar si el usuario existe y es el mismo que está logueado
     const findUser = await authorization.reviseCookie(req);
     if(!findUser || findUser.username !== username){
         return res.status(401).send({status: "Error", message: "Unauthorized"});
     }

    const { rows: userRows } = await database.execute({
        sql: "SELECT * FROM users WHERE username = ?",
        args: [username]
    });
    const user = userRows[0];
    if(!user){
        return res.status(404).send({status: "Error", message: "User not found"});
    }

    const deleteUserQuery = await database.execute({
        sql: "DELETE FROM users WHERE username = ?",
        args: [username]
    });
    if(deleteUserQuery.rowsAffected === 0){
        return res.status(500).send({status: "Error", message: "Failed to delete user"});
    }
    return res.status(200).send({status: "Success", message: "User deleted successfully"});
}

async function getUserInfo(req, res){
    const { username } = req.params;
    const { rows: userRows } = await database.execute({
        sql: "SELECT * FROM users WHERE username = ?",
        args: [username]
    });
    const user = userRows[0];
    if(!user){
        return res.status(404).send({status: "Error", message: "User not found"});
    }

    const opinionsQuery = await database.execute({
        sql: "SELECT * FROM comments WHERE username_trayect = ?",
        args: [username]
    });
    let ListOpinions = opinionsQuery.rows;
    const numOpinions = ListOpinions.length;
    let averageRating;
    if(numOpinions === 0){
        averageRating = 0;
    }
    else{
        averageRating = ListOpinions.reduce((acc, opinion) => acc + opinion.rating, 0) / numOpinions;
    }


    const userInfo = {
        username: user.username,
        name: user.name,
        surname: user.surname,
        phone: user.phone,
        email: user.email,
        img_perfil: user.img_perfil,
        role: user.role,
        averageRating: averageRating,
        numOpinions: numOpinions,
        about_me: user.about_me
    }

    return res.status(200).send({status: "Success", message: "User found successfully", data: userInfo});
}
async function getMyUserInfo(req, res){
    const findUser = req.user;
    const opinionsQuery = await database.execute({
        sql: "SELECT * FROM comments WHERE username_trayect = ?",
        args: [findUser.username]
    });
    let ListOpinions = opinionsQuery.rows;
    const numOpinions = ListOpinions.length;
    let averageRating;
    if(numOpinions === 0){
        averageRating = 0;
    }
    else{
        averageRating = ListOpinions.reduce((acc, opinion) => acc + opinion.rating, 0) / numOpinions;
    }


    const userInfo = {
        username: findUser.username,
        name: findUser.name,
        surname: findUser.surname,
        phone: findUser.phone,
        email: findUser.email,
        img_perfil: findUser.img_perfil,
        role: findUser.role,
        averageRating: averageRating,
        numOpinions: numOpinions,
        about_me: findUser.about_me
    }

    return res.status(200).send({status: "Success", message: "User found successfully", data: userInfo});
}

export const methods = {
    updateUserPatch,
    removeUser,
    getUserInfo,
    updateMyUserPatch,
    getMyUserInfo
}