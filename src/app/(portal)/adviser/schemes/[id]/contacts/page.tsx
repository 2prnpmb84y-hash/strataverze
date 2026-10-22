import { connection } from "next/server";
import { getContactsForScheme } from "@/lib/queries/contacts";
import { ContactsCard } from "../_sections/contacts-card";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";

export default async function ContactsSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;

  const contacts = await getContactsForScheme(id);

  return <ContactsCard id={id} contacts={contacts} />;
}
