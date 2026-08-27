import { Logger } from '@nestjs/common';
import { InfluxService } from '../../influx/influx.service';

export class EC2CostEntity {
    // Create defintions for the labels in the constructor of this class
    public static _measurement = 'ec2Cost';

    public unitCost: number;
    public cpu: number;
    public ram: number;
    public podId: string;
    public meteringcoId: string;
    public businessID: string;
    public timeDelta: number;

    constructor({ unitCost, cpu, ram, podId, meteringcoId, timeDelta, businessID }: EC2CostEntity) {
        this.unitCost = unitCost;
        this.cpu = cpu;
        this.ram = ram;
        this.podId = podId;
        this.meteringcoId = meteringcoId;
        this.timeDelta = timeDelta;
        this.businessID = businessID;
    }
    private static readonly logger = new Logger(EC2CostEntity.name);
    public static determineUnitPrice({
        instanceType,
        priceDocument,
        isReserved,
        ReservedInstanceEntity,
    }: {
        instanceType: string;
        priceDocument: OnDemandInstanceEntity;
        isReserved: boolean;
        ReservedInstanceEntity: any;
    }) {
        if (!isReserved) {
            return priceDocument.pricePerUnit;
        } else {
            const { recurringCharges } = ReservedInstanceEntity;
            const [{ Amount }] = JSON.parse(recurringCharges);
            return Amount;
        }
    }
    public static calculateCost({ unitPrice, timeDelta }) {
        return unitPrice * timeDelta;
    }

    public static transformer(eC2CostEntity: EC2CostEntity, influxService: InfluxService) {
        const { getPoint } = influxService;
        const { businessID, unitCost, cpu, ram, podId, meteringcoId, timeDelta } = eC2CostEntity;
        console.log(JSON.stringify(eC2CostEntity));
        const point = getPoint(EC2CostEntity._measurement);
        point.tag('businessID', businessID);
        point.tag('cpu', cpu.toString());
        point.tag('ram', ram.toString());
        point.tag('podId', podId);
        point.tag('meteringcoId', meteringcoId);
        point.tag('timeDelta', timeDelta.toString());

        point.floatField('unitCost', unitCost);

        return point;
    }

    public static dbModelToEntity(dbModel: any) {
        const { businessID, _value, cpu, ram, podId, meteringcoId, timeDelta } = dbModel;
        return new EC2CostEntity({
            businessID,
            unitCost: _value,
            cpu,
            ram,
            podId,
            meteringcoId,
            timeDelta,
        });
    }

    public static averageCostsConverterToDto(dbModel) {
        const { _value, cpu, ram } = dbModel;
        return {
            cpu: cpu.toString(),
            ram: ram.toString(),
            averageUnitCost: _value.toString(),
        };
    }
}

export class OnDemandInstanceEntity {
    public unit: string;
    public pricePerUnit: string;

    constructor({ unit, pricePerUnit }) {
        this.unit = unit;
        this.pricePerUnit = pricePerUnit;
    }
}
