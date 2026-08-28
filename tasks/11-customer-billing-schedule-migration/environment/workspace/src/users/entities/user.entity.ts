import { Point } from '@influxdata/influxdb-client';
import { InfluxService } from '../../influx/influx.service';

export class UserEntity {
    public static _measurement = 'UserData';
    subject: string;
    businessID: string;
    accountExpiryDate: string;
    temp: boolean;

    constructor({ subject, businessID, accountExpiryDate, temp }) {
        this.subject = subject;
        this.businessID = businessID;
        this.accountExpiryDate = accountExpiryDate;
        this.temp = temp;
    }

    // Should not use `this` context is a pure transformation of the data and doesn't alter the state
    static transformer(userEntity: UserEntity, influxService: InfluxService): Array<Point> {
        // Take in a pricing package entity
        // Return a collection of points to be commited to TSDB

        const userPoint = influxService.getPoint(UserEntity._measurement);
        userPoint.tag('subject', userEntity.subject);
        userPoint.tag('businessID', userEntity.businessID);
        userPoint.tag('accountExpiryDate', userEntity.accountExpiryDate);
        if (userEntity.temp) {
            userPoint.tag('temp', userEntity.temp.toString());
        }

        userPoint.stringField('userStatus', 'live');

        return [userPoint];
    }

    static dbModelToEntity(dbModel) {
        if (dbModel.length > 1) {
            throw new Error('Invalid User model Information, check DB');
        }
        const [{ subject, businessID, accountExpiryDate, temp }] = dbModel;
        return new UserEntity({ subject, businessID, accountExpiryDate, temp });
    }
}
