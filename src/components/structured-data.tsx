export function StructuredData({ nodes }: { nodes: object[] }) {
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes });
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json.replace(/</g, '\\u003c') }}/>;
}
