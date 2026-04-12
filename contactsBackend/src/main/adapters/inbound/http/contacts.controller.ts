import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  ParseArrayPipe,
  Post,
  Query
} from '@nestjs/common';
import { CreateGoogleContactUseCase } from '../../../application/use-cases/02-contacts/create-google-contact.use-case';
import { DeleteGoogleContactsUseCase } from '../../../application/use-cases/02-contacts/delete-google-contacts.use-case';
import { ListGoogleContactsUseCase } from '../../../application/use-cases/02-contacts/list-google-contacts.use-case';
import { PatchGoogleContactUseCase } from '../../../application/use-cases/02-contacts/patch-google-contact.use-case';
import { CreateContactRequest } from './dto/create-contact.request';
import { DeleteContactRequestItem } from './dto/delete-contact.request';
import { PatchContactRequest } from './dto/patch-contact.request';

@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly listGoogleContactsUseCase: ListGoogleContactsUseCase,
    private readonly createGoogleContactUseCase: CreateGoogleContactUseCase,
    private readonly patchGoogleContactUseCase: PatchGoogleContactUseCase,
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

  @Post()
  public async createContact(@Body() request: CreateContactRequest): Promise<unknown> {
    return this.createGoogleContactUseCase.execute({
      names: request.names,
      emailAddresses: request.emailAddresses,
      phoneNumbers: request.phoneNumbers,
      biographies: request.biographies
    });
  }

  @Patch(':resourceName')
  public async patchContact(
    @Param('resourceName') resourceName: string,
    @Body() request: PatchContactRequest
  ): Promise<unknown> {
    return this.patchGoogleContactUseCase.execute({
      resourceName,
      names: request.names,
      emailAddresses: request.emailAddresses,
      phoneNumbers: request.phoneNumbers,
      biographies: request.biographies
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
