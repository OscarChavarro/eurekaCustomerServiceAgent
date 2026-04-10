import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { cpus } from 'node:os';
import { join } from 'node:path';
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
  private readonly logger = new Logger(AudioTranscribeWorkerPoolService.name);
  private readonly workers: Worker[] = [];
  private readonly idleWorkerIndexes: number[] = [];
  private readonly inFlightByWorkerIndex = new Map<number, QueueJob>();
  private readonly queue: QueueJob[] = [];
  private nextJobId = 1;
  private dispatching = false;
  private initialized = false;
  private shuttingDown = false;
  private readonly workerScriptPath = join(__dirname, 'audio-transcribe.worker.js');

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

    const worker = new Worker(this.workerScriptPath, {
      workerData: {
        workerIndex: index + 1
      }
    });
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
          this.completeJob(nextJob, this.buildNoWorkersPayload(nextJob.url));
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
        this.logger.log(
          `[AudioTranscribeWorker-${workerIndex + 1}] Processing URL: ${this.toDecodedUrl(nextJob.url)}`
        );

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

  private buildNoWorkersPayload(url: string): AudioTranscribeResult {
    void url;
    return {
      type: 'noise',
      transcription:
        'Transcription workers are disabled (transcriptionWorkersCapacity resolved to 0).',
      totalTimeInSeconds: 0,
      language: 'unknown',
      bars: []
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

  private toDecodedUrl(url: string): string {
    try {
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  }
}
