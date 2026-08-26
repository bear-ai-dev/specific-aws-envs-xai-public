/*
 * Trusted driver.
 *
 * Runs inside the deliverable so module resolution matches the project exactly,
 * issues each invoice through `InvoicesService` — the same entry point the HTTP
 * controllers use — and writes the resulting records out for scoring elsewhere.
 *
 * Nothing this file prints or returns is treated as a verdict. It transports
 * observations only; the tax-authority traffic that decides most of the grade is
 * read off the emulator by the verifier, not from here.
 *
 * The service is built from Nest's own injection metadata rather than by calling
 * the constructor positionally, because a solution is free to add, reorder or
 * rename the collaborator that reaches the authority. Every dependency whose
 * class name this file recognises is replaced with a stub; anything it does not
 * recognise is constructed for real, recursively, so a submitted tax
 * collaborator runs exactly as the application would run it.
 */
import 'reflect-metadata';
import { readFileSync, writeFileSync } from 'node:fs';
import { InvoicesService } from './src/invoice/invoices.service.js';
import { InfluxDB, Point } from '@influxdata/influxdb-client';

type Case = {
    label: string;
    settings: Record<string, any>;
    customer: Record<string, any>;
    items: Array<{ name: string; quantity: number; unitCost: number }>;
    settle?: boolean;
};

const config = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { cases: Case[]; out: string };

// ---------------------------------------------------------------- influx ---

let written: any[] = [];

/* The invoice entity keeps its own store handle and builds a fresh one every
 * time it is rehydrated from a row, so injecting a stub is not enough on its
 * own. Replacing the client's write API catches every save the run makes,
 * whichever handle produced it, and keeps the process off the network. */
const recorder = {
    writePoints: (points: any[]) => {
        for (const point of points || []) {
            written.push(point);
        }
    },
    writePoint: (point: any) => {
        written.push(point);
    },
    writeRecord: () => undefined,
    flush: async () => undefined,
    close: async () => undefined,
    dispose: () => undefined,
    useDefaultTags: () => undefined,
};
(InfluxDB.prototype as any).getWriteApi = () => recorder;

/* Rows for one invoice, newest first, exactly as a point-in-time read of the
 * measurement would return them. */
function invoiceRows(businessID: string, invoiceId: string): Array<Record<string, string>> {
    return written
        .filter(
            (point) =>
                (point?.name ?? point?.measurement) === 'Invoice' &&
                point?.tags?.businessID === businessID &&
                point?.tags?.invoiceId === invoiceId,
        )
        .map((point) => ({ ...point.tags }))
        .reverse();
}

const influxStub = {
    getPoint: (measurement: string) => new Point(measurement),
    loadPoints: async (_bucket: string, _org: string, points: any[]) => {
        for (const point of points || []) {
            written.push(point);
        }
    },
    getSingleInvoice: async ({ businessID, invoiceId }: { businessID: string; invoiceId: string }) =>
        invoiceRows(businessID, invoiceId),
    getInvoicesForCustomer: async () => [],
    getAllInvoicesGroupedByCustomer: async () => [],
    getQueuedInvoicesForCustomer: async () => [],
};

// ------------------------------------------------------------ injection ---

/* Absorbs any call on a collaborator this run does not exercise. */
const universal: any = new Proxy(
    {},
    {
        get: (_target, property) => {
            if (property === 'then' || property === Symbol.toPrimitive) {
                return undefined;
            }
            return (..._args: unknown[]) => Promise.resolve(undefined);
        },
    },
);

let currentCase: Case = null as unknown as Case;

/* Everything the invoice path touches that is not tax. A submitted tax
 * collaborator is deliberately absent from this list so that it is built and
 * run for real. */
const stubs: Record<string, unknown> = {
    InfluxService: influxStub,
    CustomerService: {
        findOne: async () => ({ data: [currentCase.customer], message: 'Found customer' }),
        findPayments: async () => ({ data: [] }),
        findRefunds: async () => ({ data: [] }),
        findAll: async () => ({ data: [currentCase.customer] }),
    },
    SettingsService: {
        findAll: async () => [currentCase.settings],
        findOne: async () => currentCase.settings,
    },
    PaymentService: {
        getAmountPaid: async () => 0,
        getAmountPaidForCustomerInvoices: async () => 0,
        publish: () => undefined,
    },
    TokenConsumerService: { create: async () => ({ message: 'ok' }) },
    LocalJWTAuthService: {
        generateCustomerTokenWithInvoiceId: async () => ({ access_token: 'driver-token' }),
        sign: async () => 'driver-token',
    },
    UsageService: universal,
    DimensionsService: universal,
    CreditService: universal,
    ContractService: universal,
    SchedulerService: universal,
    InvoiceStatusChecker: universal,
    OfferingService: universal,
    AuditService: universal,
    WebhookPublishingService: universal,
};

function unwrap(token: any): any {
    if (token && typeof token.forwardRef === 'function') {
        return token.forwardRef();
    }
    return token;
}

let built = new Map<any, any>();

function construct(cls: any, depth: number): any {
    if (built.has(cls)) {
        return built.get(cls);
    }
    const design: any[] = Reflect.getMetadata('design:paramtypes', cls) || [];
    const declared: Array<{ index: number; param: any }> = Reflect.getMetadata('self:paramtypes', cls) || [];
    let arity = design.length;
    for (const entry of declared) {
        arity = Math.max(arity, entry.index + 1);
    }
    const args: any[] = [];
    for (let index = 0; index < arity; index += 1) {
        const override = declared.find((entry) => entry.index === index);
        args.push(provide(override ? unwrap(override.param) : design[index], depth + 1));
    }
    const instance = new cls(...args);
    built.set(cls, instance);
    return instance;
}

function provide(token: any, depth: number): any {
    const name = typeof token === 'function' ? token.name : undefined;
    if (name && Object.prototype.hasOwnProperty.call(stubs, name)) {
        return stubs[name];
    }
    if (typeof token === 'function' && token.prototype && depth < 5) {
        try {
            return construct(token, depth);
        } catch {
            return universal;
        }
    }
    return universal;
}

// ----------------------------------------------------------------- drive ---

function describeError(error: unknown): Record<string, unknown> {
    const err = (error ?? {}) as Record<string, any>;
    let status: unknown = err.status ?? err.statusCode;
    if (status === undefined && typeof err.getStatus === 'function') {
        try {
            status = err.getStatus();
        } catch {
            status = undefined;
        }
    }
    return {
        name: String(err.name ?? typeof error),
        message: String(err.message ?? error),
        status: typeof status === 'number' ? status : null,
    };
}

function numberOrNull(value: unknown): number | null {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function latestRecord(businessID: string, invoiceId: string): Record<string, unknown> | null {
    const [row] = invoiceRows(businessID, invoiceId);
    if (!row) {
        return null;
    }
    return {
        invoiceId: row.invoiceId ?? null,
        invoiceStatus: row.invoiceStatus ?? null,
        salesTaxRate: numberOrNull(row.salesTaxRate),
        taxAmount: numberOrNull(row.taxAmount),
        totalAmountWithoutTax: numberOrNull(row.totalAmountWithoutTax),
        fromEntity: row.fromEntity ?? null,
        toEntity: row.toEntity ?? null,
    };
}

function service(): any {
    built = new Map<any, any>();
    return construct(InvoicesService, 0);
}

async function main() {
    const results: Record<string, unknown> = {};

    for (const item of config.cases) {
        currentCase = item;
        written = [];
        const observation: Record<string, unknown> = {};
        let invoiceId: string | null = null;

        try {
            const response = await service().create({
                businessID: item.settings.businessID,
                customerId: item.customer.customerId,
                items: item.items.map((line) => ({ ...line })),
                invoiceDate: '2026-08-12T10:00:00.000Z',
                currency: 'USD',
            });
            const body = (response ?? {}) as Record<string, unknown>;
            invoiceId = (body.invoiceId as string) ?? null;
            observation.create = {
                ok: true,
                invoiceId,
                message: body.message ?? null,
                error: body.error === undefined || body.error === null ? null : describeError(body.error),
            };
        } catch (error) {
            observation.create = { ok: false, invoiceId: null, error: describeError(error) };
        }

        observation.record = invoiceId ? latestRecord(item.settings.businessID, invoiceId) : null;

        if (item.settle && invoiceId) {
            try {
                const settled = await service().update({
                    businessID: item.settings.businessID,
                    invoiceId,
                    invoiceStatus: 'Paid',
                });
                observation.settle = { ok: true, message: (settled ?? ({} as any))['message'] ?? null };
            } catch (error) {
                observation.settle = { ok: false, error: describeError(error) };
            }
            observation.settled = latestRecord(item.settings.businessID, invoiceId);
        }

        results[item.label] = observation;
    }

    writeFileSync(config.out, JSON.stringify({ cases: results }, null, 2));
}

main().then(
    () => process.exit(0),
    (error) => {
        writeFileSync(config.out, JSON.stringify({ fatal: String((error as Error)?.stack ?? error) }, null, 2));
        process.exit(0);
    },
);
