import { Component } from '@angular/core';

import { AppShellChatComponent } from './shell/components/app/app-shell-chat.component';

@Component({
  selector: 'app-root',
  imports: [AppShellChatComponent],
  templateUrl: './app.html',
  styleUrl: './app.sass',
})
export class App {}
