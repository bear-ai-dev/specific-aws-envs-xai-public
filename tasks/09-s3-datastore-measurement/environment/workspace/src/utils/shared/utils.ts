/**
 * Group array of objects by given keys
 * @param keys keys to be grouped by
 * @param array objects to be grouped
 * @returns an object with objects in `array` grouped by `keys`
 * @see <https://gist.github.com/mikaello/06a76bca33e5d79cdd80c162d7774e9c>
 */
export const ArrayGroupBy =
    <T>(keys: (keyof T)[]) =>
    (array: T[]): Record<string, T[]> =>
        array.reduce((objectsByKeyValue, obj) => {
            const value = keys.map((key) => obj[key]).join('-');
            objectsByKeyValue[value] = (objectsByKeyValue[value] || []).concat(obj);
            return objectsByKeyValue;
        }, {} as Record<string, T[]>);
