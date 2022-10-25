export function instanceOfObject(data: unknown): data is Record<string, any> {
    return typeof data === "object" && data !== null;
}
