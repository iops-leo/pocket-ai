import { redirect } from 'next/navigation';

export default function Home() {
  // Simple redirect to the dashboard for MVP
  redirect('/login');
}
