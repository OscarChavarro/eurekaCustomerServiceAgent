import { promises as fs } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parentPort, workerData } from 'node:worker_threads';
import type { AudioTranscribeResult } from '../../application/use-cases/audio-transcribe/audio-transcribe.result';
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

const SUPPORTED_AUDIO_EXTENSIONS = ['opus', 'mp3', 'm4a'] as const;
type SupportedAudioExtension = (typeof SUPPORTED_AUDIO_EXTENSIONS)[number];

const context = createWorkerContext();
const waveformBarsAdapter = new WavefileAudioWaveformBarsAdapter();

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

  try {
    const downloadedAudio = await downloadAudioFileWithExtensionRetry(
      url,
      staticContext.tempBaseFilePath
    );
    tempAudioFilePath = downloadedAudio.tempAudioFilePath;
    downloadedAudio.attemptedTempAudioFilePaths.forEach((path) =>
      attemptedTempAudioFilePaths.add(path)
    );
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

async function downloadAudioFileWithExtensionRetry(
  originalUrl: string,
  tempBaseFilePath: string
): Promise<{ tempAudioFilePath: string; attemptedTempAudioFilePaths: Set<string> }> {
  const candidateUrls = buildRetryCandidateUrls(originalUrl);
  const attemptedTempAudioFilePaths = new Set<string>();
  let lastError: unknown = null;

  for (const candidateUrl of candidateUrls) {
    const extension = resolveAudioExtensionFromUrl(candidateUrl);
    const tempAudioFilePath = `${tempBaseFilePath}.${extension}`;
    attemptedTempAudioFilePaths.add(tempAudioFilePath);

    try {
      await downloadAudioFile(candidateUrl, tempAudioFilePath);
      return {
        tempAudioFilePath,
        attemptedTempAudioFilePaths
      };
    } catch (error) {
      lastError = error;
      await cleanupTempFile(tempAudioFilePath);
    }
  }

  const lastErrorMessage = lastError instanceof Error ? ` Last error: ${lastError.message}` : '';
  throw new Error(
    `Audio resource does not exist in extensions [.opus/.mp3/.m4a].${lastErrorMessage}`
  );
}

function buildRetryCandidateUrls(url: string): string[] {
  const originalExtension = resolveAudioExtensionFromUrl(url);
  if (!isSupportedAudioExtension(originalExtension)) {
    return [url];
  }

  const alternatives = SUPPORTED_AUDIO_EXTENSIONS.filter(
    (extension) => extension !== originalExtension
  );

  return [url, ...alternatives.map((extension) => replaceUrlAudioExtension(url, extension))];
}

function replaceUrlAudioExtension(url: string, targetExtension: SupportedAudioExtension): string {
  try {
    const parsed = new URL(url);
    const currentExtension = extname(parsed.pathname);

    if (currentExtension.length === 0) {
      return url;
    }

    parsed.pathname = `${parsed.pathname.slice(0, -currentExtension.length)}.${targetExtension}`;
    return parsed.toString();
  } catch {
    return url.replace(/\.[^./?#]+(?=([?#]|$))/, `.${targetExtension}`);
  }
}

function runWhisper(audioFilePath: string): { success: true } | { success: false; message: string } {
  const whisperModel = process.env.WHISPER_MODEL?.trim() || 'base';
  const outputDir = dirname(audioFilePath);
  const args = [
    audioFilePath,
    '--model',
    whisperModel,
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
