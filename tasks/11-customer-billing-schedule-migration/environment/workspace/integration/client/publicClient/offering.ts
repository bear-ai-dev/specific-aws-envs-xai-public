import { ACCESS_TOKEN, API_BASE_URL, MAX_RETRY } from './init';
import fetch from 'cross-fetch';
import { sleep } from '../../utils/utils';

/*
 * Private, don't EXPORT to avoid name conflicts.
 * All operations for this resource should be encapsulated in this class.
 */
const RESOURCE_PATH = '/offerings';

export enum OfferingType {
    UsageBased = 'usage-based',
    SubscriptionTier = 'tier',
}

export class Offering {
    offeringType: OfferingType | null;
    offeringName: string | null;
    dimensionIds: string[] | null;
    offeringId: string | null;

    constructor(
        offeringId: string | null = null,
        type: OfferingType | null = null,
        name: string | null = null,
        dimensionIds: string[] | null = null
    ) {
        this.offeringType = type;
        this.offeringName = name;
        this.dimensionIds = dimensionIds;
        this.offeringId = offeringId;
    }

    async create({ offeringType, offeringName, dimensionIds }): Promise<any> {
        for (let retries = 0; retries < MAX_RETRY; retries++) {
            const res = await fetch(API_BASE_URL + RESOURCE_PATH, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                },
                body: JSON.stringify({
                    offeringType,
                    offeringName,
                    dimensionIds,
                }),
            });
            if (res.status <= 201) {
                this.offeringName = offeringName;
                this.offeringType = offeringType;
                this.dimensionIds = dimensionIds;
                this.offeringId = (await res.json()).offeringId;
                return this.offeringId;
            } else if (retries === MAX_RETRY - 1) {
                throw new Error(JSON.stringify(await res.json(), null, 2));
            } else {
                await sleep(1000 * (retries + 1));
            }
        }
    }

    async update(): Promise<any> {
        throw new Error('Method not implemented.');
    }

    async delete(): Promise<any> {
        if (!this.offeringId) {
            throw new Error('Offering not initialized');
        }
        for (let retries = 0; retries < MAX_RETRY; retries++) {
            const res = await fetch(`${API_BASE_URL}${RESOURCE_PATH}/${this.offeringId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                },
            });
            if (res.status <= 201) {
                this.offeringId = null;
                Object.keys(this).forEach((key) => {
                    this[key] = null;
                });
                return;
            } else if (retries === MAX_RETRY - 1) {
                throw new Error(JSON.stringify(await res.json(), null, 2));
            } else {
                await sleep(1000 * (retries + 1));
            }
        }
    }

    async get(): Promise<any> {
        throw new Error('Method not implemented.');
    }

    async getAll(): Promise<any> {
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
}
