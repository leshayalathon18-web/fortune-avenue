import { redirect } from "next/navigation";

export default function Home() {
  redirect("/opening.html?release=12");
}
