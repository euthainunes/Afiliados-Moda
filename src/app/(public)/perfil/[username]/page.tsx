import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LookCard } from "@/components/looks/look-card";
import { getPublicProfile, listPublishedLooks } from "@/modules/looks/service";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getPublicProfile((await params).username);
  return profile ? { title: `${profile.displayName} (@${profile.username})` } : { title: "Perfil não encontrado", robots: { index: false } };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const profile = await getPublicProfile(username);
  if (!profile) notFound();
  const { looks } = await listPublishedLooks({ username: profile.username, pageSize: 48 });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header>
        <h1 className="font-display text-3xl font-semibold">{profile.displayName}</h1>
        <p className="text-muted">@{profile.username}</p>
        {profile.bio && <p className="mt-3 max-w-2xl">{profile.bio}</p>}
      </header>
      <h2 className="mt-10 text-lg font-semibold">Looks publicados ({looks.length})</h2>
      {looks.length === 0 ? (
        <p className="mt-4 text-muted">Nenhum look publicado ainda.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {looks.map(({ look, creator, items }) => (
            <li key={look.id}>
              <LookCard slug={look.slug!} title={look.title} creator={creator} items={items} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
