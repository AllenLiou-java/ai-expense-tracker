import { AuthForm } from "@/components/AuthForm";

// searchParams is passed down unawaited, so the form renders in the static shell.
export default function RegisterPage(props: PageProps<"/register">) {
  return <AuthForm mode="register" searchParams={props.searchParams} />;
}
