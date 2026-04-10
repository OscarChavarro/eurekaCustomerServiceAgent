import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { AudioTranscribeWorkerPoolPort } from '../../application/ports/outbound/audio-transcribe-worker-pool.port';
import type { AudioTranscribeResult } from '../../application/use-cases/audio-transcribe/audio-transcribe.result';
import { ServiceConfig } from '../config/service.config';

type QueueJob = {
  id: number;
  url: string;
  onCompleted?: (payload: AudioTranscribeResult) => void;
  resolve?: (payload: AudioTranscribeResult) => void;
  reject?: (error: Error) => void;
};

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

type WorkerResponseMessage = WorkerResultMessage | WorkerErrorMessage;

@Injectable()
export class AudioTranscribeWorkerPoolService
implements AudioTranscribeWorkerPoolPort, OnModuleInit, OnModuleDestroy {
  private static readonly WORKER_CODE = `
    const { parentPort } = require('node:worker_threads');
    function cpuHeavyLoop(input) {
      let acc = 0;
      const seed = input.length + 17;
      for (let i = 0; i < 750000; i += 1) {
        acc = (acc + ((i * seed) % 97)) % 1000003;
      }
      return acc;
    }
    function buildPayload(url) {
      const cpuScore = cpuHeavyLoop(url);
      const bars = [0.12,0.28,0.42,0.31,0.36,0.57,0.66,0.58,0.44,0.33,0.26,0.18].map((v, index) => {
        const jitter = ((cpuScore + index * 13) % 9) * 0.004;
        return Number((Math.min(1, v + jitter)).toFixed(3));
      });
      return {
        type: 'voice',
        transcription: 'Mock transcription generated from worker thread. Pending real transcription pipeline.',
        totalTimeInSeconds: 10,
        language: 'es',
        bars
      };
    }
    if (!parentPort) {
      process.exit(1);
    }
    parentPort.on('message', (message) => {
      if (!message || message.type !== 'transcribe') {
        return;
      }
      try {
        const payload = buildPayload(String(message.url || ''));
        parentPort.postMessage({ type: 'result', jobId: message.jobId, payload });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Unknown worker error';
        parentPort.postMessage({ type: 'error', jobId: message.jobId, message: messageText });
      }
    });
  `;

  private readonly logger = new Logger(AudioTranscribeWorkerPoolService.name);
  private readonly workers: Worker[] = [];
  private readonly idleWorkerIndexes: number[] = [];
  private readonly inFlightByWorkerIndex = new Map<number, QueueJob>();
  private readonly queue: QueueJob[] = [];
  private nextJobId = 1;
  private dispatching = false;
  private initialized = false;
  private shuttingDown = false;

  constructor(private readonly serviceConfig: ServiceConfig) {}

  public onModuleInit(): void {
    this.initializeWorkerPool();
  }

  public async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    await Promise.all(this.workers.map((worker) => worker.terminate()));
    this.workers.length = 0;
    this.idleWorkerIndexes.length = 0;
    this.inFlightByWorkerIndex.clear();
    this.queue.length = 0;
  }

  public enqueueBlocking(url: string): Promise<AudioTranscribeResult> {
    return new Promise<AudioTranscribeResult>((resolve, reject) => {
      this.enqueueJob({
        id: this.nextJobId++,
        url,
        resolve,
        reject
      });
    });
  }

  public enqueueNonBlocking(
    url: string,
    onCompleted: (payload: AudioTranscribeResult) => void
  ): void {
    this.enqueueJob({
      id: this.nextJobId++,
      url,
      onCompleted
    });
  }

  private enqueueJob(job: QueueJob): void {
    this.queue.push(job);
    this.dispatchQueuedJobs();
  }

  private initializeWorkerPool(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    const workerCount = this.resolveWorkerCount();
    if (workerCount <= 0) {
      this.logger.warn(
        'transcriptionWorkersCapacity resolved to 0 worker threads. Jobs will run on main thread fallback.'
      );
      return;
    }

    for (let index = 0; index < workerCount; index += 1) {
      this.createWorker(index);
    }

    this.logger.log(`Audio transcription worker pool initialized with ${workerCount} worker threads.`);
  }

  private resolveWorkerCount(): number {
    const cpuCores = cpus().length;
    const capacity = this.serviceConfig.transcriptionWorkersCapacity;

    if (capacity === 100) {
      return cpuCores;
    }

    return Math.floor((cpuCores * capacity) / 100);
  }

  private createWorker(index: number): void {
    this.removeIdleWorkerIndex(index);

    const worker = new Worker(AudioTranscribeWorkerPoolService.WORKER_CODE, { eval: true });
    this.workers[index] = worker;
    this.idleWorkerIndexes.push(index);

    worker.on('message', (message: WorkerResponseMessage) => {
      this.onWorkerMessage(index, message);
    });

    worker.on('error', (error: Error) => {
      this.onWorkerError(index, error);
    });

    worker.on('exit', (code: number) => {
      this.onWorkerExit(index, code);
    });
  }

  private onWorkerMessage(index: number, message: WorkerResponseMessage): void {
    const currentJob = this.inFlightByWorkerIndex.get(index);
    this.inFlightByWorkerIndex.delete(index);
    this.idleWorkerIndexes.push(index);

    if (!currentJob) {
      this.dispatchQueuedJobs();
      return;
    }

    if (message.type === 'error') {
      this.failJob(currentJob, new Error(message.message));
      this.dispatchQueuedJobs();
      return;
    }

    if (message.jobId !== currentJob.id) {
      this.failJob(
        currentJob,
        new Error(`Worker job mismatch: expected ${currentJob.id}, got ${message.jobId}`)
      );
      this.dispatchQueuedJobs();
      return;
    }

    this.completeJob(currentJob, message.payload);
    this.dispatchQueuedJobs();
  }

  private onWorkerError(index: number, error: Error): void {
    const currentJob = this.inFlightByWorkerIndex.get(index);
    this.inFlightByWorkerIndex.delete(index);

    if (currentJob) {
      this.failJob(currentJob, error);
    }

    this.logger.error(`Audio transcription worker ${index} failed: ${error.message}`);
  }

  private onWorkerExit(index: number, code: number): void {
    this.removeIdleWorkerIndex(index);

    const currentJob = this.inFlightByWorkerIndex.get(index);
    this.inFlightByWorkerIndex.delete(index);

    if (currentJob) {
      this.failJob(currentJob, new Error(`Audio transcription worker exited with code ${code}`));
    }

    if (code === 0 || this.shuttingDown) {
      return;
    }

    this.logger.warn(`Restarting audio transcription worker ${index} after non-zero exit (${code}).`);
    this.createWorker(index);
    this.dispatchQueuedJobs();
  }

  private dispatchQueuedJobs(): void {
    if (this.dispatching) {
      return;
    }

    this.dispatching = true;
    try {
      while (this.queue.length > 0) {
        if (this.workers.length === 0) {
          const nextJob = this.queue.shift();
          if (!nextJob) {
            break;
          }
          this.completeJob(nextJob, this.buildMainThreadMockPayload(nextJob.url));
          continue;
        }

        const workerIndex = this.idleWorkerIndexes.shift();
        if (workerIndex === undefined) {
          break;
        }

        const nextJob = this.queue.shift();
        if (!nextJob) {
          this.idleWorkerIndexes.unshift(workerIndex);
          break;
        }

        const worker = this.workers[workerIndex];
        if (!worker) {
          this.failJob(nextJob, new Error(`Worker index ${workerIndex} not available.`));
          continue;
        }

        this.inFlightByWorkerIndex.set(workerIndex, nextJob);

        const requestMessage: WorkerRequestMessage = {
          type: 'transcribe',
          jobId: nextJob.id,
          url: nextJob.url
        };
        worker.postMessage(requestMessage);
      }
    } finally {
      this.dispatching = false;
    }
  }

  private buildMainThreadMockPayload(url: string): AudioTranscribeResult {
    const urlLength = url.length;
    const bars = [0.14, 0.3, 0.41, 0.34, 0.26, 0.47, 0.61, 0.56, 0.43, 0.31, 0.24, 0.17].map(
      (value, index) => {
        const jitter = ((urlLength + index * 11) % 7) * 0.004;
        return Number((Math.min(1, value + jitter)).toFixed(3));
      }
    );

    return {
      type: 'voice',
      transcription:
        'Mock transcription generated on main thread fallback. Pending real transcription pipeline.',
      totalTimeInSeconds: 10,
      language: 'es',
      bars
    };
  }

  private completeJob(job: QueueJob, payload: AudioTranscribeResult): void {
    if (job.resolve) {
      job.resolve(payload);
      return;
    }

    if (job.onCompleted) {
      queueMicrotask(() => {
        job.onCompleted?.(payload);
      });
    }
  }

  private failJob(job: QueueJob, error: Error): void {
    if (job.reject) {
      job.reject(error);
      return;
    }

    this.logger.error(`Audio transcription job failed: ${error.message}`);
  }

  private removeIdleWorkerIndex(index: number): void {
    const filtered = this.idleWorkerIndexes.filter((value) => value !== index);
    this.idleWorkerIndexes.length = 0;
    this.idleWorkerIndexes.push(...filtered);
  }
}
