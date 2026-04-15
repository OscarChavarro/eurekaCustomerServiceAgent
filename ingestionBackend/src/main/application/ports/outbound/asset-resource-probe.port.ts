export type AssetResourceHeadProbeResult = {
  ok: boolean;
  status: number | null;
  statusText: string | null;
  error: string | null;
  responseUrl: string | null;
};

export interface AssetResourceProbePort {
  probeHead(url: string): Promise<AssetResourceHeadProbeResult>;
}
