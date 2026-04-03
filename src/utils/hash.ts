import bcrypt from 'bcrypt';
import CryptoJS from 'crypto-js';
import { config } from '../config';

const SECRET_KEY = config.passwordSecretKey;
const saltRounds = 10;

export const hashPassword = async (password: string): Promise<string> => {
    try {
        const salt = await bcrypt.genSalt(saltRounds);
        const hash = await bcrypt.hash(password, salt);
        return hash;
    } catch (err) {
        console.error(`Error generating hash: ${err}`);
        throw new Error('Failed to encrypt password');
    }
};


export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
    try {
        const result = await bcrypt.compare(password, hash);
        return result;
    } catch (err) {
        console.error(`Password comparison error: ${err}`);
        throw new Error('Failed to compare passwords');
    }
};

/**
 * Decrypts AES encrypted data
 * @param encryptedData - The encrypted string to decrypt
 * @returns The decrypted string
 */
export const decryptData = (encryptedData: string): string => {
    try {
        if (!SECRET_KEY) {
            throw new Error('SECRET_KEY is not configured');
        }

        const bytes = CryptoJS.AES.decrypt(encryptedData, SECRET_KEY);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);

        if (!decrypted) {
            throw new Error('Decryption failed - invalid encrypted data or key');
        }

        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt data');
    }
};

/**
 * Encrypts data using AES encryption
 * @param data - The string to encrypt
 * @returns The encrypted string
 */
export const encryptData = (data: string): string => {
    try {
        if (!SECRET_KEY) {
            throw new Error('SECRET_KEY is not configured');
        }

        const encrypted = CryptoJS.AES.encrypt(data, SECRET_KEY).toString();
        return encrypted;
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt data');
    }
};

