// /documents — replaced by /qspp (Library + Incidents, with manager mode). Old links and bookmarks redirect there,
// keeping ?tab=incidents.
export async function getServerSideProps({ query }) {
  const tab = query.tab === "incidents" ? "?tab=incidents" : "";
  return { redirect: { destination: `/qspp${tab}`, permanent: false } };
}

export default function DocumentsRedirect() {
  return null;
}
