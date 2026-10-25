/**
 * pdf.js, loaded once and given its worker once, for everything that draws a PDF.
 *
 * Loaded only when there is a PDF to draw, because it is the size of the rest
 * of the application. The miniature under an answer and the reader on the
 * Artifacts and Research pages share the one worker: each starting its own was
 * a second copy of the parser for every document on the screen.
 */
type PdfJs = typeof import('pdfjs-dist');

let loading: Promise<PdfJs> | null = null;

export function loadPdfjs(): Promise<PdfJs> {
  loading ??= Promise.all([
    import('pdfjs-dist'),
    /*
     * Built by Vite as a worker, not handed over by URL: the file pdf.js ships
     * is `.mjs`, which a server that does not know the extension answers as
     * application/octet-stream, and a browser refuses a module worker of that
     * type. Vite's own worker build is a `.js` file like the rest of the bundle.
     */
    import('pdfjs-dist/build/pdf.worker.min.mjs?worker'),
  ])
    .then(([pdfjs, Worker]) => {
      if (pdfjs.GlobalWorkerOptions.workerPort === null) {
        pdfjs.GlobalWorkerOptions.workerPort = new Worker.default();
      }
      return pdfjs;
    })
    .catch((cause: unknown) => {
      // A chunk that failed to arrive is asked for again next time rather than
      // remembered as failed for the life of the tab.
      loading = null;
      throw cause;
    });
  return loading;
}
