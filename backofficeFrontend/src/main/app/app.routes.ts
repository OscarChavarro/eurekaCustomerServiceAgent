import { Routes } from '@angular/router';
import { AppShellChatComponent } from './shell/components/app/app-shell-chat.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'chat'
  },
  {
    path: 'chat/:phoneNumber',
    component: AppShellChatComponent
  },
  {
    path: 'chat',
    component: AppShellChatComponent
  },
  {
    path: 'time',
    component: AppShellChatComponent
  },
  {
    path: 'contacts',
    pathMatch: 'full',
    redirectTo: 'contacts/contacts-with-conversations'
  },
  {
    path: 'contacts/:page',
    component: AppShellChatComponent
  },
  {
    path: '**',
    redirectTo: 'chat'
  }
];
