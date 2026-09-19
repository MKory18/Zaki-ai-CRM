import { redirect } from 'next/navigation';

/** Entry point: the dashboard is the first screen after country + store. */
export default function Home() {
  redirect('/dashboard');
}
