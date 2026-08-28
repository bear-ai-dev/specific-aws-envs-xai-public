import { AnalyticsQueryParamters } from '../client/privateClient/analytics';

export const ANALYTICS_PARAMETERS_INPUT: AnalyticsQueryParamters[] = [
    { start: '2022-03-01', end: '2023-03-01', metric: 'profitMargin' },
    { start: '2023-02-01', end: '2023-03-01', metric: 'profitMargin' },
    { start: '2023-01-01', end: '2023-03-01', metric: 'revenue' },
];
