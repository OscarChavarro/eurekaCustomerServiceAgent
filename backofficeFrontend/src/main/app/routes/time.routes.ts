import { Routes } from '@angular/router';

export const TIME_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('../shell/components/app/app-shell-chat.component').then((m) => m.AppShellChatComponent)
  }
];
