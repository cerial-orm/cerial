export interface Command {
  name: string;
  aliases: string[];
  description: string;
  run(args: string[]): Promise<void>;
}
