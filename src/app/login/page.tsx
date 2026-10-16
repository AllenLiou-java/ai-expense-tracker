import { AuthForm } from "@/components/AuthForm";

// searchParams is passed down unawaited, so the form renders in the static shell.
export default function LoginPage(props: PageProps<"/login">) {
  return <AuthForm mode="login" searchParams={props.searchParams} />;
}
