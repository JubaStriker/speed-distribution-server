import moment from 'moment';

/**
 * Generates a random number within the specified range
 * @param min - Minimum value (default: 100)
 * @param max - Maximum value (default: 999)
 * @returns Random number between min and max
 */
const getRandomNumber = (min: number = 100, max: number = 999): number => {
    return Math.floor(Math.random() * (max - min + 1) + min);
};

/**
 * Generates a unique ID with a prefix and timestamp
 * @param prefix - Prefix for the ID
 * @returns Generated ID in format: prefix-YYMMDDHHmmss<randomNumber>
 */
export const getId = (prefix: string): string => {
    const randomNumber = getRandomNumber();
    const id = `${prefix}-${moment().format('YYMMDDHHmmss')}${randomNumber}`;
    return id;
};
