import { ACCESS_TOKEN, API_BASE_URL } from '../publicClient/init';
import fetch from 'cross-fetch';

/*
 * Private, don't EXPORT to avoid name conflicts.
 * All operations for this resource should be encapsulated in this class.
 */
const RESOURCE_PATH = '/users';

export class User {
    constructor() {}
    async create({ subject, businessID }): Promise<any> {
        const res = await fetch(API_BASE_URL + RESOURCE_PATH, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
                subject,
                businessID,
            }),
        });
        if (res.status <= 201) {
            return await res.json();
        } else {
            throw new Error(JSON.stringify(await res.json(), null, 2));
        }
    }
}
