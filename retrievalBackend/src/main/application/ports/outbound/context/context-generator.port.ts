export type ContextGeneratorMessage = {
  role: 'user';
  content: string;
};

export interface ContextGenerator {
  generateContext(messages: ContextGeneratorMessage[]): Promise<string>;
}
