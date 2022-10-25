export const logger = {
    log: (...args: Array<any>) => console.log(`[${new Date().toISOString()}]:`, ...args),
    debug: (...args: Array<any>) => console.debug(`[${new Date().toISOString()}]:`, ...args),
    error: (...args: Array<any>) => console.error(`[${new Date().toISOString()}]:`, ...args),
    info: (...args: Array<any>) => console.info(`[${new Date().toISOString()}]:`, ...args),
}
