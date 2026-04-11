export class FixFilePatternResult {
  constructor(
    public readonly resolvedFilePatternByConversationId: Map<string, string | null>,
    public readonly reviewedConversations: number,
    public readonly updatedConversations: number
  ) {}
}
