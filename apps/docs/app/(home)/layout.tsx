import { HomeLayout } from 'fumadocs-ui/layouts/home';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <HomeLayout
      nav={{ title: 'Cerial' }}
      links={[
        { text: 'Documentation', url: '/getting-started' },
      ]}
    >
      {children}
    </HomeLayout>
  );
}
