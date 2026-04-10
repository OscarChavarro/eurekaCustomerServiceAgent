import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ContactsDirectoryStore } from './core/state/contacts-directory.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.sass',
})
export class App {
  private readonly contactsDirectoryStore = inject(ContactsDirectoryStore);

  constructor() {
    void this.contactsDirectoryStore.ensureLoaded();
  }
}
