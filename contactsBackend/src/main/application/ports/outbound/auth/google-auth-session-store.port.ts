export type GoogleTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiryDateMs?: number;
  tokenType?: string;
  scope?: string;
};

export interface GoogleAuthSessionStorePort {
  savePendingState(state: string): Promise<void>;
  consumePendingState(state: string): Promise<boolean>;
  getTokenSet(): Promise<GoogleTokenSet | null>;
  saveTokenSet(tokenSet: GoogleTokenSet): Promise<void>;
}
