import { notFound, redirect } from "next/navigation";
import { StudySessionClient } from "@/components/study/study-session-client";
import { getStudySession, startStudySession } from "@/server/study-service";

export default async function StudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const { id } = await params;
  const { session: sessionId } = await searchParams;

  if (!sessionId) {
    const session = await startStudySession(id);
    redirect(`/study-sets/${id}/study?session=${session.id}`);
  }

  const session = await getStudySession(sessionId);
  if (!session || session.studySetId !== id) {
    notFound();
  }

  return <StudySessionClient key={`${session.id}-${session.currentRound}-${session.currentIndex}-${session.status}`} initialSession={session} />;
}
