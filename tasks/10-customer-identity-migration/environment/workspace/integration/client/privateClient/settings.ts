import { ACCESS_TOKEN, API_BASE_URL, MAX_RETRY } from '../publicClient/init';
import fetch from 'cross-fetch';
import { sleep } from '../../utils/utils';

/*
 * Private, don't EXPORT to avoid name conflicts.
 * All operations for this resource should be encapsulated in this class.
 */
const RESOURCE_PATH = '/settings';
export enum TaxCalculationType {
    meteringcoCalculated = 'meteringcoCalculated',
    manual = 'manual',
    none = '',
}

export enum ComputeCostSource {
    eks = 'eks',
    none = 'none',
}
export enum StorageCostSource {
    ebs = 'ebs',
    none = 'none',
}
export enum ArchiveCostSource {
    ebs = 'ebs',
    none = 'none',
}
export class CloudIAM {
    public iamRoleArn?: string;
    public externalId?: string;
}
export const resetSettingsInput = {
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    vatId: '',
    invoicePaymentTerm: '',
    stripeConnected: 'notConnected',
    customFields: '',
    logoUrl: '',
    taxCategory: '',
    taxCalculationType: TaxCalculationType.none,
    archiveCostSource: ArchiveCostSource.none,
    computeCostSource: ComputeCostSource.none,
    storageCostSource: StorageCostSource.none,
    stripeAccountId: '',
    businessName: '',
    taxRate: '0',
    cloudIAM: {
        iamRoleArn: '',
        externalId: '',
    },
};

export const sampleBasicSettings = {
    businessName: 'Test Business',
    taxRate: '0',
    addressLine1: '123 Main St',
    addressLine2: 'Suite 1',
    city: 'San Francisco',
    state: 'CA',
    country: 'USA',
    postalCode: '94105',
    vatId: '123456789',
    invoicePaymentTerm: '30',
    customFields: '[]',
    logoUrl: 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png',
    taxCategory: 'Taxable',
    taxCalculationType: TaxCalculationType.none,
    stripeAccountId: 'acct_1G8ZQ2KZ4Yq4Y2Yj',
    archiveCostSource: ArchiveCostSource.ebs,
    computeCostSource: ComputeCostSource.eks,
    storageCostSource: StorageCostSource.ebs,
    cloudIAM: {
        iamRoleArn: '',
        externalId: '',
    },
};

export class Setting {
    public addressLine1?: string;
    public addressLine2?: string;
    public city?: string;
    public state?: string;
    public country?: string;
    public postalCode?: string;
    public vatId?: string;
    public invoicePaymentTerm?: string;
    public customFields?: string;
    public logoUrl?: string;
    public taxCategory?: string;
    public taxCalculationType?: TaxCalculationType;
    public archiveCostSource?: ArchiveCostSource;
    public computeCostSource?: ComputeCostSource;
    public storageCostSource?: StorageCostSource;
    public stripeAccountId?: string;
    public businessName?: string;
    public taxRate?: string;
    public cloudIAM?: CloudIAM;

    constructor(settings: Setting = {} as Setting) {
        Object.keys(settings).forEach((settingKey) => {
            this[settingKey] = settings[settingKey];
        });
    }

    static async update(data: Setting): Promise<any> {
        for (let retries = 0; retries < MAX_RETRY; retries++) {
            const res = await fetch(API_BASE_URL + RESOURCE_PATH, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                },
                body: JSON.stringify({
                    ...data,
                }),
            });
            if (res.status <= 201) {
                const {
                    data: [settingsData],
                } = await res.json();

                return new Setting(settingsData);
            } else if (retries === MAX_RETRY - 1) {
                return res.json();
            } else {
                await sleep(1000 * (retries + 1));
            }
        }
    }

    static async delete(): Promise<any> {
        throw new Error('Method not implemented.');
    }

    static async get(): Promise<any> {
        throw new Error('Method not implemented.');
    }

    static async getAll(): Promise<Setting | any> {
        const res = await fetch(`${API_BASE_URL}${RESOURCE_PATH}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
        });
        if (res.status <= 201) {
            return new Setting((await res.json())[0]);
        } else {
            throw new Error(JSON.stringify(await res.json(), null, 2));
        }
    }
    static async resetSettings(): Promise<Setting | any> {
        for (let retries = 0; retries < MAX_RETRY; retries++) {
            const res = await fetch(API_BASE_URL + RESOURCE_PATH, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                },
                body: JSON.stringify({
                    ...resetSettingsInput,
                }),
            });
            if (res.status === 400) {
                return await res.json();
            }
            if (res.status <= 201) {
                const {
                    data: [settingsData],
                } = await res.json();

                return new Setting(settingsData);
            } else if (retries === MAX_RETRY - 1) {
                throw new Error(JSON.stringify(await res.json(), null, 2));
            } else {
                await sleep(1000 * (retries + 1));
            }
        }
    }
}
