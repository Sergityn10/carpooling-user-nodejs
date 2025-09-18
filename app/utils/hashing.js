import bcrypt from 'bcrypt'

async function hashValue(numSalt, value){
        const salt = await bcrypt.genSalt(numSalt)
        const hash = await bcrypt.hash(value,salt)
        return hash
}

export const methods = {
    hashValue
}