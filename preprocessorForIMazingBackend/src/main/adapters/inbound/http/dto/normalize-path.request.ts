import { IsNotEmpty, IsString } from 'class-validator';

export class NormalizePathRequest {
  @IsString()
  @IsNotEmpty()
  path!: string;
}
