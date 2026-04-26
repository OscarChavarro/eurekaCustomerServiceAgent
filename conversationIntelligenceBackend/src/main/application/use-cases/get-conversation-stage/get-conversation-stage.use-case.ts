import { Injectable } from '@nestjs/common';
import {
  CustomerStage,
  GetConversationStageCommand,
  GetConversationStageResult
} from './get-conversation-stage.types';

@Injectable()
export class GetConversationStageUseCase {
  public async execute(command: GetConversationStageCommand): Promise<GetConversationStageResult> {
    return {
      conversationId: command.conversationId,
      currentStage: CustomerStage.UNDEFINED,
      previousStage: []
    };
  }
}
