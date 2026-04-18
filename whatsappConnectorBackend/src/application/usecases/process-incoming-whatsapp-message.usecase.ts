import { Injectable } from '@nestjs/common';
import { ProcessIncomingWhatsappMessageContext } from 'src/application/context/process-incoming-whatsapp-message.context';
import { AgentControlMessageProcessingStrategy } from 'src/application/strategies/agent-control-message-processing.strategy';
import { DummyMessageProcessingStrategy } from 'src/application/strategies/dummy-message-processing.strategy';
import { MessageProcessingStrategy } from 'src/application/strategies/message-processing.strategy';

@Injectable()
export class ProcessIncomingWhatsappMessageUseCase {
  private readonly strategies: MessageProcessingStrategy[];

  constructor(
    agentControlStrategy: AgentControlMessageProcessingStrategy,
    dummyStrategy: DummyMessageProcessingStrategy
  ) {
    this.strategies = [agentControlStrategy, dummyStrategy];
  }

  async execute(context: ProcessIncomingWhatsappMessageContext): Promise<void> {
    if (context.messageReceiveMode === 'SILENT') {
      return;
    }

    const strategy = this.strategies.find((candidate) => candidate.canHandle(context));
    if (!strategy) {
      return;
    }

    await strategy.execute(context);
  }
}
