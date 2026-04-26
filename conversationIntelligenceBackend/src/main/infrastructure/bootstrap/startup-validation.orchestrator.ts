import { Injectable } from '@nestjs/common';
import { BgeConnectivityStartupValidator } from './validators/bge-connectivity-startup.validator';
import { ContactsBackendConnectivityStartupValidator } from './validators/contacts-backend-connectivity-startup.validator';
import { LlmConnectivityStartupValidator } from './validators/llm-connectivity-startup.validator';
import { MongoConnectivityStartupValidator } from './validators/mongo-connectivity-startup.validator';
import { QdrantConnectivityStartupValidator } from './validators/qdrant-connectivity-startup.validator';

type StartupValidationSuccess = {
  validatorName: string;
  message: string;
};

type StartupValidationFailure = {
  validatorName: string;
  message: string;
};

export type StartupValidationResult = {
  successes: StartupValidationSuccess[];
  failure: StartupValidationFailure | null;
};

@Injectable()
export class StartupValidationOrchestrator {
  constructor(
    private readonly mongoConnectivityStartupValidator: MongoConnectivityStartupValidator,
    private readonly llmConnectivityStartupValidator: LlmConnectivityStartupValidator,
    private readonly contactsBackendConnectivityStartupValidator: ContactsBackendConnectivityStartupValidator,
    private readonly bgeConnectivityStartupValidator: BgeConnectivityStartupValidator,
    private readonly qdrantConnectivityStartupValidator: QdrantConnectivityStartupValidator
  ) {}

  public async validateAll(): Promise<StartupValidationResult> {
    const validators = [
      this.mongoConnectivityStartupValidator,
      this.llmConnectivityStartupValidator,
      this.contactsBackendConnectivityStartupValidator,
      this.bgeConnectivityStartupValidator,
      this.qdrantConnectivityStartupValidator
    ];
    const successes: StartupValidationSuccess[] = [];

    for (const validator of validators) {
      try {
        await validator.validate();
        successes.push({
          validatorName: validator.getName(),
          message: validator.getSuccessMessage()
        });
      } catch (error) {
        return {
          successes,
          failure: {
            validatorName: validator.getName(),
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }

    return {
      successes,
      failure: null
    };
  }
}
