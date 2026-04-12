import { Routes } from '@angular/router';

export const CONTACTS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'contacts-with-conversations'
  },
  {
    path: ':page',
    loadComponent: () =>
      import('../shell/components/app/app-shell-chat.component').then((m) => m.AppShellChatComponent)
  }
];
