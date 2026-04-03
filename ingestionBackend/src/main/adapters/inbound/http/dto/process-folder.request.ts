import { IsNotEmpty, IsString } from 'class-validator';

export class ProcessFolderRequest {
  @IsString()
  @IsNotEmpty()
  folderPath!: string;
}
