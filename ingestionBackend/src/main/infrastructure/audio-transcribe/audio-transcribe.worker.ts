import { promises as fs } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parentPort, workerData } from 'node:worker_threads';
import type { AudioTranscribeResult } from '../../application/use-cases/audio-transcribe/audio-transcribe.result';
import { ImazingMediaUrlCandidateService } from '../../application/use-cases/kwoledge-ingestion/imazing-media-url-candidate.service';
import { WavefileAudioWaveformBarsAdapter } from './wavefile-audio-waveform-bars.adapter';

type WorkerRequestMessage = {
  type: 'transcribe';
  jobId: number;
  url: string;
};

type WorkerResultMessage = {
  type: 'result';
  jobId: number;
  payload: AudioTranscribeResult;
};

type WorkerErrorMessage = {
  type: 'error';
  jobId: number;
  message: string;
};

type WhisperSegment = {
  start?: number;
  end?: number;
  text?: string;
};

type WhisperJsonPayload = {
  text?: string;
  language?: string;
  segments?: WhisperSegment[];
};

type WorkerStaticContext = {
  workerIndex: number;
  tempBaseFilePath: string;
  tempWavFilePath: string;
};

const SUPPORTED_AUDIO_EXTENSIONS = ['opus', 'mp3', 'm2a', 'm4a'] as const;
type SupportedAudioExtension = (typeof SUPPORTED_AUDIO_EXTENSIONS)[number];

const context = createWorkerContext();
const waveformBarsAdapter = new WavefileAudioWaveformBarsAdapter();
const mediaUrlCandidateService = new ImazingMediaUrlCandidateService();

if (!parentPort) {
  process.exit(1);
}

parentPort.on('message', (message: WorkerRequestMessage) => {
  void handleIncomingMessage(message);
});

async function handleIncomingMessage(message: WorkerRequestMessage): Promise<void> {
  if (!message || message.type !== 'transcribe') {
    return;
  }

  try {
    const payload = await transcribeUrlToPayload(message.url, context);
    const result: WorkerResultMessage = {
      type: 'result',
      jobId: message.jobId,
      payload
    };
    parentPort?.postMessage(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failureMessage: WorkerErrorMessage = {
      type: 'error',
      jobId: message.jobId,
      message: errorMessage
    };
    parentPort?.postMessage(failureMessage);
  }
}

async function transcribeUrlToPayload(
  url: string,
  staticContext: WorkerStaticContext
): Promise<AudioTranscribeResult> {
  const attemptedTempAudioFilePaths = new Set<string>();
  let tempAudioFilePath = '';
  const tempJsonFilePath = `${staticContext.tempBaseFilePath}.json`;
  let transcriptionText = '';
  let language = 'unknown';
  let totalTimeInSeconds = 0;
  let bars: number[] = [];
  let hasError = false;
  const decodedUrl = decodeUrlSafely(url);
  console.log(`[AudioTranscribeWorker-${staticContext.workerIndex}] Starting: "${decodedUrl}"`);

  try {
    const resolvedAudioUrl = await resolveDownloadableAudioUrl(url);
    const extension = resolveAudioExtensionFromUrl(resolvedAudioUrl);
    tempAudioFilePath = `${staticContext.tempBaseFilePath}.${extension}`;
    attemptedTempAudioFilePaths.add(tempAudioFilePath);
    await downloadAudioFile(resolvedAudioUrl, tempAudioFilePath);
    convertAudioToWav(tempAudioFilePath, staticContext.tempWavFilePath);
    bars = waveformBarsAdapter.buildFromWavFile(staticContext.tempWavFilePath, 100);
    const whisperRun = runWhisper(tempAudioFilePath);

    if (!whisperRun.success) {
      hasError = true;
      transcriptionText = whisperRun.message;
    } else {
      const whisperPayload = await readWhisperJson(tempJsonFilePath);
      const normalizedText = normalizeText(whisperPayload.text);
      transcriptionText = normalizedText;

      if (typeof whisperPayload.language === 'string' && whisperPayload.language.trim().length > 0) {
        language = whisperPayload.language.trim().toLowerCase();
      }

      totalTimeInSeconds = resolveDurationFromSegments(whisperPayload.segments);
    }
  } catch (error) {
    hasError = true;
    transcriptionText = error instanceof Error ? error.message : String(error);
  } finally {
    await Promise.all(
      Array.from(attemptedTempAudioFilePaths).map((path) => cleanupTempFile(path))
    );
    await cleanupTempFile(staticContext.tempWavFilePath);
    await cleanupTempFile(tempJsonFilePath);
    console.log(`[AudioTranscribeWorker-${staticContext.workerIndex}] Ended: "${decodedUrl}"`);
  }

  if (hasError) {
    return {
      type: 'noise',
      transcription: transcriptionText || 'Whisper transcription failed.',
      totalTimeInSeconds,
      language,
      bars
    };
  }

  const type: AudioTranscribeResult['type'] = transcriptionText.length > 0 ? 'voice' : 'empty';

  return {
    type,
    transcription: transcriptionText,
    totalTimeInSeconds,
    language,
    bars
  };
}

async function downloadAudioFile(url: string, targetPath: string): Promise<void> {
  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    throw new Error(
      `Could not download audio file from ${url}. Status ${response.status} ${response.statusText}.`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(targetPath, Buffer.from(arrayBuffer));
}

async function resolveDownloadableAudioUrl(url: string): Promise<string> {
  const candidateUrls = mediaUrlCandidateService.isSupportedAudioResourceUrl(url)
    ? mediaUrlCandidateService.getCandidateAudioUrls(url)
    : [url];

  const probeFailures: string[] = [];

  for (const candidateUrl of candidateUrls) {
    const probe = await probeHead(candidateUrl);
    if (!probe.ok) {
      const failureDetail =
        probe.error ??
        `Status ${probe.status ?? 'unknown'} ${probe.statusText ?? 'unknown error'}`;
      probeFailures.push(`${candidateUrl} -> ${failureDetail}`);
      continue;
    }

    if (candidateUrl !== url) {
      console.log(
        `[AudioTranscribeWorker-${context.workerIndex}] Resolved audio URL variant: ${decodeUrlSafely(url)} -> ${decodeUrlSafely(candidateUrl)}`
      );
    }

    return candidateUrl;
  }

  const failuresSummary = probeFailures.join(' | ');
  throw new Error(
    `Could not download audio file from ${url}. HEAD probe failed for all candidate URLs. ${failuresSummary}`
  );
}

async function probeHead(
  url: string
): Promise<{ ok: boolean; status: number | null; statusText: string | null; error: string | null }> {
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

function runWhisper(audioFilePath: string): { success: true } | { success: false; message: string } {
  const whisperModel = process.env.WHISPER_MODEL?.trim() || 'base';
  const outputDir = dirname(audioFilePath);
  const args = [
    audioFilePath,
    '--model',
    whisperModel,
    '--device',
    'cpu',
    '--output_format',
    'json',
    '--output_dir',
    outputDir,
    '--verbose',
    'False',
    '--fp16',
    'False'
  ];

  const execution = spawnSync('whisper', args, {
    encoding: 'utf-8',
    timeout: 300_000
  });

  if (execution.error) {
    return {
      success: false,
      message: `Unable to execute whisper: ${execution.error.message}`
    };
  }

  if (execution.status !== 0) {
    const details = execution.stderr?.trim() || execution.stdout?.trim() || 'unknown whisper error';
    return {
      success: false,
      message: `Whisper failed for file ${audioFilePath}. ${details}`
    };
  }

  return { success: true };
}

function convertAudioToWav(audioFilePath: string, wavFilePath: string): void {
  const args = [
    '-y',
    '-i',
    audioFilePath,
    '-ac',
    '1',
    '-ar',
    '16000',
    wavFilePath
  ];

  const execution = spawnSync('ffmpeg', args, {
    encoding: 'utf-8',
    timeout: 120_000
  });

  if (execution.error) {
    throw new Error(`Unable to execute ffmpeg: ${execution.error.message}`);
  }

  if (execution.status !== 0) {
    const details = execution.stderr?.trim() || execution.stdout?.trim() || 'unknown ffmpeg error';
    throw new Error(`ffmpeg failed converting audio to wav. ${details}`);
  }
}

function resolveAudioExtensionFromUrl(url: string): string {
  const pathname = safeParsePathname(url);
  const extension = extname(pathname).replace('.', '').toLowerCase();

  if (isSupportedAudioExtension(extension)) {
    return extension;
  }

  return 'opus';
}

function isSupportedAudioExtension(value: string): value is SupportedAudioExtension {
  return SUPPORTED_AUDIO_EXTENSIONS.includes(value as SupportedAudioExtension);
}

function safeParsePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function decodeUrlSafely(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

async function readWhisperJson(jsonPath: string): Promise<WhisperJsonPayload> {
  const raw = await fs.readFile(jsonPath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid Whisper JSON output.');
  }

  return parsed as WhisperJsonPayload;
}

function resolveDurationFromSegments(segments: WhisperSegment[] | undefined): number {
  if (!Array.isArray(segments) || segments.length === 0) {
    return 0;
  }

  let maxEnd = 0;
  for (const segment of segments) {
    if (!segment || typeof segment.end !== 'number' || !Number.isFinite(segment.end)) {
      continue;
    }
    if (segment.end > maxEnd) {
      maxEnd = segment.end;
    }
  }

  return Number(maxEnd.toFixed(3));
}

function normalizeText(text: string | undefined): string {
  if (typeof text !== 'string') {
    return '';
  }

  return text.trim();
}

async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore cleanup errors
  }
}

function createWorkerContext(): WorkerStaticContext {
  const rawWorkerIndex = (workerData as { workerIndex?: unknown } | undefined)?.workerIndex;
  const workerIndex =
    typeof rawWorkerIndex === 'number' && Number.isInteger(rawWorkerIndex) && rawWorkerIndex > 0
      ? rawWorkerIndex
      : 1;

  const tmpDir = process.env.TMPDIR?.trim() || '/tmp';
  const tempBaseFilePath = join(tmpDir, `audio-transcribe-worker-${workerIndex}`);
  const tempWavFilePath = join(tmpDir, `audio-transcribe-worker-${workerIndex}.wav`);

  return {
    workerIndex,
    tempBaseFilePath,
    tempWavFilePath
  };
}
