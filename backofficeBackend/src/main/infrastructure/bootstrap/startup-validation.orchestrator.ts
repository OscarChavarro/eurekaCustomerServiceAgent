import { Injectable } from '@nestjs/common';
import { MongoConnectivityStartupValidator } from './validators/mongo-connectivity-startup.validator';

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
    private readonly mongoConnectivityStartupValidator: MongoConnectivityStartupValidator
  ) {}

  public async validateAll(): Promise<StartupValidationResult> {
    const validators = [this.mongoConnectivityStartupValidator];
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
