type Html2PdfChain = {
  set: (opt: unknown) => Html2PdfChain;
  from: (element: HTMLElement) => Html2PdfChain;
  toPdf: () => Html2PdfChain;
  get: (key: "pdf" | string) => Promise<any>;
  save: () => Promise<void>;
};

export type Html2PdfFactory = () => Html2PdfChain;

export async function loadHtml2Pdf(): Promise<Html2PdfFactory> {
  const mod = await import("html2pdf.js");
  const factory = (mod as { default?: Html2PdfFactory }).default ?? (mod as unknown as Html2PdfFactory);
  return factory;
}
