import bcrypt from 'bcrypt'
import jsonwebtoken from 'jsonwebtoken';
import dotenv from 'dotenv'
dotenv.config()
async function hashValue(numSalt, value){
        const salt = await bcrypt.genSalt(numSalt)
        const hash = await bcrypt.hash(value,salt)
        return hash
}
async function createCookie(username,){
    const token = jsonwebtoken.sign({username: username}, process.env.JWT_SECRET_KEY, {expiresIn: process.env.EXPIRATION_TIME});
    
        const cookiesOptions = {
            expires: new Date(Date.now() +  process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000), // 1 day
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: process.env.JWT_COOKIES_EXPIRATION_TIME * 24 * 60 * 60 * 1000
        };
    return {token, cookiesOptions}
}
export const methods = {
    hashValue,
    createCookie
}