export enum SupportedCurrencies {
    USD = 'USD',
    EUR = 'EUR',
}
export type SupportedOfferingCurrency = Exclude<SupportedCurrencies, SupportedCurrencies.EUR>;
export enum SupportedOfferingCurrencyEnum {
    USD = 'USD',
}
