export const API_BASE_URL = process.env.API_URL ? process.env.API_URL : 'https://api.qa.meteringco.tech';
export const MAX_RETRY = 3;
export const ACCESS_TOKEN = process.env.API_ACCESS_TOKEN
    ? process.env.API_ACCESS_TOKEN
    : require('../../token_cache.json').access_token;

export class Address {
    countryCode: string;
    postalCode: string;
    state: string;
    city: string;
    streetLineOne: string;
    streetLineTwo: string;
    constructor(
        countryCode: string = '',
        postalCode: string = '',
        state: string = '',
        city: string = '',
        streetLineOne: string = '',
        streetLineTwo: string = ''
    ) {
        this.countryCode = countryCode;
        this.postalCode = postalCode;
        this.state = state;
        this.city = city;
        this.streetLineOne = streetLineOne;
        this.streetLineTwo = streetLineTwo;
    }
}
