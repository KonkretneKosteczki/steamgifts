export interface ISteamgiftsService {
    run(): Promise<void>;
    reset(): void;
}
