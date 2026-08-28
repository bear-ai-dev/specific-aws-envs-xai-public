export const joinedResults = (
    pods: Array<{
        table: string;
        _value: any;
        pod: string;
        _measurement: string;
        label_meteringco_application_id?: string;
        label_meteringco_service_id?: string;
    }>,
    delimeterForApplicationIDServiceIDMap?: string
): Record<string, any> => {
    return pods.reduce((acc, { table, _value, pod, _measurement, ...rest }) => {
        // Join pods with their labels, this done outside of influx for now
        if (!acc[pod]) {
            acc[pod] = {};
        }
        if (_measurement === 'meteringco_kube_pod_labels') {
            const { label_meteringco_application_id, label_meteringco_service_id } = rest;
            if (label_meteringco_service_id) {
                acc[pod] = { ...acc[pod], serviceId: label_meteringco_service_id };
            }
            if (label_meteringco_application_id) {
                acc[pod] = {
                    ...acc[pod],
                    applicationId: delimeterForApplicationIDServiceIDMap
                        ? `${delimeterForApplicationIDServiceIDMap}${label_meteringco_application_id}`
                        : label_meteringco_application_id,
                };
            }
        }
        if (_measurement === 'meteringco_kube_pod_container_status_running') {
            acc[pod] = { ...acc[pod], usage: _value, ...rest };
        }
        return acc;
    }, {});
};
