/*
 * Trusted driver. Runs inside the deliverable so module resolution matches the
 * project exactly, asks the submitted EC2 utilities for one sweep of each
 * inventory across the estate, and writes down which regions came back and what
 * was found in each.
 *
 * Everything this file touches belongs to the submission, so nothing it prints
 * or returns is treated as a verdict: it only transports observations. A sweep
 * that answers wrongly is recorded as a wrong answer, never raised as an error.
 */
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import * as awsEc2 from './src/utils/aws/awsEc2.js';
import { readFileSync, writeFileSync } from 'node:fs';

type Run = {
    label: string;
    kind: 'volumes' | 'snapshots';
    roleArn: string;
    externalId: string;
    dimensionId: string;
};

const config = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { runs: Run[]; out: string };

const ID_FIELD: Record<Run['kind'], string> = {
    volumes: 'VolumeId',
    snapshots: 'SnapshotId',
};

/**
 * A sweep is expected to hand back one entry per region it covered. A plain
 * object is what the callers in this project consume, but a Map carries the
 * same information, so both are read the same way.
 */
function entriesOf(result: unknown): Array<[string, unknown]> | null {
    if (result instanceof Map) {
        return Array.from(result.entries()).map(([key, value]) => [String(key), value]);
    }
    if (result && typeof result === 'object' && !Array.isArray(result)) {
        return Object.entries(result as Record<string, unknown>);
    }
    return null;
}

function coverage(kind: Run['kind'], result: unknown): Record<string, string[]> | null {
    const entries = entriesOf(result);
    if (entries === null) {
        return null;
    }
    const field = ID_FIELD[kind];
    const out: Record<string, string[]> = {};
    for (const [regionName, found] of entries) {
        if (!Array.isArray(found)) {
            return null;
        }
        const ids: string[] = [];
        for (const record of found) {
            const identifier = (record ?? {}) as Record<string, unknown>;
            ids.push(typeof identifier[field] === 'string' ? (identifier[field] as string) : String(identifier[field]));
        }
        out[regionName] = ids;
    }
    return out;
}

async function main() {
    const runs: Record<string, unknown> = {};

    for (const run of config.runs) {
        const sweep = (awsEc2 as unknown as Record<string, unknown>)[
            run.kind === 'volumes' ? 'getAllVolumes' : 'getAllSnapshots'
        ];
        if (typeof sweep !== 'function') {
            runs[run.label] = { ok: false, error: `the ${run.kind} sweep is no longer exported` };
            continue;
        }
        try {
            const creds = fromTemporaryCredentials({
                params: { RoleArn: run.roleArn, ExternalId: run.externalId },
                clientConfig: { region: 'us-east-1' },
            });
            const filters = [{ Name: 'tag:meteringcoDimensionId', Values: [run.dimensionId] }];
            const result = await (sweep as (creds: unknown, filters: unknown) => Promise<unknown>)(creds, filters);
            const regions = coverage(run.kind, result);
            if (regions === null) {
                runs[run.label] = { ok: false, error: 'the sweep did not return regions of records' };
            } else {
                runs[run.label] = { ok: true, regions };
            }
        } catch (error) {
            runs[run.label] = {
                ok: false,
                error: String((error as Error)?.message ?? error),
                stack: String((error as Error)?.stack ?? ''),
            };
        }
    }

    writeFileSync(config.out, JSON.stringify({ runs }, null, 2));
}

main().then(
    () => process.exit(0),
    (error) => {
        writeFileSync(config.out, JSON.stringify({ fatal: String(error?.stack ?? error) }, null, 2));
        process.exit(0);
    },
);
