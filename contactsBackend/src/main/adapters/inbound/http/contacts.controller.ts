import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  ParseArrayPipe,
  Put,
  Query
} from '@nestjs/common';
import { DeleteGoogleContactsUseCase } from '../../../application/use-cases/02-contacts/delete-google-contacts.use-case';
import { ListGoogleContactsUseCase } from '../../../application/use-cases/02-contacts/list-google-contacts.use-case';
import { UpsertGoogleContactUseCase } from '../../../application/use-cases/02-contacts/upsert-google-contact.use-case';
import { DeleteContactRequestItem } from './dto/delete-contact.request';
import { UpsertContactRequest } from './dto/upsert-contact.request';

@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly listGoogleContactsUseCase: ListGoogleContactsUseCase,
    private readonly upsertGoogleContactUseCase: UpsertGoogleContactUseCase,
    private readonly deleteGoogleContactsUseCase: DeleteGoogleContactsUseCase
  ) {}

  @Get()
  public async listContacts(@Query('pageSize') pageSizeRaw: string | undefined): Promise<unknown> {
    const parsed = pageSizeRaw ? Number.parseInt(pageSizeRaw, 10) : 100;

    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 1000) {
      throw new BadRequestException('Query parameter "pageSize" must be an integer between 1 and 1000.');
    }

    return this.listGoogleContactsUseCase.execute({ pageSize: parsed });
  }

  @Put('upsert')
  public async upsertContact(@Body() request: UpsertContactRequest): Promise<unknown> {
    return this.upsertGoogleContactUseCase.execute({
      currentName: request.currentName?.trim(),
      currentPhoneNumber: request.currentPhoneNumber?.trim(),
      newName: request.newName.trim(),
      newPhoneNumber: request.newPhoneNumber.trim()
    });
  }

  @Delete()
  public async deleteContacts(
    @Body(
      new ParseArrayPipe({
        items: DeleteContactRequestItem
      })
    )
    request: DeleteContactRequestItem[]
  ): Promise<unknown> {
    return this.deleteGoogleContactsUseCase.execute({
      contactsToDelete: request.map((item) => ({
        nameToDelete: this.normalizeOptionalString(item.nameToDelete),
        phoneToDelete: this.normalizeOptionalString(item.phoneToDelete)
      }))
    });
  }

  private normalizeOptionalString(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
