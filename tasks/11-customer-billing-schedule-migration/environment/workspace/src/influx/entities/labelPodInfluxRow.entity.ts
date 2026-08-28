import { BaseInfluxTable } from './baseInfluxTable.entity';

export class LabelPodInfluxRow extends BaseInfluxTable {
    public _measurement: 'meteringco_kube_pod_labels';
    public businessID: string;
    public label_meteringco_dimension_id: string;
    public label_meteringco_customer_id: string;
    public pod: string;
}
