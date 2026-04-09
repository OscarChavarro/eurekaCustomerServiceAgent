import { IsString, MinLength } from 'class-validator';

export class UpsertContactRequest {
  @IsString()
  @MinLength(1)
  public readonly name!: string;

  @IsString()
  @MinLength(3)
  public readonly phoneNumber!: string;
}
