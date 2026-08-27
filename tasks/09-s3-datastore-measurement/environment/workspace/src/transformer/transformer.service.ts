import { CACHE_MANAGER, Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import * as snappy from 'snappyjs';
import * as protobuf from 'protobufjs';
import chunk from 'lodash/chunk';
import fetch from 'cross-fetch';
import { Cache } from 'cache-manager';
import { AgentMeasurementService } from '../agent-measurement/agent-measurement.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { AuditScope } from '../audit/entities/audit.interface';
@Injectable()
export class TransformerService {
    constructor(
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
        private userService: UsersService,
        private agentMeasurementService: AgentMeasurementService
    ) {}

    async recieveAgentMeasurement(request) {
        Logger.log(`Starting Request`);
        const msg = [];
        request.on('data', (chunk) => {
            if (chunk) {
                msg.push(chunk);
            }
        });
        request.on('end', async () => {
            const dataBlob = Buffer.concat(msg);
            const { sub } = request.user;
            Logger.log(`Request Sub ${sub}`);
            const res = await protobuf.load('src/transformer/remote.proto');
            const memes = res.lookupType('WriteRequest');
            try {
                let bufferUncompressed;
                Logger.log(`Data Blog size ${dataBlob.length}`);
                const uncompressed = snappy.uncompress(dataBlob, {
                    asBuffer: true,
                });

                if (typeof uncompressed === 'string') {
                    bufferUncompressed = Buffer.from(uncompressed);
                } else {
                    bufferUncompressed = uncompressed;
                }

                const results = memes.decode(bufferUncompressed);
                const { timeseries, ...rest } = results.toJSON();
                Logger.log(JSON.stringify(rest)); // Seeing if there is anything else I'm missing
                const chunkedTimeSeries = chunk(timeseries, 30);
                let businessID = await this.cacheManager.get(sub);
                if (businessID) {
                    Logger.log(`BusinessID: ${businessID} for subject: ${sub} in cache`);
                }
                if (!businessID) {
                    const { data } = await this.userService.findOne({ subject: sub });
                    const { businessID: requestedID } = data[0];
                    Logger.log(`Setting BusinessID: ${requestedID} in cache`);
                    await this.cacheManager.set(sub, requestedID, 604800); // One week cache time
                    businessID = await this.cacheManager.get(sub);
                }

                Logger.log('Business ID for agent data to be commited', businessID);
                await Promise.all(
                    chunkedTimeSeries.map(async (timeseries) => {
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        //@ts-ignore
                        const response = await this.agentMeasurementService.create({ timeseries, businessID });
                        Logger.log('Commited data to influx', response);
                    })
                );

                Logger.log('end of request');
            } catch (error) {
                AuditService.publishEvent({
                    message: 'Failed to decode protobuf form meteringco agent',
                    data: [{ errorMessage: error.message, stack: error.stack }],
                    topic: AuditScope.ERROR,
                });
            }
        });

        return { message: 'Uploaded' };
    }
}
