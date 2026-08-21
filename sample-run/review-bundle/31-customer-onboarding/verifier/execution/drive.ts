/*
 * Trusted driver. Runs inside the deliverable so module resolution matches the
 * project exactly, submits each onboarding request through the same service
 * entry point the HTTP layer uses, and transports what the collaborators saw.
 *
 * The collaborators are stubbed, not simulated: they answer with the state the
 * request is supposed to meet and record what they were asked to do. Points are
 * built with the project's real transformer and rendered to line protocol, so a
 * customer row that is wrong is wrong here too.
 *
 * Everything this file touches belongs to the submission, so nothing it prints
 * or returns is a verdict. Observations are also written to the emulated object
 * store the verifier owns; the verifier reads them back from there and refuses
 * a run whose two copies disagree.
 */
import { Point } from '@influxdata/influxdb-client';
import { readFileSync, writeFileSync } from 'node:fs';
import { CustomerService } from './src/customer/customer.service.js';
import { CustomerEntity } from './src/customer/entities/customer.entity.js';
import { AuditService } from './src/audit/audit.service.js';
import { WebhookPublishingService } from './src/webhook/webhook.service.js';

type Run = {
    label: string;
    subject: string;
    dto: Record<string, unknown>;
    entitlement: Record<string, unknown>;
    existingCustomerIds: string[];
    settings: Record<string, unknown>;
    contract: Record<string, unknown> | null;
    tokenMetering: string;
    stripe: { stripeCustomerId: string; portalUrl: string };
};

const config = JSON.parse(readFileSync(process.argv[2], 'utf8')) as {
    runs: Run[];
    out: string;
    endpoint: string;
    bucket: string;
};

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

function plain(value: unknown): unknown {
    return JSON.parse(JSON.stringify(value ?? null));
}

async function runOne(run: Run): Promise<Record<string, unknown>> {
    const observed: Record<string, any> = {
        entitlementCalls: [],
        latestCustomerCalls: [],
        settingsCalls: [],
        contractCreateCalls: [],
        enrollCalls: [],
        influxWrites: [],
        tokenCalls: [],
        stripeCustomerCalls: [],
        webhookEvents: [],
        auditEvents: [],
    };

    const influx = {
        getPoint: (measurement: string) => new Point(measurement),
        loadPoints: async (bucket: string, org: string, points: unknown) => {
            const rendered = (Array.isArray(points) ? points : [points]).map((point: any) => {
                try {
                    return String(point?.toLineProtocol?.() ?? point);
                } catch (error) {
                    return `__unrenderable__ ${String((error as Error)?.message ?? error)}`;
                }
            });
            observed.influxWrites.push({ bucket, org, lines: rendered });
            return undefined;
        },
        getLatestCustomer: async (args: Record<string, unknown>) => {
            observed.latestCustomerCalls.push(plain(args));
            const wanted = String(args?.customerId ?? '');
            return run.existingCustomerIds.includes(wanted)
                ? [{ customerId: wanted, businessID: args?.businessID, customerName: 'existing' }]
                : [];
        },
        getInvoicesForCustomer: async () => [],
    };

    const settingsService = {
        findAll: async (args: Record<string, unknown>) => {
            observed.settingsCalls.push(plain(args));
            return [{ ...run.settings }];
        },
    };

    const contractService = {
        create: async (args: Record<string, unknown>) => {
            observed.contractCreateCalls.push({
                customerId: (args as any)?.customerId ?? null,
                offeringId: (args as any)?.offeringId ?? null,
                businessID: (args as any)?.businessID ?? null,
                settingsBusinessID: (args as any)?.readSettingsResponseData?.businessID ?? null,
                usageOverrides: plain((args as any)?.usageOverrides ?? null),
            });
            if (!run.contract) return undefined;
            return JSON.parse(JSON.stringify(run.contract));
        },
        enrollCustomerInContract: async (contract: any, subject: string, customer: any) => {
            observed.enrollCalls.push({
                contractMessage: contract?.message ?? null,
                subject: subject ?? null,
                customerId: customer?.customerId ?? null,
            });
            return undefined;
        },
        findOne: async () => undefined,
    };

    const tokenConsumerService = {
        create: async (args: Record<string, unknown>) => {
            observed.tokenCalls.push(plain(args));
            if (run.tokenMetering === 'throw') {
                throw new Error('token consumer unavailable');
            }
            return { message: 'metered' };
        },
    };

    const userEntitlements = {
        determineIfEntitlementExceeded: async (args: Record<string, unknown>) => {
            observed.entitlementCalls.push(plain(args));
            return { ...run.entitlement };
        },
    };

    const inert = {} as never;

    // There is no route to Stripe from this box. The project's own helper is
    // stood in for so the call is observable, and so an implementation that
    // reaches Stripe some other way is not silently rewarded for it.
    const realCreateStripeCustomer = CustomerEntity.createStripeCustomer;
    const realAudit = AuditService.publishEvent;
    const realWebhook = WebhookPublishingService.publishEvent;

    (CustomerEntity as any).createStripeCustomer = async (args: Record<string, unknown>) => {
        observed.stripeCustomerCalls.push(plain(args));
        return { stripeCustomerId: run.stripe.stripeCustomerId, portalUrl: run.stripe.portalUrl };
    };
    (AuditService as any).publishEvent = (event: Record<string, any>) => {
        observed.auditEvents.push({
            topic: event?.topic ?? null,
            message: event?.message ?? null,
            data: plain(event?.data ?? null),
        });
        return undefined;
    };
    (WebhookPublishingService as any).publishEvent = (event: Record<string, any>) => {
        const first = (event?.data ?? [])[0] ?? {};
        observed.webhookEvents.push({
            topic: event?.topic ?? null,
            type: event?.type ?? null,
            businessID: event?.businessID ?? null,
            payload: plain(first),
        });
        return undefined;
    };

    const startedAt = new Date().toISOString();
    try {
        const service = new CustomerService(
            influx as never,
            inert,
            inert,
            inert,
            inert,
            inert,
            settingsService as never,
            inert,
            inert,
            userEntitlements as never,
            contractService as never,
            tokenConsumerService as never,
            inert,
        ) as unknown as Record<string, any>;
        const response = await service.create({ ...run.dto }, run.subject);
        const body = (response ?? {}) as Record<string, unknown>;
        observed.ok = true;
        observed.response = {
            message: body.message ?? null,
            customerId: body.customerId ?? null,
            portalUrl: body.portalUrl ?? null,
        };
    } catch (error) {
        observed.ok = false;
        observed.error = describeError(error);
    } finally {
        (CustomerEntity as any).createStripeCustomer = realCreateStripeCustomer;
        (AuditService as any).publishEvent = realAudit;
        (WebhookPublishingService as any).publishEvent = realWebhook;
    }
    observed.startedAt = startedAt;
    observed.finishedAt = new Date().toISOString();
    return observed;
}

async function publish(label: string, observed: unknown) {
    const url = `${config.endpoint.replace(/\/+$/, '')}/${config.bucket}/onboarding-observations/${label}.json`;
    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(observed),
        });
        if (!response.ok) {
            process.stderr.write(`publish ${label}: HTTP ${response.status}\n`);
        }
    } catch (error) {
        process.stderr.write(`publish ${label}: ${String((error as Error)?.message ?? error)}\n`);
    }
}

async function main() {
    const runs: Record<string, unknown> = {};
    for (const run of config.runs) {
        let observed: Record<string, unknown>;
        try {
            observed = await runOne(run);
        } catch (error) {
            observed = { ok: false, fatal: String((error as Error)?.stack ?? error) };
        }
        runs[run.label] = observed;
        await publish(run.label, observed);
    }
    writeFileSync(config.out, JSON.stringify({ runs }, null, 2));
}

main().then(
    () => process.exit(0),
    (error) => {
        writeFileSync(config.out, JSON.stringify({ fatal: String((error as Error)?.stack ?? error) }, null, 2));
        process.exit(0);
    },
);
