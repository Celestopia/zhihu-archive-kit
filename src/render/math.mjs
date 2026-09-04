import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import TexError from "@mathjax/src/js/input/tex/TexError.js";
import { SVG } from "@mathjax/src/js/output/svg.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import "@mathjax/src/js/util/asyncLoad/esm.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js";
import "@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js";
import "@mathjax/src/js/input/tex/braket/BraketConfiguration.js";
import "@mathjax/src/js/input/tex/cancel/CancelConfiguration.js";
import "@mathjax/src/js/input/tex/cases/CasesConfiguration.js";
import "@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js";
import "@mathjax/src/js/input/tex/bbox/BboxConfiguration.js";
import "@mathjax/src/js/input/tex/mhchem/MhchemConfiguration.js";
import "@mathjax/src/js/input/tex/physics/PhysicsConfiguration.js";
import "@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js";
import { escapeAttr, escapeHtml } from "./html-utils.mjs";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
// Explicit glyph paths survive copying a formula between preview documents.
const svg = new SVG({ fontCache: "none" });
const packages = ["base", "ams", "newcommand", "mathtools", "braket", "cancel", "cases", "boldsymbol", "bbox", "mhchem", "physics", "textmacros"];
let queue = Promise.resolve();

function createDocument() {
  return mathjax.document("", {
    InputJax: new TeX({
      packages,
      maxBuffer: 20 * 1024,
      maxMacros: 1000,
      formatError(_jax, error) { throw error; }
    }),
    OutputJax: svg
  });
}

const stylesheetDocument = createDocument();

export function renderMathCss() {
  return adaptor.cssText(svg.styleSheet(stylesheetDocument)) + `
    mjx-container[jax="SVG"][display="true"] { overflow-x: auto; overflow-y: hidden; }
    .math-error { color: #b42318; white-space: pre-wrap; overflow-wrap: anywhere; }
    .math-error--display { display: block; text-align: center; margin: 1em 0; }
  `;
}

export function renderFormula(tex, display, raw) {
  // SVG output keeps mutable conversion state; serialize use across concurrent requests.
  const result = queue.then(async () => {
    try {
      // TeX macros and labels are isolated to one expression, not shared across authors.
      const document = createDocument();
      const node = await document.convertPromise(tex, { display });
      adaptor.setAttribute(node, "data-tex", tex);
      adaptor.setAttribute(node, "role", "math");
      adaptor.setAttribute(node, "aria-label", tex);
      for (const image of adaptor.tags(node, "svg")) adaptor.setAttribute(image, "aria-hidden", "true");
      return adaptor.outerHTML(node);
    } catch (error) {
      if (!(error instanceof TexError)) throw error;
      console.warn(`[Zhihu Archive Kit] formula could not be rendered: ${error.message}`);
      return `<span class="math-error${display ? " math-error--display" : ""}" title="${escapeAttr(error.message)}">${escapeHtml(raw)}</span>`;
    }
  });
  queue = result.catch(() => {});
  return result;
}
