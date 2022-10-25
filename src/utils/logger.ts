export function customLogger(...args: Array<any>): void {
    process.stdout.write(`[${new Date().toISOString()}]: ${args.join(" ")}\n`);
}
