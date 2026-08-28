import { UserTable } from '../../../src/influx/entities/userTable.entity';
import { UserTableValue } from '../data/user';

const mockLoadPoints = jest.fn();
const mockTag = jest.fn();
const mockStringField = jest.fn();
const mockGetLatestCustomers = jest.fn(async () => []);
const mockGetLatestCustomer = jest.fn(async () => []);
const mockGetLatestSettings = jest.fn(async () => []);
const mockGetCustomerContracts = jest.fn(async () => []);
const mockGetAllOfferingIds = jest.fn(async () => []);
const mockgetAllInvoicesGroupedByCustomer = jest.fn(async () => []);
const mockReadEnvironmentForBusiness = jest.fn(async ({ businessID }): Promise<UserTable[]> => {
    return UserTableValue;
});
const getInvoicesForCustomer = jest.fn(async () => []);
const calculateCreditTotal = jest.fn(async () => []);
const mockReadAllEnvironmentsForUser = jest.fn(async (): Promise<UserTable[]> => UserTableValue);
const mockGetMeteringCoCustomers = jest.fn(async () => []);
const mockGetAllLatestHooksByType = jest.fn(async () => []);
const mockGetLatestOfferingConfig = jest.fn(async () => []);
export class MockInfluxService {
    loadPoints;
    getPoint;
    getLatestCustomers;
    getLatestCustomer;
    readEnvironmentForBusiness;
    getLatestSettings;
    getCustomerContracts;
    getAllOfferingIds;
    getLatestOfferingConfig;
    getAllInvoicesGroupedByCustomer;
    getInvoicesForCustomer;
    calculateCreditTotal;
    readAllEnvironmentsForUser;
    getMeteringCoCustomers;
    getAllLatestHooksByType;
    constructor() {
        this.loadPoints = mockLoadPoints;
        this.getPoint = () => ({ tag: mockTag, stringField: mockStringField });
        this.getLatestCustomers = mockGetLatestCustomers;
        this.getLatestCustomer = mockGetLatestCustomer;
        this.readEnvironmentForBusiness = mockReadEnvironmentForBusiness;
        this.getLatestSettings = mockGetLatestSettings;
        this.getCustomerContracts = mockGetCustomerContracts;
        this.getAllOfferingIds = mockGetAllOfferingIds;
        this.getAllInvoicesGroupedByCustomer = mockgetAllInvoicesGroupedByCustomer;
        this.getInvoicesForCustomer = getInvoicesForCustomer;
        this.calculateCreditTotal = calculateCreditTotal;
        this.readAllEnvironmentsForUser = mockReadAllEnvironmentsForUser;
        this.getMeteringCoCustomers = mockGetMeteringCoCustomers;
        this.getAllLatestHooksByType = mockGetAllLatestHooksByType;
        this.getLatestOfferingConfig = mockGetLatestOfferingConfig;
    }
}
