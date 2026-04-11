import { IsOptional, IsString } from 'class-validator';

export class UpsertContactRequest {
  @IsOptional()
  @IsString()
  public readonly currentName?: string;

  @IsOptional()
  @IsString()
  public readonly currentPhoneNumber?: string;

  @IsString()
  public readonly newName!: string;

  @IsString()
  public readonly newPhoneNumber!: string;
}
