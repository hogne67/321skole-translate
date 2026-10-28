import { trustDocumentUrl, type PrintDocument } from "@/lib/trust/printDocuments";

export function TrustDocumentPackage({ locale, documents }: { locale: string; documents: PrintDocument[] }) {
  return (
    <div className="trust-print-only" data-document-package="true">
      {documents.map((document, index) => (
        <article key={document.id} id={`report-document-${document.id}`} className="trust-print-document" data-full-document={document.id}>
          <h1>{index + 1}. {document.title}</h1>
          <p className="trust-document-source"><a href={trustDocumentUrl(locale, document.path)}>{trustDocumentUrl(locale, document.path)}</a></p>
          <p className="trust-document-lead">{document.lead}</p>
          {document.sections.map((section, sectionIndex) => (
            <section key={`${sectionIndex}-${section.title}`} id={section.id ? `report-${document.id}-${section.id}` : undefined}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
              {section.points.length ? <ul>{section.points.map((point, pointIndex) => <li key={pointIndex}>{point}</li>)}</ul> : null}
              {section.links?.length ? <p className="trust-document-source trust-document-references">{section.links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</p> : null}
            </section>
          ))}
        </article>
      ))}
    </div>
  );
}
