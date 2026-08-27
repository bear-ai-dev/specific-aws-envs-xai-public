import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { InfluxService } from '../../src/influx/influx.service';
import { AuthGuard } from '@nestjs/passport';
import { MockInfluxService } from '../fixtures/module/mockInfluxService';
import { MockJwtStrategy } from '../fixtures/module/mockJwtStrategy';
import { CustomerInfluxRow } from '../../src/influx/entities/customerInfluxRow';
import { customerDBModelGenerator } from '../fixtures/data/customer';
import { productionBusinessID } from '../fixtures/data/user';
import { getQueueOptionsToken, getQueueToken } from '@nestjs/bull';
import { createMock } from '@golevelup/ts-jest';
import { Queue, QueueOptions } from 'bull';
import { SettingInfluxRow } from '../../src/influx/entities/settingsInfluxTable.entity';
import { settingsGenerator } from '../fixtures/data/setting';
jest.mock('stripe', () =>
    jest.fn().mockImplementation(() => ({
        customers: { create: jest.fn(() => ({ id: 'foobarTest' })) },
        billingPortal: { sessions: { create: jest.fn(() => ({ url: 'https://fakeMeteringCoTester.com' })) } },
        accounts: {
            retrieve: jest.fn((id) =>
                id === 'badAccount'
                    ? { id, details_submitted: false, invoice_settings: { default_payment_method: null } }
                    : { id: 'fakeStripeAccountId', details_submitted: true },
            ),
        },
    })),
);
jest.mock('../../src/utils/shared/utils', () => ({
    sleep: jest.fn(),
    ArrayGroupBy: jest.fn(),
    suffixIfNotEmpty: jest.fn(),
    joinMetadataObjectsAndRemoveNulls: jest.fn(),
}));

describe('/customers', () => {
    let app: INestApplication;
    const mockJwtStrategy = new MockJwtStrategy();
    const mockInfluxService = new MockInfluxService();
    let moduleRef: any;
    let server;
    beforeAll(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(InfluxService)
            .useValue(mockInfluxService)
            .overrideGuard(AuthGuard('jwt'))
            .useValue(mockJwtStrategy)
            .overrideGuard(AuthGuard('oidc'))
            .useValue(mockJwtStrategy)
            .overrideProvider(getQueueOptionsToken())
            .useValue(createMock<QueueOptions>())
            .overrideProvider(getQueueToken('scheduler_queue'))
            .useValue(createMock<Queue>())
            .overrideProvider(getQueueToken('scheduler_billing_queue'))
            .useValue(createMock<Queue>())
            .compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();
        server = app.getHttpServer();
    });

    it(`GET: Customers with a fresh account should call auth`, async () => {
        await request(server).get('/customers').expect(200);
        expect(mockJwtStrategy.canActivate).toBeCalledTimes(1);
    });

    it(`GET: Customers with a fresh account`, async () => {
        const res = await request(server).get('/customers').expect(200).expect({
            data: [],
            message: 'No Customers Found',
        });
        return res;
    });
    it('POST: should call auth', async () => {
        const res = await request(server).post('/customers').expect(400);
        expect(mockJwtStrategy.canActivate).toBeCalledTimes(1);
        return res;
    });
    it('POST: should return 400 if no body is sent', async () => {
        const res = await request(server).post('/customers').expect(400);
        return res;
    });
    it("POST: should return a stripe URL if the created customer is a stripe customer and the user's business is a setup for stripe", async () => {
        mockInfluxService.getLatestSettings.mockImplementationOnce(
            async (): Promise<SettingInfluxRow[]> => [settingsGenerator()],
        );
        const res = await request(server)
            .post('/customers')
            .send({ paymentChannel: 'Stripe', email: 'foo@bar.com', customerName: 'foobarTest' })
            .expect(201);

        expect(res.body).toEqual({
            portalUrl: 'https://fakeMeteringCoTester.com',
            customerId: expect.anything(),
            message: 'New customer added',
        });
    });
    it('POST: Should return without a portal url for manual customers', async () => {
        mockInfluxService.getLatestSettings.mockImplementationOnce(
            async (): Promise<SettingInfluxRow[]> => [settingsGenerator()],
        );
        const res = await request(server)
            .post('/customers')
            .send({ paymentChannel: 'manual', email: 'foo@bar.com', customerName: 'foobarTest' })
            .expect(201);

        expect(res.body).toEqual({
            customerId: expect.anything(),
            message: 'New customer added',
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
        return;
    });
    afterAll(async () => {
        await app.close();
        await moduleRef.close();
        await server.close();
    });
    describe('/:customerId', () => {
        it(`GET: should 404 with no data`, async () => {
            await request(server).get('/customers/12345').expect(404);
            expect(mockJwtStrategy.canActivate).toBeCalledTimes(1);
            expect(mockInfluxService.getLatestCustomer).toBeCalledTimes(1);
        });
        it('GET: Customer with incomplete Stripe info', async () => {
            mockInfluxService.getLatestSettings.mockImplementationOnce(
                async (): Promise<SettingInfluxRow[]> => [settingsGenerator()],
            );
            mockInfluxService.getLatestCustomer.mockImplementationOnce(
                async (): Promise<CustomerInfluxRow[]> => [
                    {
                        ...customerDBModelGenerator(),
                        paymentChannelOptions_stripeCustomerId: 'badAccount',
                    },
                ],
            );

            const res = await request(server).get('/customers/12345').expect(200);
            expect(res.body).toEqual({
                message: 'Found Customer',
                data: [
                    expect.objectContaining({
                        paymentChannel: 'Stripe',
                        paymentChannelOptions: {
                            stripeCustomerId: 'badAccount',
                        },
                        stripeAccountReady: false,
                    }),
                ],
            });
        });
        it(`GET: should return data if the db returns a value`, async () => {
            const customerDbModelData = customerDBModelGenerator();
            customerDbModelData.offeringId = undefined;
            customerDbModelData.creditBalance = undefined;
            customerDbModelData.businessID = productionBusinessID;
            mockInfluxService.getLatestCustomer.mockImplementationOnce(
                async (): Promise<CustomerInfluxRow[]> => [customerDbModelData],
            );
            const res = await request(server)
                .get('/customers/12345')
                .expect(200)
                .expect({
                    message: 'Found Customer',
                    data: [
                        {
                            customerId: 'some-customer-id',
                            customerName: 'Cool Customer',
                            paymentChannel: 'Stripe',
                            paymentChannelOptions: {
                                stripeCustomerId: 'foobar',
                            },
                            email: 'test@meteringco.tech',
                            address: JSON.parse(customerDbModelData.address as string),
                            customerVatId: 'GB VAT 123456789',
                            taxExempt: 'none',
                            currency: 'USD',
                            creditBalance: '0',
                            metadata: JSON.parse(customerDbModelData.metadata as string),
                            invoices: [],
                        },
                    ],
                });
            expect(mockInfluxService.getLatestCustomer).toBeCalledTimes(1);
            return res;
        });
        it(`DELETE: should soft delete the customer`, async () => {
            const customerDbModelData = customerDBModelGenerator();
            customerDbModelData.offeringId = undefined;
            customerDbModelData.creditBalance = undefined;
            customerDbModelData.businessID = productionBusinessID;
            mockInfluxService.getLatestCustomer.mockImplementationOnce(
                async (): Promise<CustomerInfluxRow[]> => [customerDbModelData],
            );
            const res = await request(server).delete('/customers/12345').expect(200);
            expect(res.body).toEqual({
                message: 'Deleted Customer',
                customerId: '12345',
            });
            expect(mockInfluxService.loadPoints).toBeCalledTimes(1);
            expect(mockInfluxService.getPoint().tag).toBeCalledWith('softDelete', 'deleted');
        });
        it('DELETE: should 404 if there is no customer in the DB', async () => {
            mockInfluxService.getLatestCustomer.mockImplementationOnce(async (): Promise<CustomerInfluxRow[]> => []);
            const res = await request(server).delete('/customers/12345').expect(404);
            expect(res.body).toEqual({
                error: 'Not Found',
                message: 'Customer with ID: 12345 not found',
                statusCode: 404,
            });
        });
    });
});
