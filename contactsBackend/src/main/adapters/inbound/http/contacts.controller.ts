import { BadRequestException, Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ListGoogleContactsUseCase } from '../../../application/use-cases/02-contacts/list-google-contacts.use-case';
import { UpsertGoogleContactUseCase } from '../../../application/use-cases/02-contacts/upsert-google-contact.use-case';
import { UpsertContactRequest } from './dto/upsert-contact.request';

@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly listGoogleContactsUseCase: ListGoogleContactsUseCase,
    private readonly upsertGoogleContactUseCase: UpsertGoogleContactUseCase
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
      name: request.name.trim(),
      phoneNumber: request.phoneNumber.trim()
    });
  }
}
