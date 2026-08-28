import { ACCESS_TOKEN, API_BASE_URL, MAX_RETRY } from '../publicClient/init';
import fetch from 'cross-fetch';
import { sleep } from '../../utils/utils';

/*
 * Private, don't EXPORT to avoid name conflicts.
 * All operations for this resource should be encapsulated in this class.
 */
const RESOURCE_PATH = '/scheduler';

export class Scheduler {
    constructor(scheduler: Scheduler = {} as Scheduler) {
        Object.keys(scheduler).forEach((schedulerKey) => {
            this[schedulerKey] = scheduler[schedulerKey];
        });
    }

    static async update(data: Scheduler): Promise<any> {
        throw new Error('Method not implemented.');
    }

    static async get(): Promise<any> {
        throw new Error('Method not implemented.');
    }

    static async getAll(): Promise<any> {
        const res = await fetch(`${API_BASE_URL}${RESOURCE_PATH}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
        });
        if (res.status <= 201) {
            return (await res.json()).data;
        } else {
            throw new Error(JSON.stringify(await res.json(), null, 2));
        }
    }
    static async delete(id: string): Promise<any> {
        for (let retries = 0; retries < MAX_RETRY; retries++) {
            const res = await fetch(API_BASE_URL + RESOURCE_PATH + '/' + id, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                },
            });
            if (res.status === 400) {
                return res.json();
            }
            if (res.status <= 201) {
                return res.json();
            } else if (retries === MAX_RETRY - 1) {
                throw new Error(JSON.stringify(await res.json(), null, 2));
            } else {
                await sleep(1000 * (retries + 1));
            }
        }
    }
}
