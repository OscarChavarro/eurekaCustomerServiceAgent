import { Injectable } from '@nestjs/common';
import type {
  AssetResourceHeadProbeResult,
  AssetResourceProbePort
} from '../../application/ports/outbound/asset-resource-probe.port';

@Injectable()
export class FetchAssetResourceProbeAdapter implements AssetResourceProbePort {
  public async probeHead(url: string): Promise<AssetResourceHeadProbeResult> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(15_000)
      });

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        error: null
      };
    } catch (error) {
      return {
        ok: false,
        status: null,
        statusText: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
