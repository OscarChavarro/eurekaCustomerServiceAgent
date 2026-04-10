import { Routes } from '@angular/router';
import { AppShellChatComponent } from './shell/components/app/app-shell-chat.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'chat'
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
    component: AppShellChatComponent
  },
  {
    path: 'contacts/:phoneSlug',
    component: AppShellChatComponent
  },
  {
    path: '**',
    redirectTo: 'chat'
  }
];
