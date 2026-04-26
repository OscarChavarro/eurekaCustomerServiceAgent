import { IsNotEmpty, IsString } from 'class-validator';

export class MergeMediaRequest {
  @IsString()
  @IsNotEmpty()
  sourceDiffPath!: string;

  @IsString()
  @IsNotEmpty()
  targetMergedPath!: string;
}
