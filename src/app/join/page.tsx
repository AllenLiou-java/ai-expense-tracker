import { JoinPage } from "@/components/JoinPage";

/** Invite links land here: /join?code=XXXXXXXX */
export default function Join(props: PageProps<"/join">) {
  // Passed down unawaited; only the code field waits for it, inside <Suspense>.
  return <JoinPage searchParams={props.searchParams} />;
}
