import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/login');
}

// GitHub Actions deploy test
