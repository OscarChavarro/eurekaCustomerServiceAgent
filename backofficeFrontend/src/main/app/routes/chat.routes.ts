import { Routes } from '@angular/router';

export const CHAT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('../shell/components/app/app-shell-chat.component').then((m) => m.AppShellChatComponent)
  },
  {
    path: ':phoneNumber',
    loadComponent: () =>
      import('../shell/components/app/app-shell-chat.component').then((m) => m.AppShellChatComponent)
  }
];
